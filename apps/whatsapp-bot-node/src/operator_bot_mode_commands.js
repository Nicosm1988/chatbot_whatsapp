"use strict";

const COMMANDS = new Map([
  ["activa el bot inicial", { mode: "holding", publicName: "Bot inicial" }],
  ["activar el bot inicial", { mode: "holding", publicName: "Bot inicial" }],
  ["activa bot inicial", { mode: "holding", publicName: "Bot inicial" }],
  ["activar bot inicial", { mode: "holding", publicName: "Bot inicial" }],
  ["activa el bot completo", { mode: "chatbot", publicName: "Bot completo" }],
  ["activar el bot completo", { mode: "chatbot", publicName: "Bot completo" }],
  ["activa bot completo", { mode: "chatbot", publicName: "Bot completo" }],
  ["activar bot completo", { mode: "chatbot", publicName: "Bot completo" }]
]);

function normalizeOperatorCommand(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^[\s¡!¿?.,;:]+|[\s¡!¿?.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBotModeCommand(value) {
  const command = COMMANDS.get(normalizeOperatorCommand(value));
  return command ? { ...command } : null;
}

function normalizeWhatsAppUserId(value) {
  const rawValue =
    value && typeof value === "object"
      ? value._serialized || value.user || value.id || ""
      : value;
  return String(rawValue || "")
    .trim()
    .replace(/@[^@\s]+$/i, "")
    .replace(/\D/g, "");
}

function isOperatorSelfChat(contactId, ownWhatsAppId) {
  const contactUserId = normalizeWhatsAppUserId(contactId);
  const ownUserId = normalizeWhatsAppUserId(ownWhatsAppId);
  return Boolean(contactUserId && ownUserId && contactUserId === ownUserId);
}

function buildBotModeConfirmation(command) {
  if (command?.mode === "holding") {
    return "✅ Bot inicial activado. Las conversaciones nuevas recibirán una sola bienvenida y quedarán como Aguardando ser atendido.";
  }

  return "✅ Bot completo activado. Las conversaciones nuevas usarán el flujo completo de atención.";
}

module.exports = {
  parseBotModeCommand,
  isOperatorSelfChat,
  buildBotModeConfirmation,
  _private: {
    normalizeOperatorCommand,
    normalizeWhatsAppUserId
  }
};
