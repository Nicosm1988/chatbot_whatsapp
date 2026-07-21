const { Pool } = require("pg");
const {
  summarizeInboundMessage,
  summarizeOutboundAction,
  truncateText,
  normalizeArray
} = require("./conversation_audit_formatters");
const { mergeConversationContextTags, buildSummaryFromContext } = require("./conversation_audit_tags");
const { inferConversationPresentation } = require("./conversation_audit_inference");
const { applyConversationPreview } = require("./conversation_audit_preview");

const DATABASE_URL = String(
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || ""
).trim();
const DB_ENABLED = Boolean(DATABASE_URL);
const IS_PRODUCTION_RUNTIME =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.VERCEL_URL || process.env.NOW_REGION || process.env.VERCEL_REGION);
const AUDIT_ALLOW_MEMORY_FALLBACK = String(
  process.env.AUDIT_ALLOW_MEMORY_FALLBACK || (IS_PRODUCTION_RUNTIME ? "false" : "true")
)
  .trim()
  .toLowerCase() === "true";
const { stripInactivityPromptTag } = require("./inactivity_cron");
const TEST_CONTACT_IDS = new Set(
  String(process.env.TEST_CONTACT_IDS || "")
    .split(",")
    .map(value => String(value || "").trim())
    .filter(Boolean)
);

const pool = DB_ENABLED
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.AUDIT_DB_POOL_MAX || 8),
      idleTimeoutMillis: Number(process.env.AUDIT_DB_IDLE_TIMEOUT_MS || 30000),
      statement_timeout: Number(process.env.AUDIT_DB_STATEMENT_TIMEOUT_MS || 10000)
    })
  : null;

let schemaReadyPromise = null;
let lastDbReadError = "";
let lastDbReadErrorAt = null;
let lastDbWriteError = "";
let lastDbWriteErrorAt = null;

function shouldUseSsl(url) {
  const lower = String(url || "").toLowerCase();
  if (!lower) {
    return false;
  }
  return !(
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("sslmode=disable")
  );
}

function nowIso() {
  return new Date().toISOString();
}

function toIsoTimestamp(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStorageUnavailableError(reason) {
  const error = new Error(`audit_storage_unavailable:${String(reason || "unknown")}`);
  error.code = "audit_storage_unavailable";
  return error;
}

function markReadError(error) {
  lastDbReadError = String(error?.message || "db_read_failed");
  lastDbReadErrorAt = nowIso();
}

function markWriteError(error) {
  lastDbWriteError = String(error?.message || "db_write_failed");
  lastDbWriteErrorAt = nowIso();
}

function clearReadError() {
  lastDbReadError = "";
  lastDbReadErrorAt = null;
}

function clearWriteError() {
  lastDbWriteError = "";
  lastDbWriteErrorAt = null;
}

function conversationId() {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

function normalizeConversation(conv) {
  const safe = conv && typeof conv === "object" ? conv : {};
  const context = safe.context && typeof safe.context === "object" ? safe.context : {};
  const summaryFromContext = buildSummaryFromContext(context);
  return {
    id: String(safe.id || ""),
    contactId: String(safe.contactId || ""),
    contactName: String(safe.contactName || ""),
    status: String(safe.status || "open"),
    openedAt: toIsoTimestamp(safe.openedAt, nowIso()),
    closedAt: toIsoTimestamp(safe.closedAt, null),
    lastEventAt: toIsoTimestamp(safe.lastEventAt, nowIso()),
    resolver: String(safe.resolver || "bot"),
    outcome: String(safe.outcome || "in_progress"),
    currentState: safe.currentState ? String(safe.currentState) : null,
    currentStep: safe.currentStep ? String(safe.currentStep) : null,
    inboundCount: Number(safe.inboundCount || 0),
    outboundCount: Number(safe.outboundCount || 0),
    eventCount: Number(safe.eventCount || 0),
    summary: String(summaryFromContext || safe.summary || ""),
    tags: mergeConversationContextTags(
      normalizeArray(safe.tags).map(tag => String(tag || "")).filter(Boolean),
      context
    ),
    context
  };
}

function normalizeContact(profile, contactId, contactName) {
  const safe = profile && typeof profile === "object" ? profile : {};
  return {
    contactId: String(safe.contactId || contactId || ""),
    contactName: String(contactName || safe.contactName || ""),
    firstSeenAt: toIsoTimestamp(safe.firstSeenAt, nowIso()),
    lastSeenAt: toIsoTimestamp(safe.lastSeenAt, nowIso()),
    totalConversations: Number(safe.totalConversations || 0),
    totalInboundMessages: Number(safe.totalInboundMessages || 0),
    totalOutboundMessages: Number(safe.totalOutboundMessages || 0),
    lastOutcome: String(safe.lastOutcome || ""),
    lastConversationId: String(safe.lastConversationId || ""),
    tags: normalizeArray(safe.tags).map(tag => String(tag || "")).filter(Boolean)
  };
}

function rowToConversation(row) {
  if (!row) {
    return null;
  }
  return normalizeConversation({
    id: row.id,
    contactId: row.contact_id,
    contactName: row.contact_name,
    status: row.status,
    openedAt: row.opened_at ? new Date(row.opened_at).toISOString() : nowIso(),
    closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
    lastEventAt: row.last_event_at ? new Date(row.last_event_at).toISOString() : nowIso(),
    resolver: row.resolver,
    outcome: row.outcome,
    currentState: row.current_state,
    currentStep: row.current_step,
    inboundCount: row.inbound_count,
    outboundCount: row.outbound_count,
    eventCount: row.event_count,
    summary: row.summary,
    tags: row.tags,
    context: row.context
  });
}

function mergeConversationDraftOverCurrent(current, draft) {
  const safeCurrent = normalizeConversation(current);
  const safeDraft = draft && typeof draft === "object" ? draft : {};
  const next = {
    ...safeCurrent,
    contactId: trimPreferred(safeDraft.contactId, safeCurrent.contactId),
    contactName: trimPreferred(safeDraft.contactName, safeCurrent.contactName),
    status: trimPreferred(safeDraft.status, safeCurrent.status),
    resolver: trimPreferred(safeDraft.resolver, safeCurrent.resolver),
    outcome: trimPreferred(safeDraft.outcome, safeCurrent.outcome),
    currentState: trimPreferred(safeDraft.currentState, safeCurrent.currentState),
    currentStep: trimPreferred(safeDraft.currentStep, safeCurrent.currentStep),
    summary: trimPreferred(safeDraft.summary, safeCurrent.summary),
    openedAt: safeDraft.openedAt || safeCurrent.openedAt,
    closedAt: safeDraft.closedAt !== undefined ? safeDraft.closedAt : safeCurrent.closedAt,
    inboundCount: Number(safeDraft.inboundCount ?? safeCurrent.inboundCount),
    outboundCount: Number(safeDraft.outboundCount ?? safeCurrent.outboundCount),
    eventCount: Number(safeDraft.eventCount ?? safeCurrent.eventCount),
    context: {
      ...(safeCurrent.context || {}),
      ...(safeDraft.context && typeof safeDraft.context === "object" ? safeDraft.context : {})
    }
  };

  const mergedTags = new Set([...(safeCurrent.tags || []), ...normalizeArray(safeDraft.tags)]);
  next.tags = Array.from(mergedTags).slice(0, 40);
  return normalizeConversation(next);
}

function trimPreferred(value, fallback) {
  return trimText(value) ? String(value) : fallback || null;
}

function trimText(value) {
  return String(value || "").trim();
}

function mapEventsByConversation(rows) {
  const grouped = new Map();
  for (const row of normalizeArray(rows)) {
    const conversationId = String(row?.conversation_id || "");
    if (!conversationId) {
      continue;
    }
    if (!grouped.has(conversationId)) {
      grouped.set(conversationId, []);
    }
    grouped.get(conversationId).push({
      id: row.event_id,
      sequence: Number(row.sequence || 0),
      conversationId,
      timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : nowIso(),
      type: row.type,
      payload: row.payload && typeof row.payload === "object" ? row.payload : {}
    });
  }
  return grouped;
}

async function ensureSchema() {
  if (!DB_ENABLED || !pool) {
    throw createStorageUnavailableError("database_url_not_configured");
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS audit_conversations (
            id TEXT PRIMARY KEY,
            contact_id TEXT NOT NULL,
            contact_name TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            opened_at TIMESTAMPTZ NOT NULL,
            closed_at TIMESTAMPTZ NULL,
            last_event_at TIMESTAMPTZ NOT NULL,
            resolver TEXT NOT NULL DEFAULT 'bot',
            outcome TEXT NOT NULL DEFAULT 'in_progress',
            current_state TEXT NULL,
            current_step TEXT NULL,
            inbound_count INTEGER NOT NULL DEFAULT 0,
            outbound_count INTEGER NOT NULL DEFAULT 0,
            event_count INTEGER NOT NULL DEFAULT 0,
            summary TEXT NOT NULL DEFAULT '',
            tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            context JSONB NOT NULL DEFAULT '{}'::jsonb
          );

          CREATE TABLE IF NOT EXISTS audit_events (
            conversation_id TEXT NOT NULL REFERENCES audit_conversations(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL,
            event_id TEXT NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,
            type TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            PRIMARY KEY (conversation_id, sequence)
          );

          CREATE TABLE IF NOT EXISTS audit_active_conversations (
            contact_id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );

          CREATE TABLE IF NOT EXISTS audit_contacts (
            contact_id TEXT PRIMARY KEY,
            contact_name TEXT NOT NULL DEFAULT '',
            first_seen_at TIMESTAMPTZ NOT NULL,
            last_seen_at TIMESTAMPTZ NOT NULL,
            total_conversations INTEGER NOT NULL DEFAULT 0,
            total_inbound_messages INTEGER NOT NULL DEFAULT 0,
            total_outbound_messages INTEGER NOT NULL DEFAULT 0,
            last_outcome TEXT NOT NULL DEFAULT '',
            last_conversation_id TEXT NOT NULL DEFAULT '',
            tags JSONB NOT NULL DEFAULT '[]'::jsonb
          );

          CREATE INDEX IF NOT EXISTS idx_audit_conversations_contact_last_event
            ON audit_conversations (contact_id, last_event_at DESC);
          CREATE INDEX IF NOT EXISTS idx_audit_conversations_status_last_event
            ON audit_conversations (status, last_event_at DESC);
          CREATE INDEX IF NOT EXISTS idx_audit_events_conversation_sequence
            ON audit_events (conversation_id, sequence DESC);
        `);
      } finally {
        client.release();
      }
    })().catch(error => {
      schemaReadyPromise = null;
      markWriteError(error);
      throw error;
    });
  }

  return schemaReadyPromise;
}

async function withClient(fn) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function withTransaction(fn) {
  return withClient(async client => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function getConversationRow(client, conversationId, forUpdate = false) {
  const suffix = forUpdate ? " FOR UPDATE" : "";
  const query = `SELECT * FROM audit_conversations WHERE id = $1${suffix}`;
  const { rows } = await client.query(query, [conversationId]);
  return rows[0] || null;
}

async function saveConversationRow(client, conversation) {
  const conv = normalizeConversation(conversation);
  const { rows } = await client.query(
    `
      INSERT INTO audit_conversations (
        id, contact_id, contact_name, status, opened_at, closed_at, last_event_at,
        resolver, outcome, current_state, current_step, inbound_count, outbound_count,
        event_count, summary, tags, context
      )
      VALUES (
        $1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16::jsonb, $17::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        contact_id = EXCLUDED.contact_id,
        contact_name = EXCLUDED.contact_name,
        status = EXCLUDED.status,
        opened_at = EXCLUDED.opened_at,
        closed_at = EXCLUDED.closed_at,
        last_event_at = EXCLUDED.last_event_at,
        resolver = EXCLUDED.resolver,
        outcome = EXCLUDED.outcome,
        current_state = EXCLUDED.current_state,
        current_step = EXCLUDED.current_step,
        inbound_count = EXCLUDED.inbound_count,
        outbound_count = EXCLUDED.outbound_count,
        event_count = EXCLUDED.event_count,
        summary = EXCLUDED.summary,
        tags = EXCLUDED.tags,
        context = EXCLUDED.context
      RETURNING *
    `,
    [
      conv.id,
      conv.contactId,
      conv.contactName,
      conv.status,
      conv.openedAt,
      conv.closedAt,
      conv.lastEventAt,
      conv.resolver,
      conv.outcome,
      conv.currentState,
      conv.currentStep,
      conv.inboundCount,
      conv.outboundCount,
      conv.eventCount,
      conv.summary,
      JSON.stringify(conv.tags || []),
      JSON.stringify(conv.context || {})
    ]
  );
  return rows[0] || null;
}

async function getContactRow(client, contactId, forUpdate = false) {
  const suffix = forUpdate ? " FOR UPDATE" : "";
  const query = `SELECT * FROM audit_contacts WHERE contact_id = $1${suffix}`;
  const { rows } = await client.query(query, [contactId]);
  return rows[0] || null;
}

async function saveContactRow(client, contact) {
  const safe = normalizeContact(contact, contact.contactId, contact.contactName);
  await client.query(
    `
      INSERT INTO audit_contacts (
        contact_id, contact_name, first_seen_at, last_seen_at, total_conversations,
        total_inbound_messages, total_outbound_messages, last_outcome, last_conversation_id, tags
      )
      VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (contact_id) DO UPDATE SET
        contact_name = EXCLUDED.contact_name,
        first_seen_at = EXCLUDED.first_seen_at,
        last_seen_at = EXCLUDED.last_seen_at,
        total_conversations = EXCLUDED.total_conversations,
        total_inbound_messages = EXCLUDED.total_inbound_messages,
        total_outbound_messages = EXCLUDED.total_outbound_messages,
        last_outcome = EXCLUDED.last_outcome,
        last_conversation_id = EXCLUDED.last_conversation_id,
        tags = EXCLUDED.tags
    `,
    [
      safe.contactId,
      safe.contactName,
      safe.firstSeenAt,
      safe.lastSeenAt,
      safe.totalConversations,
      safe.totalInboundMessages,
      safe.totalOutboundMessages,
      safe.lastOutcome,
      safe.lastConversationId,
      JSON.stringify(safe.tags || [])
    ]
  );
}

async function upsertContact(client, contactId, contactName, updater) {
  const existing = await getContactRow(client, contactId, true);
  const contact = normalizeContact(
    existing
      ? {
          contactId: existing.contact_id,
          contactName: existing.contact_name,
          firstSeenAt: existing.first_seen_at,
          lastSeenAt: existing.last_seen_at,
          totalConversations: existing.total_conversations,
          totalInboundMessages: existing.total_inbound_messages,
          totalOutboundMessages: existing.total_outbound_messages,
          lastOutcome: existing.last_outcome,
          lastConversationId: existing.last_conversation_id,
          tags: existing.tags
        }
      : null,
    contactId,
    contactName
  );

  contact.lastSeenAt = nowIso();
  if (contactName) {
    contact.contactName = String(contactName);
  }
  updater(contact);
  await saveContactRow(client, contact);
  return contact;
}

async function setActiveConversation(client, contactId, conversationId) {
  await client.query(
    `
      INSERT INTO audit_active_conversations (contact_id, conversation_id, updated_at)
      VALUES ($1, $2, $3::timestamptz)
      ON CONFLICT (contact_id) DO UPDATE SET
        conversation_id = EXCLUDED.conversation_id,
        updated_at = EXCLUDED.updated_at
    `,
    [contactId, String(conversationId || ""), nowIso()]
  );
}

async function clearActiveConversation(client, contactId) {
  await client.query("DELETE FROM audit_active_conversations WHERE contact_id = $1", [contactId]);
}

async function getActiveConversationId(client, contactId) {
  const { rows } = await client.query(
    "SELECT conversation_id FROM audit_active_conversations WHERE contact_id = $1",
    [contactId]
  );
  return rows[0]?.conversation_id || null;
}

async function ensureOpenConversation(client, contactId, contactName) {
  const activeConversationId = await getActiveConversationId(client, contactId);
  if (activeConversationId) {
    const existing = await getConversationRow(client, activeConversationId, false);
    if (existing && ["open", "agent_pending"].includes(existing.status)) {
      return rowToConversation(existing);
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

  const savedRow = await saveConversationRow(client, conversation);
  await setActiveConversation(client, contactId, conversation.id);

  await upsertContact(client, contactId, contactName, contact => {
    contact.totalConversations += 1;
    contact.lastConversationId = conversation.id;
  });

  return rowToConversation(savedRow);
}

function mergeContextTags(conversation, sessionData) {
  conversation.tags = mergeConversationContextTags(conversation.tags, sessionData);
}

async function appendEvent(client, conversation, type, payload) {
  const currentRow = await getConversationRow(client, conversation.id, true);
  if (!currentRow) {
    return null;
  }
  const current = mergeConversationDraftOverCurrent(rowToConversation(currentRow), conversation);
  const sequence = Number(current.eventCount || 0) + 1;
  const timestamp = nowIso();
  const event = {
    id: `${current.id}:${sequence}`,
    sequence,
    conversationId: current.id,
    timestamp,
    type: String(type || "event"),
    payload: payload && typeof payload === "object" ? payload : {}
  };

  await client.query(
    `
      INSERT INTO audit_events (conversation_id, sequence, event_id, timestamp, type, payload)
      VALUES ($1, $2, $3, $4::timestamptz, $5, $6::jsonb)
    `,
    [current.id, sequence, event.id, timestamp, event.type, JSON.stringify(event.payload)]
  );

  current.eventCount = sequence;
  current.lastEventAt = timestamp;
  const savedRow = await saveConversationRow(client, current);

  return {
    conv: rowToConversation(savedRow),
    event
  };
}

async function recordInboundMessage({ contactId, contactName, inboundText, inboundMessage, messageId }) {
  if (!DB_ENABLED) {
    throw createStorageUnavailableError("database_url_not_configured");
  }

  try {
    return await withTransaction(async client => {
      const conversation = await ensureOpenConversation(client, contactId, contactName);
      const inbound = summarizeInboundMessage(inboundMessage, inboundText);
      const markAsTest = isLikelyTestConversation({
        contactId,
        contactName,
        inboundText: inbound.text
      });

      const result = await appendEvent(client, conversation, "inbound_message", {
        messageId: String(messageId || ""),
        inbound
      });
      if (!result) {
        return null;
      }

      const conv = normalizeConversation(result.conv);
      conv.inboundCount += 1;
      conv.tags = stripInactivityPromptTag(conv.tags);
      if (markAsTest) {
        conv.tags = Array.from(new Set([...(conv.tags || []), "test_run"])).slice(0, 40);
      }

      await saveConversationRow(client, conv);

      await upsertContact(client, contactId, contactName, contact => {
        contact.totalInboundMessages += 1;
        contact.lastConversationId = conv.id;
      });

      clearWriteError();
      return conv;
    });
  } catch (error) {
    markWriteError(error);
    throw createStorageUnavailableError(error.message || "record_inbound_failed");
  }
}

async function recordFlowTransition({ conversationId: id, flowMeta }) {
  if (!id || !flowMeta) {
    return null;
  }

  try {
    return await withTransaction(async client => {
      const conversationRow = await getConversationRow(client, id, true);
      if (!conversationRow) {
        return null;
      }
      const conversation = rowToConversation(conversationRow);

      const meta = flowMeta && typeof flowMeta === "object" ? flowMeta : {};
      const after = meta.after || {};
      const sessionData = meta.sessionData && typeof meta.sessionData === "object" ? meta.sessionData : {};

      conversation.currentState = after.state ? String(after.state) : conversation.currentState;
      conversation.currentStep = after.step ? String(after.step) : conversation.currentStep;
      conversation.context = {
        ...(conversation.context || {}),
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
      } else {
        const explicitlyClearedAdvisor =
          Object.prototype.hasOwnProperty.call(sessionData, "waitingAdvisor") &&
          sessionData.waitingAdvisor === false;

        if (meta.closed) {
          conversation.status = "closed";
          conversation.resolver = "human";
        } else if (explicitlyClearedAdvisor && conversation.status === "agent_pending") {
          conversation.status = "open";
          conversation.resolver = sessionData.manualAdvisorIntervened ? "human" : "automatic";
        }
      }

      const payload = {
        before: meta.before || null,
        after: meta.after || null,
        transition: meta.transition || null,
        closed: Boolean(meta.closed),
        handedToHuman: Boolean(meta.handedToHuman),
        sessionData
      };

      const result = await appendEvent(client, conversation, "flow_transition", payload);
      if (!result) {
        return null;
      }
      const conv = normalizeConversation(result.conv);

      if (meta.closed) {
        conv.status = "closed";
        conv.closedAt = nowIso();
        conv.outcome = conv.resolver === "human_pending" ? "closed_after_handoff" : "resolved";
        conv.resolver = conv.resolver === "human_pending" ? "human" : "bot";
        await saveConversationRow(client, conv);
        await clearActiveConversation(client, conv.contactId);

        await upsertContact(client, conv.contactId, conv.contactName, contact => {
          contact.lastOutcome = conv.outcome;
          contact.lastConversationId = conv.id;
          const merged = Array.from(new Set([...(contact.tags || []), ...(conv.tags || [])]));
          contact.tags = merged.slice(0, 60);
        });
      }

      clearWriteError();
      return conv;
    });
  } catch (error) {
    markWriteError(error);
    throw createStorageUnavailableError(error.message || "record_flow_transition_failed");
  }
}

async function recordOutboundMessage({ conversationId: id, action, status = "sent", error = "" }) {
  if (!id) {
    return null;
  }

  try {
    return await withTransaction(async client => {
      const conversationRow = await getConversationRow(client, id, true);
      if (!conversationRow) {
        return null;
      }
      const conversation = rowToConversation(conversationRow);

      const payload = {
        status: String(status),
        action: summarizeOutboundAction(action),
        error: truncateText(error || "", 400)
      };

      const result = await appendEvent(client, conversation, "outbound_message", payload);
      if (!result) {
        return null;
      }
      const conv = normalizeConversation(result.conv);

      if (status === "sent") {
        conv.outboundCount += 1;
        await saveConversationRow(client, conv);
        await upsertContact(client, conv.contactId, conv.contactName, contact => {
          contact.totalOutboundMessages += 1;
          contact.lastConversationId = conv.id;
        });
      }

      clearWriteError();
      return conv;
    });
  } catch (err) {
    markWriteError(err);
    throw createStorageUnavailableError(err.message || "record_outbound_failed");
  }
}

async function addConversationTag(id, tag) {
  if (!id || !tag) return null;
  try {
    return await withTransaction(async client => {
      const row = await getConversationRow(client, id, true);
      if (!row) return null;
      const conv = rowToConversation(row);
      const tags = new Set([...(conv.tags || [])]);
      tags.add(String(tag));
      conv.tags = Array.from(tags).slice(0, 40);
      await saveConversationRow(client, conv);
      return conv;
    });
  } catch (err) {
    markWriteError(err);
    throw createStorageUnavailableError(err.message || "add_tag_failed");
  }
}

async function listConversations({ limit = 60, status = "", contactId = "", tag = "" } = {}) {
  if (!DB_ENABLED) {
    throw createStorageUnavailableError("database_url_not_configured");
  }

  const max = Math.max(1, Math.min(Number(limit || 60), 200));
  const clauses = [];
  const params = [];

  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (contactId) {
    params.push(contactId);
    clauses.push(`contact_id = $${params.length}`);
  }
  const requiredTags = normalizeArray(
    Array.isArray(tag) ? tag : String(tag || "").split(",")
  )
    .map(value => String(value || "").trim())
    .filter(Boolean);
  const fetchLimit = Math.max(max * (requiredTags.length ? 6 : 1), max);
  params.push(fetchLimit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const query = `SELECT * FROM audit_conversations ${where} ORDER BY last_event_at DESC LIMIT $${params.length}`;

  try {
    const conversations = await withClient(async client => {
      const result = await client.query(query, params);
      const rows = result.rows || [];
      if (!rows.length) {
        return [];
      }

      const ids = rows.map(row => row.id);
      const eventResult = await client.query(
        `
          SELECT conversation_id, sequence, event_id, timestamp, type, payload
          FROM audit_events
          WHERE conversation_id = ANY($1::text[])
          ORDER BY conversation_id ASC, sequence ASC
        `,
        [ids]
      );

      const eventMap = mapEventsByConversation(eventResult.rows || []);
      return rows.map(row => {
        const events = eventMap.get(row.id) || [];
        return applyConversationPreview(inferConversationPresentation(rowToConversation(row), events), events);
      });
    });
    clearReadError();
    return conversations
      .filter(conversation => requiredTags.every(requiredTag => (conversation.tags || []).includes(requiredTag)))
      .slice(0, max);
  } catch (error) {
    markReadError(error);
    throw createStorageUnavailableError(error.message || "list_conversations_failed");
  }
}

async function getConversationSummary() {
  if (!DB_ENABLED) {
    throw createStorageUnavailableError("database_url_not_configured");
  }

  try {
    const row = await withClient(async client => {
      const { rows } = await client.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'open')::int AS open,
          COUNT(*) FILTER (WHERE status = 'agent_pending')::int AS agent_pending,
          COUNT(*) FILTER (WHERE status = 'closed')::int AS closed,
          COUNT(*) FILTER (WHERE tags ? 'test_run')::int AS test_runs,
          MAX(last_event_at) AS last_event_at
        FROM audit_conversations
      `);
      return rows[0] || null;
    });

    clearReadError();

    return {
      total: Number(row?.total || 0),
      open: Number(row?.open || 0),
      agentPending: Number(row?.agent_pending || 0),
      closed: Number(row?.closed || 0),
      testRuns: Number(row?.test_runs || 0),
      lastEventAt: row?.last_event_at ? new Date(row.last_event_at).toISOString() : null
    };
  } catch (error) {
    markReadError(error);
    throw createStorageUnavailableError(error.message || "conversation_summary_failed");
  }
}

async function getConversationDetail(conversationId, limit = 250) {
  if (!DB_ENABLED) {
    throw createStorageUnavailableError("database_url_not_configured");
  }

  const max = Math.max(1, Math.min(Number(limit || 250), 1000));

  try {
    return await withClient(async client => {
      const convResult = await client.query("SELECT * FROM audit_conversations WHERE id = $1", [conversationId]);
      const conversationRow = convResult.rows[0] || null;
      if (!conversationRow) {
        return null;
      }

      const eventsResult = await client.query(
        `
          SELECT sequence, event_id, conversation_id, timestamp, type, payload
          FROM (
            SELECT sequence, event_id, conversation_id, timestamp, type, payload
            FROM audit_events
            WHERE conversation_id = $1
            ORDER BY sequence DESC
            LIMIT $2
          ) e
          ORDER BY sequence ASC
        `,
        [conversationId, max]
      );

      clearReadError();

      const events = eventsResult.rows.map(row => ({
        id: row.event_id,
        sequence: Number(row.sequence || 0),
        conversationId: row.conversation_id,
        timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : nowIso(),
        type: row.type,
        payload: row.payload && typeof row.payload === "object" ? row.payload : {}
      }));

      return {
        conversation: applyConversationPreview(
          inferConversationPresentation(rowToConversation(conversationRow), events),
          events
        ),
        events
      };
    });
  } catch (error) {
    markReadError(error);
    throw createStorageUnavailableError(error.message || "conversation_detail_failed");
  }
}

function getAuditStorageStatus() {
  return {
    kvEnabled: false,
    memoryFallbackEnabled: AUDIT_ALLOW_MEMORY_FALLBACK,
    persistentStorage: DB_ENABLED,
    mode: DB_ENABLED ? "postgres" : AUDIT_ALLOW_MEMORY_FALLBACK ? "memory_fallback" : "unavailable",
    warnings: {
      lastDbReadError,
      lastDbReadErrorAt,
      lastDbWriteError,
      lastDbWriteErrorAt
    }
  };
}

module.exports = {
  recordInboundMessage,
  recordFlowTransition,
  recordOutboundMessage,
  listConversations,
  getConversationDetail,
  getConversationSummary,
  getAuditStorageStatus,
  addConversationTag
};
