const { generateReply } = require("./llm");

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 20000;

const sessions = new Map();

async function nextBotReply({ contactId, inboundText }) {
  if (!contactId) {
    throw new Error("contactId is required");
  }

  cleanupExpiredSessions();
  const session = getSession(contactId);

  // Global cancel/reset
  const normalized = normalizeInput(inboundText || "");
  if (normalized === "reiniciar" || normalized === "reset") {
    sessions.delete(contactId);
    return {
      actions: [
        { type: "text", text: "Memoria del agente borrada. ¡Hola de nuevo!" }
      ]
    };
  }

  // Add user message to history
  session.history.push({ role: "user", content: inboundText || "[Mensaje multimedia]" });
  
  // Keep only last 10 messages to avoid token bloat
  if (session.history.length > 10) {
    session.history = session.history.slice(session.history.length - 10);
  }

  touchSession(contactId, session);

  // Get agent reply
  const replyText = await generateReply(session.history);

  // Add assistant reply to history
  session.history.push({ role: "assistant", content: replyText });
  touchSession(contactId, session);

  return {
    actions: [
      { type: "text", text: replyText }
    ]
  };
}

function getSession(contactId) {
  const existing = sessions.get(contactId);
  if (existing) {
    return existing;
  }

  const fresh = {
    history: [],
    updatedAt: Date.now()
  };

  sessions.set(contactId, fresh);
  trimSessions();

  return fresh;
}

function touchSession(contactId, session) {
  session.updatedAt = Date.now();
  sessions.set(contactId, session);
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [contactId, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(contactId);
    }
  }
}

function trimSessions() {
  if (sessions.size <= MAX_SESSIONS) {
    return;
  }
  const amountToDelete = sessions.size - MAX_SESSIONS;
  let removed = 0;
  for (const contactId of sessions.keys()) {
    sessions.delete(contactId);
    removed += 1;
    if (removed >= amountToDelete) {
      break;
    }
  }
}

function normalizeInput(input) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resetSessions() {
  sessions.clear();
}

module.exports = {
  nextBotReply,
  _private: {
    resetSessions,
    normalizeInput
  }
};
