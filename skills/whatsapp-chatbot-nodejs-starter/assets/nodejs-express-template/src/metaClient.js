const axios = require("axios");
const { config } = require("./config");

const metaHttp = axios.create({
  baseURL: `https://graph.facebook.com/${config.metaApiVersion}`,
  headers: {
    Authorization: `Bearer ${config.whatsappAccessToken}`,
    "Content-Type": "application/json"
  },
  timeout: 10000
});

async function sendTextMessage(to, text) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text }
  };

  const response = await metaHttp.post(
    `/${config.whatsappPhoneNumberId}/messages`,
    payload
  );

  return response.data;
}

module.exports = { sendTextMessage };
