const kvStore = require("./conversation_audit_kv_store");
const postgresStore = require("./conversation_audit_postgres_store");

const DATABASE_URL = String(
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || ""
).trim();

const REQUESTED_PROVIDER = String(process.env.AUDIT_STORAGE_PROVIDER || "auto")
  .trim()
  .toLowerCase();

function resolveProvider() {
  if (REQUESTED_PROVIDER === "postgres" || REQUESTED_PROVIDER === "neon") {
    return "postgres";
  }
  if (REQUESTED_PROVIDER === "kv" || REQUESTED_PROVIDER === "redis") {
    return "kv";
  }
  return DATABASE_URL ? "postgres" : "kv";
}

const ACTIVE_PROVIDER = resolveProvider();
const activeStore = ACTIVE_PROVIDER === "postgres" ? postgresStore : kvStore;
const fallbackStore = ACTIVE_PROVIDER === "postgres" ? kvStore : null;

function isAuditStorageUnavailableError(error) {
  return (
    error?.code === "audit_storage_unavailable" ||
    String(error?.message || "").includes("audit_storage_unavailable")
  );
}

async function callStore(methodName, args) {
  const method = activeStore[methodName];
  if (typeof method !== "function") {
    throw new Error(`audit_store_method_missing:${methodName}`);
  }

  try {
    return await method(...args);
  } catch (error) {
    if (!fallbackStore || !isAuditStorageUnavailableError(error)) {
      throw error;
    }

    const fallbackMethod = fallbackStore[methodName];
    if (typeof fallbackMethod !== "function") {
      throw error;
    }

    return fallbackMethod(...args);
  }
}

function decorateStatus(base) {
  const safe = base && typeof base === "object" ? base : {};
  return {
    ...safe,
    provider: ACTIVE_PROVIDER,
    requestedProvider: REQUESTED_PROVIDER || "auto"
  };
}

function getAuditStorageStatus() {
  const activeStatus =
    typeof activeStore.getAuditStorageStatus === "function"
      ? activeStore.getAuditStorageStatus()
      : {};
  const fallbackStatus =
    fallbackStore && typeof fallbackStore.getAuditStorageStatus === "function"
      ? fallbackStore.getAuditStorageStatus()
      : null;

  const activeUnavailable =
    ACTIVE_PROVIDER === "postgres" &&
    Boolean(activeStatus?.warnings?.lastDbReadError || activeStatus?.warnings?.lastDbWriteError);

  return decorateStatus({
    ...activeStatus,
    fallbackProvider: fallbackStore ? "kv" : null,
    fallbackStatus,
    degraded: Boolean(fallbackStore && activeUnavailable)
  });
}

function recordInboundMessage(payload) {
  return callStore("recordInboundMessage", [payload]);
}

function recordFlowTransition(payload) {
  return callStore("recordFlowTransition", [payload]);
}

function recordOutboundMessage(payload) {
  return callStore("recordOutboundMessage", [payload]);
}

function listConversations(payload) {
  return callStore("listConversations", [payload]);
}

function getConversationDetail(conversationId, limit) {
  return callStore("getConversationDetail", [conversationId, limit]);
}

function getConversationSummary() {
  return callStore("getConversationSummary", []);
}

function addConversationTag(conversationId, tag) {
  return callStore("addConversationTag", [conversationId, tag]);
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
