const KV_REST_API_URL = String(process.env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
const KV_REST_API_TOKEN = String(process.env.KV_REST_API_TOKEN || "").trim();
const KV_ENABLED = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);

const AUDIT_PREFIX = String(process.env.AUDIT_KV_PREFIX || "wa:audit:").trim();
const INDEX_LIMIT = Number(process.env.AUDIT_INDEX_LIMIT || 1000);
const DETAIL_EVENTS_LIMIT = Number(process.env.AUDIT_DETAIL_EVENTS_LIMIT || 250);
const SUMMARY_SCAN_LIMIT = Number(process.env.AUDIT_SUMMARY_SCAN_LIMIT || 300);
const KV_REQUEST_TIMEOUT_MS = Number(process.env.AUDIT_KV_TIMEOUT_MS || 3500);
const KV_REQUEST_RETRIES = Number(process.env.AUDIT_KV_RETRIES || 1);
const TEST_CONTACT_IDS = new Set(
  String(process.env.TEST_CONTACT_IDS || "")
    .split(",")
    .map(value => String(value || "").trim())
    .filter(Boolean)
);

const memoryKv = new Map();

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function keyActive(contactId) {
  return `${AUDIT_PREFIX}active:${contactId}`;
}

function keyContact(contactId) {
  return `${AUDIT_PREFIX}contact:${contactId}`;
}

function keyConversation(conversationId) {
  return `${AUDIT_PREFIX}conv:${conversationId}`;
}

function keyEvent(conversationId, seq) {
  const padded = String(seq).padStart(7, "0");
  return `${AUDIT_PREFIX}event:${conversationId}:${padded}`;
}

function keyAllConversations() {
  return `${AUDIT_PREFIX}idx:all`;
}

function keyContactConversations(contactId) {
  return `${AUDIT_PREFIX}idx:contact:${contactId}`;
}

function conversationId() {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushUniqueAtStart(list, value, maxSize) {
  const next = [value, ...list.filter(item => item !== value)];
  return next.slice(0, maxSize);
}

function truncateText(value, max = 600) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isLikelyTestConversation({ contactId, contactName, inboundText }) {
  const id = String(contactId || "").trim();
  if (id && TEST_CONTACT_IDS.has(id)) {
    return true;
  }

  const combined = `${contactName || ""} ${inboundText || ""}`;
  const normalized = normalizeForMatch(combined);
  return normalized.includes("prueba") || normalized.includes("test") || normalized.includes("qa");
}

function summarizeInboundMessage(message, inboundText) {
  const type = String(message?.type || (inboundText ? "text" : "unknown"));
  const buttonId = String(
    message?.interactive?.button_reply?.id ||
      message?.button?.payload ||
      message?.interactive?.list_reply?.id ||
      ""
  );
  const text =
    inboundText ||
    message?.text?.body ||
    message?.button?.text ||
    message?.interactive?.button_reply?.title ||
    message?.interactive?.list_reply?.title ||
    message?.document?.caption ||
    message?.image?.caption ||
    "";

  return {
    type,
    text: truncateText(text),
    buttonId,
    hasMedia: type === "image" || type === "document"
  };
}

function summarizeOutboundAction(action) {
  const type = String(action?.type || "unknown");
  if (type === "text") {
    return {
      type,
      text: truncateText(action?.text || "")
    };
  }
  if (type === "interactive") {
    return {
      type,
      text: truncateText(action?.text || ""),
      buttons: normalizeArray(action?.buttons).map(button => ({
        id: String(button?.id || ""),
        title: truncateText(button?.title || "", 80)
      }))
    };
  }
  if (type === "image") {
    return {
      type,
      url: String(action?.url || ""),
      caption: truncateText(action?.caption || "", 200)
    };
  }
  return {
    type,
    raw: truncateText(JSON.stringify(action || {}), 400)
  };
}

function normalizeConversation(conv) {
  const safe = conv && typeof conv === "object" ? conv : {};
  return {
    id: String(safe.id || ""),
    contactId: String(safe.contactId || ""),
    contactName: String(safe.contactName || ""),
    status: String(safe.status || "open"),
    openedAt: String(safe.openedAt || nowIso()),
    closedAt: safe.closedAt ? String(safe.closedAt) : null,
    lastEventAt: String(safe.lastEventAt || nowIso()),
    resolver: String(safe.resolver || "bot"),
    outcome: String(safe.outcome || "in_progress"),
    currentState: safe.currentState ? String(safe.currentState) : null,
    currentStep: safe.currentStep ? String(safe.currentStep) : null,
    inboundCount: Number(safe.inboundCount || 0),
    outboundCount: Number(safe.outboundCount || 0),
    eventCount: Number(safe.eventCount || 0),
    summary: String(safe.summary || ""),
    tags: normalizeArray(safe.tags).map(tag => String(tag || "")).filter(Boolean),
    context: safe.context && typeof safe.context === "object" ? safe.context : {}
  };
}

function normalizeContact(profile, contactId, contactName) {
  const safe = profile && typeof profile === "object" ? profile : {};
  return {
    contactId: String(safe.contactId || contactId || ""),
    contactName: String(contactName || safe.contactName || ""),
    firstSeenAt: String(safe.firstSeenAt || nowIso()),
    lastSeenAt: String(safe.lastSeenAt || nowIso()),
    totalConversations: Number(safe.totalConversations || 0),
    totalInboundMessages: Number(safe.totalInboundMessages || 0),
    totalOutboundMessages: Number(safe.totalOutboundMessages || 0),
    lastOutcome: String(safe.lastOutcome || ""),
    lastConversationId: String(safe.lastConversationId || ""),
    tags: normalizeArray(safe.tags).map(tag => String(tag || "")).filter(Boolean)
  };
}

async function kvGetJson(key) {
  if (!KV_ENABLED) {
    return memoryKv.has(key) ? clone(memoryKv.get(key)) : null;
  }

  const endpoint = `${KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  let lastError = null;

  for (let attempt = 0; attempt <= KV_REQUEST_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KV_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${KV_REST_API_TOKEN}`
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status >= 500 && attempt < KV_REQUEST_RETRIES) {
          await sleep(120 * (attempt + 1));
          continue;
        }
        return memoryKv.has(key) ? clone(memoryKv.get(key)) : null;
      }

      const data = await response.json();
      if (data?.result === null || data?.result === undefined) {
        return null;
      }

      const result =
        typeof data.result === "string"
          ? JSON.parse(data.result)
          : typeof data.result === "object"
            ? data.result
            : null;

      if (result !== null) {
        memoryKv.set(key, clone(result));
      }

      return result;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < KV_REQUEST_RETRIES) {
        await sleep(120 * (attempt + 1));
        continue;
      }
      console.warn("Audit KV read failed:", error.message);
      return memoryKv.has(key) ? clone(memoryKv.get(key)) : null;
    }
  }

  if (lastError) {
    console.warn("Audit KV read failed:", lastError.message);
  }

  return memoryKv.has(key) ? clone(memoryKv.get(key)) : null;
}

async function kvSetJson(key, value) {
  memoryKv.set(key, clone(value));

  if (!KV_ENABLED) {
    return;
  }

  const encoded = encodeURIComponent(JSON.stringify(value));
  const endpoint = `${KV_REST_API_URL}/set/${encodeURIComponent(key)}/${encoded}`;

  for (let attempt = 0; attempt <= KV_REQUEST_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KV_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${KV_REST_API_TOKEN}`
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (response.ok) {
        return;
      }
      if (attempt < KV_REQUEST_RETRIES && response.status >= 500) {
        await sleep(120 * (attempt + 1));
        continue;
      }
      console.warn("Audit KV write failed with status:", response.status);
      return;
    } catch (error) {
      clearTimeout(timeout);
      if (attempt < KV_REQUEST_RETRIES) {
        await sleep(120 * (attempt + 1));
        continue;
      }
      console.warn("Audit KV write failed:", error.message);
      return;
    }
  }
}

async function loadConversationsByIds(ids, batchSize = 20) {
  const output = [];
  for (let index = 0; index < ids.length; index += batchSize) {
    const chunk = ids.slice(index, index + batchSize);
    const values = await Promise.all(chunk.map(id => getConversation(id)));
    output.push(...values);
  }
  return output;
}

async function loadJsonByKeys(keys, batchSize = 30) {
  const output = [];
  for (let index = 0; index < keys.length; index += batchSize) {
    const chunk = keys.slice(index, index + batchSize);
    const values = await Promise.all(chunk.map(key => kvGetJson(key)));
    output.push(...values);
  }
  return output;
}

async function getConversation(conversationId) {
  const conv = await kvGetJson(keyConversation(conversationId));
  return conv ? normalizeConversation(conv) : null;
}

async function saveConversation(conversation) {
  const normalized = normalizeConversation(conversation);
  await kvSetJson(keyConversation(normalized.id), normalized);
  return normalized;
}

async function setActiveConversation(contactId, conversationId) {
  await kvSetJson(keyActive(contactId), {
    conversationId: String(conversationId || ""),
    updatedAt: nowIso()
  });
}

async function clearActiveConversation(contactId) {
  await kvSetJson(keyActive(contactId), {
    conversationId: "",
    updatedAt: nowIso()
  });
}

async function getActiveConversationId(contactId) {
  const payload = await kvGetJson(keyActive(contactId));
  return String(payload?.conversationId || "").trim() || null;
}

async function appendConversationIndex(contactId, conversationId) {
  const allIds = normalizeArray(await kvGetJson(keyAllConversations()));
  const nextAll = pushUniqueAtStart(allIds, conversationId, INDEX_LIMIT);
  await kvSetJson(keyAllConversations(), nextAll);

  const byContact = normalizeArray(await kvGetJson(keyContactConversations(contactId)));
  const nextByContact = pushUniqueAtStart(byContact, conversationId, INDEX_LIMIT);
  await kvSetJson(keyContactConversations(contactId), nextByContact);
}

async function appendEvent(conversation, type, payload) {
  const conv = normalizeConversation(conversation);
  const seq = Number(conv.eventCount || 0) + 1;
  const event = {
    id: `${conv.id}:${seq}`,
    sequence: seq,
    conversationId: conv.id,
    timestamp: nowIso(),
    type: String(type || "event"),
    payload: payload && typeof payload === "object" ? payload : {}
  };

  conv.eventCount = seq;
  conv.lastEventAt = event.timestamp;

  await kvSetJson(keyEvent(conv.id, seq), event);
  await saveConversation(conv);
  return { conv, event };
}

async function upsertContact(contactId, contactName, updater) {
  const existing = await kvGetJson(keyContact(contactId));
  const contact = normalizeContact(existing, contactId, contactName);
  contact.lastSeenAt = nowIso();
  if (contactName) {
    contact.contactName = String(contactName);
  }
  updater(contact);
  await kvSetJson(keyContact(contactId), contact);
  return contact;
}

async function ensureOpenConversation(contactId, contactName) {
  const activeConversationId = await getActiveConversationId(contactId);
  if (activeConversationId) {
    const openConversation = await getConversation(activeConversationId);
    if (openConversation && openConversation.status === "open") {
      return openConversation;
    }
  }

  const conversation = normalizeConversation({
    id: conversationId(),
    contactId,
    contactName,
    status: "open",
    openedAt: nowIso(),
    lastEventAt: nowIso(),
    resolver: "bot",
    outcome: "in_progress",
    currentState: null,
    currentStep: null,
    inboundCount: 0,
    outboundCount: 0,
    eventCount: 0,
    summary: "",
    tags: [],
    context: {}
  });

  await saveConversation(conversation);
  await setActiveConversation(contactId, conversation.id);
  await appendConversationIndex(contactId, conversation.id);

  await upsertContact(contactId, contactName, contact => {
    contact.totalConversations += 1;
    contact.lastConversationId = conversation.id;
  });

  return conversation;
}

function mergeContextTags(conversation, sessionData) {
  const tags = new Set(normalizeArray(conversation.tags));
  if (sessionData.orderType) {
    tags.add(`order_type:${String(sessionData.orderType).toLowerCase()}`);
  }
  if (sessionData.mode) {
    tags.add(`mode:${String(sessionData.mode).toLowerCase()}`);
  }
  if (sessionData.zone) {
    tags.add(`zone:${String(sessionData.zone).toLowerCase()}`);
  }
  conversation.tags = Array.from(tags).slice(0, 40);
}

function buildSummaryFromContext(sessionData) {
  const parts = [];
  if (sessionData.orderType) {
    parts.push(`tipo ${sessionData.orderType}`);
  }
  if (sessionData.mode) {
    parts.push(`modalidad ${sessionData.mode}`);
  }
  if (sessionData.zone) {
    parts.push(`zona ${sessionData.zone}`);
  }
  if (sessionData.items) {
    parts.push(`${sessionData.items} items`);
  }
  return parts.join(" | ");
}

async function recordInboundMessage({ contactId, contactName, inboundText, inboundMessage, messageId }) {
  const conversation = await ensureOpenConversation(contactId, contactName);
  const inbound = summarizeInboundMessage(inboundMessage, inboundText);
  const markAsTest = isLikelyTestConversation({
    contactId,
    contactName,
    inboundText: inbound.text
  });

  const { conv } = await appendEvent(conversation, "inbound_message", {
    messageId: String(messageId || ""),
    inbound
  });

  conv.inboundCount += 1;
  if (markAsTest) {
    conv.tags = Array.from(new Set([...(conv.tags || []), "test_run"])).slice(0, 40);
  }
  await saveConversation(conv);

  await upsertContact(contactId, contactName, contact => {
    contact.totalInboundMessages += 1;
    contact.lastConversationId = conv.id;
  });

  return conv;
}

async function recordFlowTransition({ conversationId: id, flowMeta }) {
  if (!id || !flowMeta) {
    return null;
  }

  const conversation = await getConversation(id);
  if (!conversation) {
    return null;
  }

  const meta = flowMeta && typeof flowMeta === "object" ? flowMeta : {};
  const after = meta.after || {};
  const sessionData = meta.sessionData && typeof meta.sessionData === "object" ? meta.sessionData : {};

  conversation.currentState = after.state ? String(after.state) : conversation.currentState;
  conversation.currentStep = after.step ? String(after.step) : conversation.currentStep;
  conversation.context = {
    ...conversation.context,
    ...sessionData
  };

  mergeContextTags(conversation, sessionData);
  const summary = buildSummaryFromContext(sessionData);
  if (summary) {
    conversation.summary = summary;
  }

  if (meta.handedToHuman) {
    conversation.status = "agent_pending";
    conversation.resolver = "human_pending";
  }

  const payload = {
    before: meta.before || null,
    after: meta.after || null,
    transition: meta.transition || null,
    closed: Boolean(meta.closed),
    handedToHuman: Boolean(meta.handedToHuman),
    sessionData
  };

  const { conv } = await appendEvent(conversation, "flow_transition", payload);
  await saveConversation(conv);

  if (meta.closed) {
    conv.status = "closed";
    conv.closedAt = nowIso();
    conv.outcome = conv.resolver === "human_pending" ? "closed_after_handoff" : "resolved";
    if (conv.resolver === "human_pending") {
      conv.resolver = "human";
    } else {
      conv.resolver = "bot";
    }
    await saveConversation(conv);
    await clearActiveConversation(conv.contactId);

    await upsertContact(conv.contactId, conv.contactName, contact => {
      contact.lastOutcome = conv.outcome;
      contact.lastConversationId = conv.id;
      const merged = Array.from(new Set([...(contact.tags || []), ...(conv.tags || [])]));
      contact.tags = merged.slice(0, 60);
    });
  }

  return conv;
}

async function recordOutboundMessage({ conversationId: id, action, status = "sent", error = "" }) {
  if (!id) {
    return null;
  }

  const conversation = await getConversation(id);
  if (!conversation) {
    return null;
  }

  const payload = {
    status: String(status),
    action: summarizeOutboundAction(action),
    error: truncateText(error || "", 400)
  };

  const { conv } = await appendEvent(conversation, "outbound_message", payload);
  if (status === "sent") {
    conv.outboundCount += 1;
    await saveConversation(conv);
    await upsertContact(conv.contactId, conv.contactName, contact => {
      contact.totalOutboundMessages += 1;
      contact.lastConversationId = conv.id;
    });
  }

  return conv;
}

async function listConversations({ limit = 60, status = "", contactId = "", tag = "" } = {}) {
  const max = Math.max(1, Math.min(Number(limit || 60), 200));
  const tagFilter = String(tag || "").trim();
  const ids = normalizeArray(
    await kvGetJson(contactId ? keyContactConversations(contactId) : keyAllConversations())
  );
  const idsToLoad = ids.slice(0, Math.max(max * 4, max));
  const conversations = await loadConversationsByIds(idsToLoad, 20);
  const output = [];
  for (const conv of conversations) {
    if (output.length >= max) {
      break;
    }
    if (!conv) {
      continue;
    }
    if (status && conv.status !== status) {
      continue;
    }
    if (tagFilter && !(conv.tags || []).includes(tagFilter)) {
      continue;
    }
    output.push(conv);
  }
  return output;
}

async function getConversationSummary() {
  const ids = normalizeArray(await kvGetJson(keyAllConversations()));
  const scanIds = ids.slice(0, Math.max(1, SUMMARY_SCAN_LIMIT));
  const conversations = await loadConversationsByIds(scanIds, 20);
  const summary = {
    total: 0,
    open: 0,
    agentPending: 0,
    closed: 0,
    testRuns: 0,
    lastEventAt: null
  };

  for (const conv of conversations) {
    if (!conv) {
      continue;
    }
    summary.total += 1;
    if (conv.status === "open") {
      summary.open += 1;
    } else if (conv.status === "agent_pending") {
      summary.agentPending += 1;
    } else if (conv.status === "closed") {
      summary.closed += 1;
    }
    if ((conv.tags || []).includes("test_run")) {
      summary.testRuns += 1;
    }
    if (!summary.lastEventAt || String(conv.lastEventAt || "") > String(summary.lastEventAt || "")) {
      summary.lastEventAt = conv.lastEventAt || null;
    }
  }

  return summary;
}

async function getConversationDetail(conversationId, limit = DETAIL_EVENTS_LIMIT) {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return null;
  }

  const maxEvents = Math.max(1, Math.min(Number(limit || DETAIL_EVENTS_LIMIT), 1000));
  const start = Math.max(1, conversation.eventCount - maxEvents + 1);
  const keys = [];
  for (let seq = start; seq <= conversation.eventCount; seq += 1) {
    keys.push(keyEvent(conversation.id, seq));
  }
  const rawEvents = await loadJsonByKeys(keys, 30);
  const events = rawEvents.filter(Boolean);

  return {
    conversation,
    events
  };
}

module.exports = {
  recordInboundMessage,
  recordFlowTransition,
  recordOutboundMessage,
  listConversations,
  getConversationDetail,
  getConversationSummary
};
