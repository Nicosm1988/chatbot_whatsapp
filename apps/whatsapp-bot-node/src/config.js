const dotenv = require("dotenv");

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

const whatsappMockMode = readBoolean(process.env.WHATSAPP_MOCK_MODE, false);

const config = {
  port: Number(process.env.PORT || 3000),
  metaApiVersion: process.env.META_API_VERSION || "v22.0",
  whatsappAccessToken: whatsappMockMode
    ? process.env.WHATSAPP_ACCESS_TOKEN || "mock-token"
    : requireEnv("WHATSAPP_ACCESS_TOKEN"),
  whatsappPhoneNumberId: whatsappMockMode
    ? process.env.WHATSAPP_PHONE_NUMBER_ID || "mock-phone-number-id"
    : requireEnv("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappWebhookVerifyToken: requireEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET || "",
  whatsappMockMode,
  openaiApiKey: process.env.OPENAI_API_KEY || ""
};

module.exports = { config };
