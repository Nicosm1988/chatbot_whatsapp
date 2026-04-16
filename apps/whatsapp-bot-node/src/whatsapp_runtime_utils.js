"use strict";

function normalizeIncomingControlText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function shouldInvalidateQueuedInboundMessages(text) {
  const normalized = normalizeIncomingControlText(text);
  if (!normalized) {
    return false;
  }

  const directMatches = new Set([
    "menu",
    "inicio",
    "opciones",
    "volver al inicio",
    "comenzar nuevamente desde el inicio",
    "comenzar nuevamente",
    "comenzar de nuevo",
    "reiniciar",
    "reinicio",
    "hola",
    "hello",
    "buenas",
    "buen dia",
    "buenas tardes",
    "buenas noches"
  ]);

  return (
    directMatches.has(normalized) ||
    /^hola\b/.test(normalized) ||
    /^hello\b/.test(normalized) ||
    /^buen(a|as)\b/.test(normalized) ||
    /^buen dia\b/.test(normalized)
  );
}

function stripWhatsAppSuffix(contactId) {
  return String(contactId || "").trim().replace(/@[^@\s]+$/i, "");
}

function normalizeTransportContactId(contactId) {
  const rawValue =
    contactId && typeof contactId === "object" && typeof contactId._serialized === "string"
      ? contactId._serialized
      : contactId;
  return String(rawValue || "").trim();
}

function buildContactIdCandidates(contactId) {
  const raw = normalizeTransportContactId(contactId);
  const bare = stripWhatsAppSuffix(raw);
  if (!bare) {
    return [];
  }

  const candidates = [raw, bare, `${bare}@lid`, `${bare}@c.us`];
  return [...new Set(candidates.filter(Boolean))];
}

function buildPreferredContactIdCandidates(contactId) {
  const raw = normalizeTransportContactId(contactId);
  const bare = stripWhatsAppSuffix(raw);
  if (!bare) {
    return [];
  }

  if (/@lid$/i.test(raw)) {
    return [...new Set([raw, `${bare}@c.us`, bare].filter(Boolean))];
  }

  if (/@c\.us$/i.test(raw)) {
    return [...new Set([raw, `${bare}@lid`, bare].filter(Boolean))];
  }

  return [...new Set([`${bare}@lid`, `${bare}@c.us`, bare].filter(Boolean))];
}

function matchesContactIdVariant(left, right) {
  const leftCandidates = new Set(buildContactIdCandidates(left));
  const rightCandidates = buildContactIdCandidates(right);
  return rightCandidates.some(candidate => leftCandidates.has(candidate));
}

function buildInboundQueueKey(contactId) {
  const raw = normalizeTransportContactId(contactId);
  if (!raw) {
    return "";
  }

  return stripWhatsAppSuffix(raw);
}

function pruneCollectedWebIncomingMessages(messages, options = {}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const droppedIds = [];
  const latestResetIndexByContact = new Map();

  safeMessages.forEach((message, index) => {
    const contactId = buildInboundQueueKey(
      String(options.normalizeContactId?.(message?.from) || message?.from || "").trim()
    );
    if (!contactId) {
      return;
    }

    if (shouldInvalidateQueuedInboundMessages(message?.body || "")) {
      latestResetIndexByContact.set(contactId, index);
    }
  });

  if (!latestResetIndexByContact.size) {
    return {
      kept: safeMessages,
      droppedIds
    };
  }

  const kept = safeMessages.filter((message, index) => {
    const contactId = buildInboundQueueKey(
      String(options.normalizeContactId?.(message?.from) || message?.from || "").trim()
    );
    if (!contactId) {
      return true;
    }

    const resetIndex = latestResetIndexByContact.get(contactId);
    if (resetIndex == null || index >= resetIndex) {
      return true;
    }

    const messageId = String(message?.id || "").trim();
    if (messageId) {
      droppedIds.push(messageId);
      if (typeof options.markDroppedMessageId === "function") {
        options.markDroppedMessageId(messageId);
      }
    }
    return false;
  });

  return {
    kept,
    droppedIds
  };
}

module.exports = {
  normalizeIncomingControlText,
  normalizeTransportContactId,
  shouldInvalidateQueuedInboundMessages,
  stripWhatsAppSuffix,
  buildContactIdCandidates,
  buildPreferredContactIdCandidates,
  buildInboundQueueKey,
  matchesContactIdVariant,
  pruneCollectedWebIncomingMessages
};
