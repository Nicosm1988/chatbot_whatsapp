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

function mockResponse(to) {
  return {
    messaging_product: "whatsapp",
    contacts: [{ wa_id: to }],
    messages: [{ id: `mock-${Date.now()}` }]
  };
}

async function sendTextMessage(to, text) {
  if (config.whatsappMockMode) {
    console.info("MOCK sendTextMessage", { to, text });
    return mockResponse(to);
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text }
  };

  try {
    const response = await metaHttp.post(`/${config.whatsappPhoneNumberId}/messages`, payload);
    console.log(`✅ Mensaje enviado a ${to} correctamente.`);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(`❌ Error enviando a ${to}:`, error.response.status, error.response.data);
    } else {
      console.error(`❌ Error enviando a ${to}:`, error.message);
    }
    throw error;
  }
}

async function sendInteractiveButtons(to, text, buttons) {
  if (config.whatsappMockMode) {
    console.info("MOCK sendInteractiveButtons", { to, text, buttons });
    return mockResponse(to);
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: (buttons || []).map(btn => ({
          type: "reply",
          reply: { id: btn.id, title: btn.title }
        }))
      }
    }
  };

  try {
    const response = await metaHttp.post(`/${config.whatsappPhoneNumberId}/messages`, payload);
    console.log(`✅ Botones interactivos enviados a ${to}.`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error enviando botones a ${to}:`, error.response?.data || error.message);
    throw error;
  }
}

async function sendInteractiveList(to, text, buttonText, sections) {
  if (config.whatsappMockMode) {
    console.info("MOCK sendInteractiveList", { to, text, buttonText, sections });
    return mockResponse(to);
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text },
      action: {
        button: buttonText || "Ver opciones",
        sections: Array.isArray(sections) ? sections : []
      }
    }
  };

  try {
    const response = await metaHttp.post(`/${config.whatsappPhoneNumberId}/messages`, payload);
    console.log(`✅ Lista interactiva enviada a ${to}.`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error enviando lista a ${to}:`, error.response?.data || error.message);
    throw error;
  }
}

async function sendImageMessage(to, imageUrl, caption) {
  if (config.whatsappMockMode) {
    console.info("MOCK sendImageMessage", { to, imageUrl, caption });
    return mockResponse(to);
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: {
      link: imageUrl
    }
  };

  if (caption) {
    payload.image.caption = caption;
  }

  try {
    const response = await metaHttp.post(`/${config.whatsappPhoneNumberId}/messages`, payload);
    console.log(`✅ Imagen enviada a ${to}.`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error enviando imagen a ${to}:`, error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendImageMessage
};
