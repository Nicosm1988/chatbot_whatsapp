const dotenv = require("dotenv");

dotenv.config();

function requireEnv(name) {
  const rawValue = process.env[name];
  const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
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
  port: Number((process.env.PORT || "3000").trim()),
  metaApiVersion: (process.env.META_API_VERSION || "v22.0").trim(),
  whatsappAccessToken: whatsappMockMode
    ? (process.env.WHATSAPP_ACCESS_TOKEN || "mock-token").trim()
    : requireEnv("WHATSAPP_ACCESS_TOKEN"),
  whatsappPhoneNumberId: whatsappMockMode
    ? (process.env.WHATSAPP_PHONE_NUMBER_ID || "mock-phone-number-id").trim()
    : requireEnv("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappWebhookVerifyToken: requireEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  whatsappAppSecret: (process.env.WHATSAPP_APP_SECRET || "").trim(),
  whatsappMockMode,
  agenticMode: readBoolean(process.env.AGENTIC_MODE, false),
  openaiApiKey: (process.env.OPENAI_API_KEY || "").trim(),
};

module.exports = { config };
