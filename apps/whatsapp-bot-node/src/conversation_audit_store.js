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

function callStore(methodName, args) {
  const method = activeStore[methodName];
  if (typeof method !== "function") {
    throw new Error(`audit_store_method_missing:${methodName}`);
  }
  return method(...args);
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
  return decorateStatus(callStore("getAuditStorageStatus", []));
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

module.exports = {
  recordInboundMessage,
  recordFlowTransition,
  recordOutboundMessage,
  listConversations,
  getConversationDetail,
  getConversationSummary,
  getAuditStorageStatus
};