const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');

async function syncWebhook() {
  if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
  dotenv.config();

  const META_API_VERSION = process.env.META_API_VERSION;
  const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const baseUrl = 'https://whatsapp-bot-node-chatbot1.vercel.app';

  console.log(`Syncing webhook to ${baseUrl}/webhook...`);

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/${WHATSAPP_BUSINESS_ACCOUNT_ID}/subscribed_apps`,
      new URLSearchParams({
        subscribed_fields: 'messages',
        override_callback_uri: `${baseUrl}/webhook`,
        verify_token: WHATSAPP_WEBHOOK_VERIFY_TOKEN
      }),
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    console.log('Sync Response:', response.data);
  } catch (err) {
    console.error('Failed to sync webhook:', err.response?.data || err.message);
  }
}

syncWebhook();
