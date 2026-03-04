const dotenv = require("dotenv");

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  port: Number(process.env.PORT || 3000),
  metaApiVersion: process.env.META_API_VERSION || "v22.0",
  whatsappAccessToken: requireEnv("WHATSAPP_ACCESS_TOKEN"),
  whatsappPhoneNumberId: requireEnv("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappWebhookVerifyToken: requireEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET || ""
};

module.exports = { config };
