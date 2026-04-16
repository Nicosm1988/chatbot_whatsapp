const { config } = require("./config");
const cloudMetaClient = require("./cloudMetaClient");
const webTextClient = require("./webTextClient");

function getActiveTransport() {
  return config.whatsappTransport === "web" ? webTextClient : cloudMetaClient;
}

async function sendTextMessage(to, text) {
  return getActiveTransport().sendTextMessage(to, text);
}

async function sendInteractiveButtons(to, text, buttons) {
  return getActiveTransport().sendInteractiveButtons(to, text, buttons);
}

async function sendInteractiveList(to, text, buttonText, sections) {
  return getActiveTransport().sendInteractiveList(to, text, buttonText, sections);
}

async function sendImageMessage(to, imageUrl, caption) {
  return getActiveTransport().sendImageMessage(to, imageUrl, caption);
}

module.exports = {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendImageMessage,
  _private: {
    getActiveTransport,
    webTextClient
  }
};
