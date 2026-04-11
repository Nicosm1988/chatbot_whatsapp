#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const dotenv = require("dotenv");
const axios = require("axios");

const rootDir = path.resolve(__dirname, "..");

loadEnvFile(".env");
loadEnvFile(".env.production", true);
loadEnvFile(".env.local", true);

const metaApiVersion = readEnv("META_API_VERSION");
const whatsappAccessToken = readEnv("WHATSAPP_ACCESS_TOKEN");
const whatsappPhoneNumberId = readEnv("WHATSAPP_PHONE_NUMBER_ID");
const whatsappWebhookVerifyToken = readEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
const whatsappBusinessAccountId = readEnv("WHATSAPP_BUSINESS_ACCOUNT_ID");
const baseUrl = resolveBaseUrl();

async function main() {
  console.log("1) Deploying to Vercel production...");
  runCommand("npx", ["vercel", "--prod", "--yes"]);

  console.log(`2) Checking service health at ${baseUrl}/health ...`);
  const health = await axios.get(`${baseUrl}/health`, { timeout: 15000 });
  console.log(JSON.stringify(health.data));
  if (health.status !== 200 || health.data?.ok !== true) {
    throw new Error("health_check_failed");
  }

  console.log(`3) Checking runtime readiness at ${baseUrl}/api/system/ready ...`);
  const ready = await axios.get(`${baseUrl}/api/system/ready`, { timeout: 15000 });
  console.log(JSON.stringify(ready.data));
  if (ready.status !== 200 || ready.data?.ok !== true) {
    throw new Error("runtime_not_ready");
  }
  if (ready.data?.security?.webhookSignatureHardened !== true) {
    console.warn(
      `Webhook signature is not fully hardened yet (mode=${ready.data?.security?.webhookSignatureMode || "unknown"}).`
    );
  }

  console.log("4) Validating webhook verification endpoint...");
  const verify = await axios.get(`${baseUrl}/webhook`, {
    timeout: 15000,
    params: {
      "hub.mode": "subscribe",
      "hub.verify_token": whatsappWebhookVerifyToken,
      "hub.challenge": "12345"
    },
    responseType: "text"
  });
  console.log(verify.data);
  if (verify.status !== 200 || String(verify.data).trim() !== "12345") {
    throw new Error("webhook_verify_failed");
  }

  console.log("5) Syncing Meta callback URL...");
  const syncResponse = await axios.post(
    `https://graph.facebook.com/${metaApiVersion}/${whatsappBusinessAccountId}/subscribed_apps`,
    new URLSearchParams({
      subscribed_fields: "messages",
      override_callback_uri: `${baseUrl}/webhook`,
      verify_token: whatsappWebhookVerifyToken
    }),
    {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );
  console.log(JSON.stringify(syncResponse.data));
  if (syncResponse.data?.success !== true) {
    throw new Error("meta_callback_sync_failed");
  }

  console.log("6) Reading callback URL currently configured in Meta...");
  const callbackConfig = await axios.get(
    `https://graph.facebook.com/${metaApiVersion}/${whatsappPhoneNumberId}`,
    {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`
      },
      params: {
        fields: "webhook_configuration"
      }
    }
  );
  console.log(JSON.stringify(callbackConfig.data));
  const callbackUrl = String(callbackConfig.data?.webhook_configuration?.application || "");
  if (!callbackUrl) {
    console.warn("Meta callback URL could not be verified from phone-number fields.");
  }

  console.log(`Done. Fixed webhook base URL: ${baseUrl}`);
}

function loadEnvFile(fileName, override = false) {
  const filePath = path.join(rootDir, fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
}

function readEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function resolveBaseUrl() {
  const explicit = String(process.env.WEBHOOK_BASE_URL || "").trim().replace(/\/+$/, "");
  if (explicit) {
    return explicit;
  }

  const projectPath = path.join(rootDir, ".vercel", "project.json");
  if (!fs.existsSync(projectPath)) {
    throw new Error("Missing .vercel/project.json and WEBHOOK_BASE_URL");
  }

  const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  const projectName = String(project?.projectName || "").trim();
  if (!projectName) {
    throw new Error("Missing projectName in .vercel/project.json");
  }

  return `https://${projectName}.vercel.app`;
}

function runCommand(command, args) {
  let result;

  if (process.platform === "win32") {
    const escaped = [command, ...args].map(escapeWindowsArgument).join(" ");
    result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", escaped], {
      cwd: rootDir,
      stdio: "inherit"
    });
  } else {
    result = spawnSync(command, args, {
      cwd: rootDir,
      stdio: "inherit"
    });
  }

  if (result.status !== 0) {
    throw new Error(`command_failed:${command}`);
  }
}

function escapeWindowsArgument(value) {
  const stringValue = String(value || "");
  if (!/[ \t"]/u.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
