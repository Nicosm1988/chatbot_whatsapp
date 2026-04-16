const { MessageMedia } = require("whatsapp-web.js");

const { config } = require("./config");
const { combineChoiceLabel, indexToChoiceToken } = require("./choice_format");
const { getClient, getIsReady } = require("./whatsappClient");

const recentOutboundFingerprints = new Map();
const OUTBOUND_DEDUPE_WINDOW_MS = 3000;
const recentBotSentMessageIds = new Map();
const BOT_SENT_ID_TTL_MS = 10 * 60 * 1000;
const recentBotOutboundTextFingerprints = new Map();
const BOT_OUTBOUND_TEXT_TTL_MS = 15 * 1000;

function buildFallbackMessageId(prefix = "web") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function extractResponseMessageId(response, prefix = "web") {
  const directSerialized = String(response?.id?._serialized || "").trim();
  if (directSerialized) {
    return directSerialized;
  }

  const directId = String(response?.id || "").trim();
  if (directId) {
    return directId;
  }

  return buildFallbackMessageId(prefix);
}

function formatToId(to) {
  if (typeof to !== "string" || !to.trim()) {
    throw new Error("recipient is required");
  }

  const normalized = to.trim();
  if (normalized.includes("@")) {
    return normalized;
  }

  return `${normalized}@c.us`;
}

function buildButtonFallbackText(text, buttons) {
  const lines = [String(text || "").trim(), "", "*Opciones*"];

  for (const [index, button] of (buttons || []).entries()) {
    lines.push(`*${indexToChoiceToken(index)}) ${combineChoiceLabel(button?.title, button?.description)}*`);
  }

  lines.push("");
  lines.push("*Respond\u00e9 con la letra de la opci\u00f3n.*");
  return lines.join("\n").trim();
}

function normalizeSectionTitle(title) {
  return String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function renderFallbackChoiceLabel(row, sectionTitle) {
  const title = String(row?.title || "").trim();
  const description = String(row?.description || "").trim();
  if (!description) {
    return title;
  }

  if (normalizeSectionTitle(sectionTitle) === "productos") {
    return combineChoiceLabel(title, description);
  }

  if (/^[A-ZÁÉÍÓÚÜÑ¿]/u.test(description)) {
    const safeTitle = /[.!?]$/.test(title) ? title : `${title}.`;
    return `${safeTitle} ${description}`.trim();
  }

  return combineChoiceLabel(title, description);
}

function buildListFallbackText(text, sections) {
  const lines = [String(text || "").trim(), "", "*Opciones*"];
  let globalIndex = 0;

  for (const section of Array.isArray(sections) ? sections : []) {
    const rows = Array.isArray(section?.rows) ? section.rows : [];
    if (!rows.length) {
      continue;
    }

    const sectionTitle = String(section?.title || "").trim();
    const normalizedSectionTitle = normalizeSectionTitle(sectionTitle);

    if (sectionTitle && normalizedSectionTitle !== "opciones") {
      lines.push("");
      lines.push(`*${section.title}*`);
    }

    for (const row of rows) {
      const label = renderFallbackChoiceLabel(row, sectionTitle);
      const line = `${indexToChoiceToken(globalIndex)}) ${label}`;
      lines.push(normalizedSectionTitle === "productos" ? `*${line}*` : line);
      globalIndex += 1;
    }
  }

  lines.push("");
  lines.push("*Respond\u00e9 con la letra de la opci\u00f3n.*");
  return lines.join("\n").trim();
}

function buildOutboundRecipientFingerprintKey(to) {
  return String(to || "")
    .trim()
    .replace(/@[^@\s]+$/i, "");
}

function normalizeOutboundTextFingerprint(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

function buildRecentBotOutboundTextFingerprint(to, text) {
  const normalizedTo = buildOutboundRecipientFingerprintKey(to);
  const normalizedText = normalizeOutboundTextFingerprint(text);
  if (!normalizedTo || !normalizedText) {
    return "";
  }

  return `${normalizedTo}::${normalizedText}`;
}

function rememberRecentBotOutboundText(to, text, now = Date.now()) {
  const fingerprint = buildRecentBotOutboundTextFingerprint(to, text);
  if (!fingerprint) {
    return "";
  }

  recentBotOutboundTextFingerprints.set(fingerprint, now);
  trimRecentBotOutboundTextFingerprints(now);
  return fingerprint;
}

async function sendTextMessage(to, text) {
  if (config.whatsappMockMode) {
    console.info("MOCK sendTextMessage", { to, text });
    return { messages: [{ id: `mock-${Date.now()}` }] };
  }

  if (!getIsReady()) {
    throw new Error("whatsapp-web.js client is not ready");
  }

  const normalizedTo = formatToId(to);
  const normalizedText = String(text || "").trim().replace(/\s+/g, " ");
  const outboundFingerprint = `${buildOutboundRecipientFingerprintKey(normalizedTo)}::${normalizedText}`;
  const now = Date.now();
  const previousSentAt = recentOutboundFingerprints.get(outboundFingerprint) || 0;

  if (normalizedText && now - previousSentAt < OUTBOUND_DEDUPE_WINDOW_MS) {
    console.info("SKIP duplicate outbound web message", { to: normalizedTo, text: normalizedText });
    return { messages: [{ id: `dedupe-${now}` }] };
  }

  recentOutboundFingerprints.set(outboundFingerprint, now);
  rememberRecentBotOutboundText(normalizedTo, normalizedText, now);
  const client = getClient();
  const response = await client.sendMessage(normalizedTo, text, { sendSeen: false });
  const sentId = extractResponseMessageId(response, "web-text");
  if (sentId) {
    recentBotSentMessageIds.set(sentId, now);
  }
  console.log(`OK Mensaje enviado a ${to} correctamente.`);
  trimRecentBotSentIds(now);
  return { messages: [{ id: sentId }] };
}

async function sendInteractiveButtons(to, text, buttons) {
  return sendTextMessage(to, buildButtonFallbackText(text, buttons));
}

async function sendInteractiveList(to, text, _buttonText, sections) {
  return sendTextMessage(to, buildListFallbackText(text, sections));
}

async function sendImageMessage(to, imageUrl, caption) {
  if (config.whatsappMockMode) {
    console.info("MOCK sendImageMessage", { to, imageUrl, caption });
    return { messages: [{ id: `mock-${Date.now()}` }] };
  }

  if (!getIsReady()) {
    throw new Error("whatsapp-web.js client is not ready");
  }

  const media = await MessageMedia.fromUrl(imageUrl);
  const client = getClient();
  const response = await client.sendMessage(formatToId(to), media, { caption, sendSeen: false });
  const sentId = extractResponseMessageId(response, "web-image");
  if (sentId) {
    recentBotSentMessageIds.set(sentId, Date.now());
  }
  console.log(`OK Imagen enviada a ${to}.`);
  return { messages: [{ id: sentId }] };
}

function trimRecentBotSentIds(now = Date.now()) {
  for (const [messageId, sentAt] of recentBotSentMessageIds.entries()) {
    if (now - Number(sentAt || 0) > BOT_SENT_ID_TTL_MS) {
      recentBotSentMessageIds.delete(messageId);
    }
  }
}

function trimRecentBotOutboundTextFingerprints(now = Date.now()) {
  for (const [fingerprint, sentAt] of recentBotOutboundTextFingerprints.entries()) {
    if (now - Number(sentAt || 0) > BOT_OUTBOUND_TEXT_TTL_MS) {
      recentBotOutboundTextFingerprints.delete(fingerprint);
    }
  }
}

function wasBotSentMessageId(messageId) {
  const normalizedId = String(messageId || "").trim();
  if (!normalizedId) {
    return false;
  }

  trimRecentBotSentIds(Date.now());
  return recentBotSentMessageIds.has(normalizedId);
}

function wasRecentBotOutboundText(to, text, now = Date.now()) {
  trimRecentBotOutboundTextFingerprints(now);
  const fingerprint = buildRecentBotOutboundTextFingerprint(to, text);
  if (!fingerprint) {
    return false;
  }

  return recentBotOutboundTextFingerprints.has(fingerprint);
}

module.exports = {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendImageMessage,
  _private: {
    formatToId,
    buildButtonFallbackText,
    buildListFallbackText,
    buildOutboundRecipientFingerprintKey,
    buildRecentBotOutboundTextFingerprint,
    extractResponseMessageId,
    wasBotSentMessageId,
    wasRecentBotOutboundText,
    rememberRecentBotOutboundText,
    trimRecentBotOutboundTextFingerprints,
    trimRecentBotSentIds
  }
};
