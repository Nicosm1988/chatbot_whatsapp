const express = require("express");
const QRCode = require("qrcode");

const { config, isVercelRuntime } = require("./config");
const conversationRules = require("./conversation_rules");
const { nextBotReply: nextRuleBotReply, _private: conversationRulesPrivate } = conversationRules;
const { nextBotReply: nextAgentBotReply } = require("./conversation_agent");
const { getPharmacyLookupStatus } = require("./pharmacy_system_lookup");
const { buildSystemReadiness } = require("./runtime_readiness");
const { getWebhookSignatureStatus, validateWebhookSignature } = require("./webhook_security");
const { getWorkflowCatalog, saveWorkflowCatalog, resetWorkflowCatalog, getChatbotRuntimeConfig } = require("./workflow_store");
const { renderFlowDashboard } = require("./flow_dashboard");
const { renderFlowClientDashboard } = require("./flow_client_dashboard");
const { renderConversationDashboard } = require("./conversation_dashboard");
const { renderControlCenterDashboard } = require("./control_center_dashboard");
const { buildCompanionPayload } = require("./whatsapp_web_companion");
const { syncCompanionOverlayPage, clearCompanionOverlayPage } = require("./whatsapp_web_overlay_sync");
const { isAdvisorClosureText, buildAdvisorClosureFarewell } = require("./advisor_closure_detection");
const {
  shouldInvalidateQueuedInboundMessages,
  buildContactIdCandidates,
  buildPreferredContactIdCandidates,
  buildInboundQueueKey: buildRuntimeInboundQueueKey,
  normalizeTransportContactId,
  matchesContactIdVariant,
  pruneCollectedWebIncomingMessages
} = require("./whatsapp_runtime_utils");
const {
  getNativeLabelCatalog,
  bootstrapNativeLabels,
  syncNativeLabelsForSession,
  listNativeLabelConversations,
  getNativeLabelNamesForContact,
  hasManagedNativeLabelForContact
} = require("./whatsapp_web_native_labels");
const { getClientFacingConversationTags } = require("./conversation_audit_tags");
const {
  recordInboundMessage,
  recordFlowTransition,
  recordOutboundMessage,
  listConversations,
  getConversationDetail,
  getConversationSummary,
  getAuditStorageStatus,
  addConversationTag
} = require("./conversation_audit_store");
const { processInactivityConversations } = require("./inactivity_cron");
const { sendTextMessage, sendInteractiveButtons, sendInteractiveList, sendImageMessage } = require("./metaClient");
const { _private: webTextClientPrivate } = require("./webTextClient");
const { getBotMode, setBotMode, HOLDING_MESSAGE, VALID_MODES } = require("./bot_mode_store");
const {
  getClient,
  initializeWhatsAppClient,
  getRuntimeStatus,
  getLatestQr,
  reconcileOperationalWhatsAppPage
} = require("./whatsappClient");

const app = express();
const isTestRuntime = process.env.NODE_ENV === "test";
const processedMessageIds = new Set();
const processedAdvisorClosureMessageIds = new Set();
const inboundProcessingChains = new Map();
const inboundProcessingGenerations = new Map();
const inboundResetCheckpoints = new Map();
const inboundAcceptedTimestamps = new Map();
const inboundStartupWatermarks = new Map();
const webhookSignatureStatus = getWebhookSignatureStatus(config);
const isWebTransport = config.whatsappTransport === "web";
const isCloudTransport = config.whatsappTransport === "cloud";
const FAST_WEB_RESPONSE_MODE = isWebTransport && !isVercelRuntime;
const WEB_INCOMING_POLL_INTERVAL_MS = config.whatsappWebIncomingPollIntervalMs;
const WEB_HEALTHY_POLL_INTERVAL_MS = config.whatsappWebHealthyPollIntervalMs;
const WEB_INCOMING_LOOKBACK_SECONDS = config.whatsappWebIncomingLookbackSeconds;
const WEB_RECOVERY_LOOKBACK_SECONDS = Math.max(
  WEB_INCOMING_LOOKBACK_SECONDS,
  Number(process.env.WHATSAPP_WEB_RECOVERY_LOOKBACK_SECONDS || 72 * 60 * 60)
);
const WEB_BRIDGE_RECONCILE_INTERVAL_MS = config.whatsappWebBridgeReconcileIntervalMs;
const WEB_ADVISOR_CLOSURE_POLL_INTERVAL_MS = Math.max(1500, Math.min(WEB_INCOMING_POLL_INTERVAL_MS, 5000));
const webIncomingStartupWatermarkTimestamp = Math.floor(Date.now() / 1000);
let webIncomingBridgeBaselineTimestamp = webIncomingStartupWatermarkTimestamp;
const webIncomingPollStartedAt = Math.floor(Date.now() / 1000) - WEB_INCOMING_LOOKBACK_SECONDS;
let webIncomingPollHandle = null;
let webIncomingBridgeHandle = null;
let localInactivityCheckHandle = null;
let webIncomingBridgeLogged = false;
let webIncomingBridgeHealthy = false;
let webIncomingLastHealthyPollAt = 0;
let webAdvisorClosureLastPollAt = 0;
let webIncomingSeeded = false;
let webIncomingBaselineRefreshPromise = null;
let webCompanionOverlayHandle = null;
const WEB_COMPANION_OVERLAY_INTERVAL_MS = 2500;
const LOCAL_INACTIVITY_CHECK_INTERVAL_MS = Math.max(
  60000,
  Number(process.env.WHATSAPP_WEB_INACTIVITY_CHECK_INTERVAL_MS || 300000) || 300000
);
const MAX_TRACKED_ADVISOR_MESSAGE_IDS = 4000;
const INBOUND_RESET_CHECKPOINT_TTL_MS = 30 * 60 * 1000;
const COMPANION_FALLBACK_WARN_COOLDOWN_MS = 60000;
const INBOUND_CONVERSATION_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.WHATSAPP_WEB_INBOUND_CONVERSATION_TIMEOUT_MS || (isWebTransport ? 12000 : 20000))
);
const OUTBOUND_ACTION_TIMEOUT_MS = Math.max(
  4000,
  Number(process.env.WHATSAPP_WEB_OUTBOUND_ACTION_TIMEOUT_MS || (isWebTransport ? 10000 : 15000))
);
const OUTBOUND_RECIPIENT_ATTEMPT_TIMEOUT_MS = Math.max(
  2000,
  Math.min(
    OUTBOUND_ACTION_TIMEOUT_MS,
    Number(process.env.WHATSAPP_WEB_OUTBOUND_RECIPIENT_ATTEMPT_TIMEOUT_MS || (isWebTransport ? 3500 : 5000))
  )
);
const STUCK_QUEUE_THRESHOLD_MS = Math.max(
  isTestRuntime ? 1 : INBOUND_CONVERSATION_TIMEOUT_MS + 2000,
  Number(process.env.WHATSAPP_WEB_STUCK_QUEUE_THRESHOLD_MS || (isWebTransport ? 15000 : 25000))
);
const LIVENESS_TIMEOUT_BACKOFF_MS = Math.max(
  5000,
  Number(process.env.WHATSAPP_WEB_LIVENESS_TIMEOUT_BACKOFF_MS || 30000)
);
let nativeLabelBootstrapStarted = false;
let lastCompanionFallbackWarnAt = 0;
const inboundQueueActivity = new Map();
const runtimeLiveness = {
  lastInboundReceivedAt: 0,
  lastInboundProcessedAt: 0,
  lastOutboundSentAt: 0,
  lastInboundContactId: "",
  lastProcessedContactId: "",
  lastOutboundContactId: "",
  lastTimeoutAt: 0,
  lastTimeoutReason: "",
  lastErrorAt: 0,
  lastError: ""
};

function buildTimeoutError(code, message, meta = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, meta);
  return error;
}

async function withTimeout(promise, timeoutMs, errorFactory) {
  let timer = null;

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(typeof errorFactory === "function" ? errorFactory() : errorFactory);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function markInboundReceived(contactId, timestampMs = Date.now()) {
  runtimeLiveness.lastInboundReceivedAt = Number(timestampMs || Date.now());
  runtimeLiveness.lastInboundContactId = String(contactId || "");
}

function markInboundProcessed(contactId, timestampMs = Date.now()) {
  runtimeLiveness.lastInboundProcessedAt = Number(timestampMs || Date.now());
  runtimeLiveness.lastProcessedContactId = String(contactId || "");
}

function markOutboundSent(contactId, timestampMs = Date.now()) {
  runtimeLiveness.lastOutboundSentAt = Number(timestampMs || Date.now());
  runtimeLiveness.lastOutboundContactId = String(contactId || "");
}

function markRuntimeTimeout(reason) {
  runtimeLiveness.lastTimeoutAt = Date.now();
  runtimeLiveness.lastTimeoutReason = String(reason || "timeout");
}

function markRuntimeError(reason) {
  runtimeLiveness.lastErrorAt = Date.now();
  runtimeLiveness.lastError = String(reason || "unknown_error");
}

function markQueueStarted(queueKey, contactId, generation) {
  inboundQueueActivity.set(queueKey, {
    contactId: String(contactId || ""),
    generation: Number(generation || 0),
    startedAt: Date.now()
  });
}

function clearQueueStarted(queueKey) {
  inboundQueueActivity.delete(queueKey);
}

function buildOperationalLiveness() {
  const readiness = getSystemReadiness();
  const now = Date.now();
  const activeQueues = [...inboundQueueActivity.entries()].map(([queueKey, activity]) => ({
    queueKey,
    contactId: String(activity?.contactId || ""),
    generation: Number(activity?.generation || 0),
    ageMs: Math.max(0, now - Number(activity?.startedAt || now))
  }));
  const stuckQueues = activeQueues.filter(queue => queue.ageMs >= STUCK_QUEUE_THRESHOLD_MS);
  const recentTimeout = runtimeLiveness.lastTimeoutAt > 0 && now - runtimeLiveness.lastTimeoutAt <= LIVENESS_TIMEOUT_BACKOFF_MS;
  const runtime = getRuntimeStatus();
  const ok =
    Boolean(readiness?.services?.whatsapp?.authenticated) &&
    Boolean(readiness?.services?.whatsapp?.ready) &&
    !recentTimeout &&
    stuckQueues.length === 0;

  return {
    ok,
    reason: !Boolean(readiness?.services?.whatsapp?.authenticated)
      ? "whatsapp_not_authenticated"
      : !Boolean(readiness?.services?.whatsapp?.ready)
        ? "whatsapp_not_ready"
        : recentTimeout
          ? "recent_runtime_timeout"
          : stuckQueues.length > 0
            ? "stuck_inbound_queue"
            : "ok",
    timeoutWindowMs: LIVENESS_TIMEOUT_BACKOFF_MS,
    stuckQueueThresholdMs: STUCK_QUEUE_THRESHOLD_MS,
    activeQueues,
    stuckQueues,
    lastInboundReceivedAt: runtimeLiveness.lastInboundReceivedAt || 0,
    lastInboundProcessedAt: runtimeLiveness.lastInboundProcessedAt || 0,
    lastOutboundSentAt: runtimeLiveness.lastOutboundSentAt || 0,
    lastInboundContactId: runtimeLiveness.lastInboundContactId || "",
    lastProcessedContactId: runtimeLiveness.lastProcessedContactId || "",
    lastOutboundContactId: runtimeLiveness.lastOutboundContactId || "",
    lastTimeoutAt: runtimeLiveness.lastTimeoutAt || 0,
    lastTimeoutReason: runtimeLiveness.lastTimeoutReason || "",
    lastErrorAt: runtimeLiveness.lastErrorAt || 0,
    lastError: runtimeLiveness.lastError || "",
    whatsapp: {
      ready: Boolean(runtime?.ready),
      authenticated: Boolean(runtime?.authenticated),
      sessionReady: Boolean(runtime?.sessionReady),
      disconnectReason: String(runtime?.disconnectReason || "")
    }
  };
}

function getInboundQueueKey(contactId) {
  return buildRuntimeInboundQueueKey(contactId);
}

function getInboundAcceptedTimestamp(contactId) {
  const queueKey = getInboundQueueKey(contactId);
  if (!queueKey) {
    return 0;
  }

  return Number(inboundAcceptedTimestamps.get(queueKey) || 0);
}

function getInboundStartupWatermark(contactId) {
  const queueKey = getInboundQueueKey(contactId);
  if (!queueKey) {
    return 0;
  }

  return Number(inboundStartupWatermarks.get(queueKey) || 0);
}

function rememberInboundStartupWatermark(contactId, timestampMs) {
  const queueKey = getInboundQueueKey(contactId);
  const safeTimestampMs = Number(timestampMs || 0);
  if (!queueKey || !(safeTimestampMs > 0)) {
    return 0;
  }

  const nextTimestamp = Math.max(getInboundStartupWatermark(queueKey), safeTimestampMs);
  inboundStartupWatermarks.set(queueKey, nextTimestamp);
  return nextTimestamp;
}

function rememberInboundAcceptedTimestamp(contactId, timestampMs) {
  const queueKey = getInboundQueueKey(contactId);
  const safeTimestampMs = Number(timestampMs || 0);
  if (!queueKey || !(safeTimestampMs > 0)) {
    return 0;
  }

  const nextTimestamp = Math.max(getInboundAcceptedTimestamp(queueKey), safeTimestampMs);
  inboundAcceptedTimestamps.set(queueKey, nextTimestamp);
  return nextTimestamp;
}

function shouldIgnoreMessageByInboundWatermark(contactId, timestampMs) {
  const safeTimestampMs = Number(timestampMs || 0);
  if (!(safeTimestampMs > 0)) {
    return false;
  }

  const watermark = getInboundAcceptedTimestamp(contactId);
  return watermark > 0 && safeTimestampMs < watermark;
}

function shouldIgnoreMessageByStartupWatermark(contactId, timestampMs) {
  const safeTimestampMs = Number(timestampMs || 0);
  if (!(safeTimestampMs > 0)) {
    return false;
  }

  const watermark = getInboundStartupWatermark(contactId);
  return watermark > 0 && safeTimestampMs <= watermark;
}

function clearInboundTrackingForContact(contactId) {
  const queueKeys = [...new Set(
    buildContactIdCandidates(contactId)
      .map(candidate => getInboundQueueKey(candidate))
      .filter(Boolean)
  )];
  if (!queueKeys.length) {
    return 0;
  }

  let latestGeneration = 0;
  for (const queueKey of queueKeys) {
    inboundResetCheckpoints.delete(queueKey);
    inboundProcessingChains.delete(queueKey);
    inboundAcceptedTimestamps.delete(queueKey);
    inboundStartupWatermarks.delete(queueKey);
    const nextGeneration = Number(inboundProcessingGenerations.get(queueKey) || 0) + 1;
    inboundProcessingGenerations.set(queueKey, nextGeneration);
    latestGeneration = Math.max(latestGeneration, nextGeneration);
  }

  return latestGeneration;
}

app.disable("x-powered-by");

app.use(
  express.json({
    limit: `${config.whatsappWebhookBodyLimitKb}kb`,
    verify(req, _res, buf) {
      req.rawBody = buf;
    }
  })
);

if (isCloudTransport && !config.whatsappMockMode && !webhookSignatureStatus.hardened) {
  console.warn(`Webhook signature hardening is not fully enforced yet (mode=${webhookSignatureStatus.mode}).`);
}

app.get("/health", (_req, res) => {
  const readiness = getSystemReadiness();
  res.status(200).json({
    ok: true,
    ready: readiness.ok
  });
});

app.get("/api/system/ready", (_req, res) => {
  const readiness = getSystemReadiness();
  res.status(readiness.ok ? 200 : 503).json(readiness);
});

app.get("/api/system/liveness", (_req, res) => {
  const liveness = buildOperationalLiveness();
  res.status(liveness.ok ? 200 : 503).json(liveness);
});

app.get("/whatsapp-qr", async (_req, res) => {
  const qr = getLatestQr();
  const runtime = getRuntimeStatus();

  if (!isWebTransport) {
    return res.status(400).type("html").send("<h1>QR no disponible en modo Cloud API.</h1>");
  }

  if (runtime.ready) {
    return res.status(200).type("html").send(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>WhatsApp Bot Vinculado</title>
          <style>
            body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; }
            .card { background: #111827; padding: 32px; border-radius: 16px; border: 1px solid #334155; width: min(560px, calc(100vw - 32px)); }
            h1 { margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Bot vinculado</h1>
            <p>La sesion de WhatsApp Web del bot ya esta autenticada.</p>
          </div>
        </body>
      </html>
    `);
  }

  if (!qr) {
    if (runtime.authMode === "connected_browser") {
      return res.status(200).type("html").send(`
        <!doctype html>
        <html lang="es">
          <head>
            <meta charset="utf-8" />
            <meta http-equiv="refresh" content="3" />
            <title>Esperando navegador</title>
            <style>
              body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; }
              .card { background: #111827; padding: 32px; border-radius: 16px; border: 1px solid #334155; width: min(640px, calc(100vw - 32px)); }
              code { color: #93c5fd; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Esperando WhatsApp Web ya logueado</h1>
              <p>Este modo no usa QR propio del bot.</p>
              <p>Abrí Chrome remoto con el perfil del bot y dejá <code>web.whatsapp.com</code> ya vinculado en ese navegador.</p>
              <p>Cuando la sesion quede disponible, esta pantalla se actualiza sola.</p>
            </div>
          </body>
        </html>
      `);
    }

    return res.status(200).type("html").send(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="refresh" content="3" />
          <title>Esperando QR</title>
          <style>
            body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; }
            .card { background: #111827; padding: 32px; border-radius: 16px; border: 1px solid #334155; width: min(560px, calc(100vw - 32px)); }
            h1 { margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Preparando QR</h1>
            <p>Espera unos segundos. Esta pantalla se actualiza sola.</p>
          </div>
        </body>
      </html>
    `);
  }

  let svg = "";
  try {
    svg = await QRCode.toString(qr, {
      type: "svg",
      width: 320,
      margin: 1
    });
  } catch (error) {
    return res.status(500).type("html").send(`<pre>Error generando QR: ${String(error?.message || error)}</pre>`);
  }

  return res.status(200).type("html").send(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta http-equiv="refresh" content="10" />
        <title>QR WhatsApp Bot</title>
        <style>
          body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; }
          .card { background: #111827; padding: 32px; border-radius: 16px; border: 1px solid #334155; width: min(560px, calc(100vw - 32px)); text-align: center; }
          .qr { background: white; display: inline-block; padding: 12px; border-radius: 12px; }
          p { line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Escanea este QR</h1>
          <p>Desde el telefono del chip de prueba: WhatsApp Business -> Dispositivos vinculados -> Vincular un dispositivo.</p>
          <div class="qr">${svg}</div>
        </div>
      </body>
    </html>
  `);
});

app.get("/", (_req, res) => {
  res.status(200).type("html").send(renderControlCenterDashboard());
});

app.get("/flows", (_req, res) => {
  res.status(200).type("html").send(renderFlowDashboard());
});

app.get("/flows/client", (_req, res) => {
  res.redirect(302, "/flows");
});

app.get("/conversations", (_req, res) => {
  res.status(200).type("html").send(renderConversationDashboard());
});

app.get("/api/flows", async (_req, res) => {
  try {
    const catalog = await getWorkflowCatalog();
    res.status(200).json(catalog);
  } catch (error) {
    console.error("Failed loading workflows", error);
    res.status(500).json({ error: "flow_load_failed" });
  }
});

app.put("/api/flows", async (req, res) => {
  try {
    const saved = await saveWorkflowCatalog(req.body || {});
    res.status(200).json(saved);
  } catch (error) {
    console.error("Failed saving workflows", error);
    res.status(500).json({ error: "flow_save_failed" });
  }
});

app.post("/api/flows/reset", async (_req, res) => {
  try {
    const reset = await resetWorkflowCatalog();
    res.status(200).json(reset);
  } catch (error) {
    console.error("Failed resetting workflows", error);
    res.status(500).json({ error: "flow_reset_failed" });
  }
});

function isAuditStorageUnavailableError(error) {
  return (
    error?.code === "audit_storage_unavailable" ||
    String(error?.message || "").includes("audit_storage_unavailable")
  );
}

function sendConversationApiError(res, error, fallbackCode) {
  if (isAuditStorageUnavailableError(error)) {
    return res.status(503).json({
      error: "audit_storage_unavailable",
      detail: "Se requiere storage persistente para historial de conversaciones."
    });
  }
  return res.status(500).json({ error: fallbackCode });
}

function buildInactivityCronErrorResponse(error) {
  if (isAuditStorageUnavailableError(error)) {
    const detail = String(error?.message || "")
      .replace(/^audit_storage_unavailable:?/i, "")
      .trim();

    return {
      status: 200,
      body: {
        ok: true,
        skipped: true,
        reason: "audit_storage_unavailable",
        detail: detail || "No fue posible acceder al storage persistente de auditoria."
      }
    };
  }

  return {
    status: 500,
    body: {
      error: String(error?.message || "unknown_error")
    }
  };
}

app.get("/api/system/storage", (_req, res) => {
  try {
    const status = getAuditStorageStatus();
    res.status(200).json(status);
  } catch (error) {
    console.error("Failed loading storage status", error);
    res.status(500).json({ error: "storage_status_failed" });
  }
});

app.get("/api/conversations", async (req, res) => {
  try {
    const conversations = await listConversations({
      limit: Number(req.query.limit || 60),
      status: String(req.query.status || ""),
      contactId: String(req.query.contactId || ""),
      tag: String(req.query.tag || "")
    });
    res.status(200).json(conversations);
  } catch (error) {
    console.error("Failed listing conversations", error);
    sendConversationApiError(res, error, "conversation_list_failed");
  }
});

app.get("/api/conversations/summary", async (_req, res) => {
  try {
    const summary = await getConversationSummary();
    res.status(200).json(summary);
  } catch (error) {
    console.error("Failed loading conversation summary", error);
    sendConversationApiError(res, error, "conversation_summary_failed");
  }
});

app.get("/api/conversations/:conversationId", async (req, res) => {
  try {
    const detail = await getConversationDetail(
      String(req.params.conversationId || ""),
      Number(req.query.limit || 250)
    );
    if (!detail) {
      return res.status(404).json({ error: "conversation_not_found" });
    }
    return res.status(200).json(detail);
  } catch (error) {
    console.error("Failed loading conversation detail", error);
    return sendConversationApiError(res, error, "conversation_detail_failed");
  }
});

app.get("/api/companion/conversations", async (req, res) => {
  try {
    const companionData = await getCompanionConversationsData({
      limit: Number(req.query.limit || 180),
      status: String(req.query.status || ""),
      contactId: String(req.query.contactId || ""),
      tag: String(req.query.tag || "")
    });
    res.status(200).json(
      buildCompanionPayload({
        conversations: companionData.conversations,
        summary: companionData.summary
      })
    );
  } catch (error) {
    console.error("Failed loading companion conversations", error);
    sendConversationApiError(res, error, "companion_conversation_list_failed");
  }
});

async function runInactivityCheck() {
  return processInactivityConversations({
    listConversations,
    dispatchAction: dispatchActionWithRecipientFallback,
    recordOutboundMessage,
    addConversationTag,
    recordFlowTransition,
    rememberPromptActions: conversationRulesPrivate.rememberExternalPromptActions,
    onDispatchError(conversation, error) {
      console.error(`Failed to process inactivity follow-up for ${conversation.contactId}:`, error);
    }
  });
}

function startLocalInactivityScheduler() {
  if (!isWebTransport || isVercelRuntime || isTestRuntime || localInactivityCheckHandle) {
    return false;
  }

  localInactivityCheckHandle = setInterval(() => {
    runInactivityCheck().catch(error => {
      console.error("Fallo el control local de inactividad:", error?.message || error);
    });
  }, LOCAL_INACTIVITY_CHECK_INTERVAL_MS);

  if (typeof localInactivityCheckHandle.unref === "function") {
    localInactivityCheckHandle.unref();
  }

  console.log(`Control local de inactividad activo cada ${Math.round(LOCAL_INACTIVITY_CHECK_INTERVAL_MS / 60000)} minutos.`);
  return true;
}

app.get("/api/cron/inactivity", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production" && isVercelRuntime) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const result = await runInactivityCheck();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const response = buildInactivityCronErrorResponse(err);
    if (response.status === 200) {
      console.warn("Cron inactivity skipped:", err?.message || err);
    } else {
      console.error("Cron inactivity error:", err);
    }
    return res.status(response.status).json(response.body);
  }
});

app.get("/webhook", (req, res) => {
  if (!isCloudTransport) {
    return res.status(200).send("Webhook deshabilitado en modo WhatsApp Web.");
  }

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.whatsappWebhookVerifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.get("/api/bot-mode", async (_req, res) => {
  try {
    const mode = await getBotMode();
    res.status(200).json({ mode, validModes: VALID_MODES, holdingMessage: HOLDING_MESSAGE });
  } catch (error) {
    console.error("Failed to read bot mode", error);
    res.status(500).json({ error: "bot_mode_read_failed" });
  }
});

app.post("/api/bot-mode", async (req, res) => {
  try {
    const result = await setBotMode(req.body?.mode);
    res.status(200).json(result);
  } catch (error) {
    if (error?.code === "invalid_bot_mode") {
      return res.status(400).json({ error: "invalid_bot_mode", validModes: VALID_MODES });
    }
    console.error("Failed to update bot mode", error);
    res.status(500).json({ error: "bot_mode_write_failed" });
  }
});

app.post("/webhook", async (req, res) => {
  if (!isCloudTransport) {
    return res.status(200).send("Webhook deshabilitado en modo WhatsApp Web.");
  }

  if (!validateWebhookSignature(req, config)) {
    return res.status(401).json({ error: "invalid_signature" });
  }

  try {
    await processIncomingEvent(req.body || {});
    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook processing failed:", error);
    return res.status(500).json({ error: "webhook_processing_failed" });
  }
});

if (!isVercelRuntime) {
  app.post("/api/dev/whatsapp/backfill-unread", async (_req, res) => {
    try {
      const result = await backfillLatestUnreadWebMessages();
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("Fallo el backfill manual de WhatsApp Web:", error);
      return res.status(500).json({ ok: false, error: "web_backfill_failed" });
    }
  });

  app.post("/api/dev/whatsapp/send-test", async (req, res) => {
    try {
      const to = String(req.body?.to || "").trim();
      const text = String(req.body?.text || "").trim();

      if (!to || !text) {
        return res.status(400).json({ ok: false, error: "missing_to_or_text" });
      }

      await sendWebTestMessage(to, text);
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Fallo el envio de prueba por WhatsApp Web:", error);
      return res.status(500).json({
        ok: false,
        error: "web_send_test_failed",
        detail: String(error?.message || error)
      });
    }
  });

  app.post("/api/dev/whatsapp/simulate-inbound", async (req, res) => {
    try {
      const contactId = String(req.body?.contactId || "").trim();
      const contactName = String(req.body?.contactName || "Cliente").trim() || "Cliente";
      const inboundText = String(req.body?.text || "").trim();
      const messageId = `dev-simulated-${Date.now()}`;

      if (!contactId || !inboundText) {
        return res.status(400).json({ ok: false, error: "missing_contact_or_text" });
      }

      await handleInboundConversation({
        contactId,
        contactName,
        inboundText,
        inboundMessage: {
          id: messageId,
          from: contactId,
          type: "chat",
          text: { body: inboundText }
        },
        messageId
      });

      return res.status(200).json({ ok: true, messageId });
    } catch (error) {
      console.error("Fallo la simulacion de mensaje entrante de WhatsApp Web:", error);
      return res.status(500).json({
        ok: false,
        error: "web_simulate_inbound_failed",
        detail: String(error?.message || error)
      });
    }
  });

  app.post("/api/dev/whatsapp/simulate-runtime-inbound", async (req, res) => {
    try {
      const contactId = String(req.body?.contactId || "").trim();
      const contactName = String(req.body?.contactName || "Cliente").trim() || "Cliente";
      const inboundText = String(req.body?.text || "").trim();
      const messageId = String(req.body?.messageId || `dev-runtime-${Date.now()}`).trim();
      const timestamp = Number(req.body?.timestamp || Math.floor(Date.now() / 1000));
      const sourceEvent = String(req.body?.sourceEvent || "dev_runtime").trim() || "dev_runtime";

      if (!contactId || !inboundText) {
        return res.status(400).json({ ok: false, error: "missing_contact_or_text" });
      }

      await handleNormalizedWebIncomingMessage(
        {
          id: messageId,
          from: contactId,
          body: inboundText,
          type: "chat",
          timestamp,
          notifyName: contactName,
          pushName: contactName,
          fromMe: false
        },
        sourceEvent
      );

      return res.status(200).json({ ok: true, messageId, timestamp, sourceEvent });
    } catch (error) {
      console.error("Fallo la simulacion runtime de mensaje entrante:", error);
      return res.status(500).json({
        ok: false,
        error: "web_simulate_runtime_inbound_failed",
        detail: String(error?.message || error)
      });
    }
  });

  app.post("/api/dev/whatsapp/simulate-advisor-closure", async (req, res) => {
    try {
      const contactId = String(req.body?.contactId || "").trim();
      const text = String(req.body?.text || "").trim();
      const messageId = String(req.body?.messageId || `dev-advisor-${Date.now()}`).trim();

      if (!contactId || !text) {
        return res.status(400).json({ ok: false, error: "missing_contact_or_text" });
      }

      const handled = await handleAdvisorClosureCandidate({
        messageId,
        contactId,
        outboundText: text
      });

      return res.status(200).json({ ok: true, handled, messageId });
    } catch (error) {
      console.error("Fallo la simulacion de cierre por asesor:", error);
      return res.status(500).json({
        ok: false,
        error: "simulate_advisor_closure_failed",
        detail: String(error?.message || error)
      });
    }
  });

  app.post("/api/dev/whatsapp/simulate-advisor-manual", async (req, res) => {
    try {
      const contactId = String(req.body?.contactId || "").trim();
      const text = String(req.body?.text || "").trim();
      const messageId = String(req.body?.messageId || `dev-advisor-manual-${Date.now()}`).trim();

      if (!contactId || !text) {
        return res.status(400).json({ ok: false, error: "missing_contact_or_text" });
      }

      const handled = await handleAdvisorHumanOutgoingMessage({
        messageId,
        contactId,
        outboundText: text
      });

      return res.status(200).json({ ok: true, handled, messageId });
    } catch (error) {
      console.error("Fallo la simulacion de intervencion manual del asesor:", error);
      return res.status(500).json({
        ok: false,
        error: "simulate_advisor_manual_failed",
        detail: String(error?.message || error)
      });
    }
  });

  app.post("/api/dev/whatsapp/reset-contact-state", async (req, res) => {
    try {
      const contactId = String(req.body?.contactId || "").trim();
      if (!contactId) {
        return res.status(400).json({ ok: false, error: "missing_contact" });
      }

      await conversationRules._private.resetContactState(contactId);
      clearInboundTrackingForContact(contactId);
      if (isWebTransport && config.whatsappWebNativeLabelsEnabled) {
        const currentState = await conversationRules._private.getContactConversationState(contactId).catch(() => null);
        await syncNativeLabelsForSession(contactId, currentState?.sessionData || {}).catch(error => {
          console.error("Fallo sincronizando etiquetas nativas tras reset manual del contacto:", error?.message || error);
        });
        if (shouldSyncInlineLabelNames()) {
          await syncConnectedBrowserCompanionOverlay().catch(error => {
            console.error("Fallo actualizando las etiquetas inline tras reset manual del contacto:", error?.message || error);
          });
        }
      }
      return res.status(200).json({ ok: true, contactId });
    } catch (error) {
      console.error("Fallo el reset de estado del contacto:", error);
      return res.status(500).json({ ok: false, error: "reset_contact_state_failed" });
    }
  });

  app.get("/api/dev/whatsapp/native-labels/status", async (_req, res) => {
    try {
      const labels = await getNativeLabelCatalog();
      return res.status(200).json({ ok: true, labels });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "native_labels_status_failed",
        detail: String(error?.message || error)
      });
    }
  });

  app.post("/api/dev/whatsapp/native-labels/bootstrap", async (_req, res) => {
    try {
      const result = await bootstrapNativeLabels();
      return res.status(result?.ok ? 200 : 500).json(result);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "native_labels_bootstrap_failed",
        detail: String(error?.message || error)
      });
    }
  });

  app.get("/api/dev/whatsapp/contact-state", async (req, res) => {
    try {
      const contactId = String(req.query?.contactId || "").trim();
      if (!contactId) {
        return res.status(400).json({ ok: false, error: "missing_contact" });
      }

      const candidates = buildPreferredContactIdCandidates(contactId);
      const states = [];

      for (const candidate of candidates) {
        const state = await conversationRules._private.getContactConversationState(candidate);
        states.push({
          contactId: candidate,
          state: String(state?.state || "idle"),
          step: state?.step || null,
          sessionData: state?.sessionData || {}
        });
      }

      const currentState = states.find(item => item.state !== "idle" || item.step) || states[0] || null;
      const nativeLabels = await getNativeLabelNamesForContact(contactId).catch(() => []);
      const nativeConversation =
        isWebTransport && config.whatsappWebNativeLabelsEnabled
          ? (await listNativeLabelConversations({ limit: 5, contactId }).catch(() => []))[0] || null
          : null;

      return res.status(200).json({
        ok: true,
        contactId,
        candidates,
        currentState,
        states,
        nativeLabels,
        nativeConversation
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "contact_state_failed",
        detail: String(error?.message || error)
      });
    }
  });
}

function getSystemReadiness() {
  return buildSystemReadiness({
    config,
    auditStorageStatus: getAuditStorageStatus(),
    pharmacyLookupStatus: getPharmacyLookupStatus(),
    whatsappRuntimeStatus: getRuntimeStatus()
  });
}

function buildCompanionSummary(conversations) {
  const safe = Array.isArray(conversations) ? conversations : [];
  const total = safe.length;
  const agentPending = safe.filter(conversation => String(conversation?.status || "") === "agent_pending").length;
  const closed = safe.filter(conversation => String(conversation?.status || "") === "closed").length;
  const open = Math.max(0, total - agentPending - closed);
  const testRuns = safe.filter(conversation => Array.isArray(conversation?.tagIds) && conversation.tagIds.includes("test_run")).length;
  const lastEventAt = safe
    .map(conversation => String(conversation?.lastEventAt || "").trim())
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    total,
    open,
    agentPending,
    closed,
    testRuns,
    lastEventAt
  };
}

async function getCompanionConversationsData({ limit = 180, status = "", contactId = "", tag = "" } = {}) {
  try {
    const conversations = await listConversations({ limit, status, contactId, tag });
    const enrichedConversations =
      isWebTransport && config.whatsappWebNativeLabelsEnabled
        ? await mergeConversationsWithNativeLabels(conversations, { limit, status, contactId, tag })
        : conversations;
    const summary = await getConversationSummary();
    return { conversations: enrichedConversations, summary };
  } catch (error) {
    if (!isWebTransport || !config.whatsappWebNativeLabelsEnabled) {
      throw error;
    }

    const now = Date.now();
    if (now - lastCompanionFallbackWarnAt >= COMPANION_FALLBACK_WARN_COOLDOWN_MS) {
      lastCompanionFallbackWarnAt = now;
      console.warn("Companion conversations fell back to native WhatsApp labels:", error?.message || error);
    }
    const conversations = await listNativeLabelConversations({ limit, status, contactId, tag });
    return {
      conversations,
      summary: buildCompanionSummary(conversations)
    };
  }
}

async function mergeConversationsWithNativeLabels(conversations, { limit = 180 } = {}) {
  const primary = Array.isArray(conversations) ? conversations : [];
  const nativeConversations = await listNativeLabelConversations({ limit });
  if (!nativeConversations.length) {
    return primary;
  }

  const nativeByContactId = new Map();
  for (const conversation of nativeConversations) {
    for (const candidate of buildContactIdCandidates(conversation.contactId)) {
      nativeByContactId.set(candidate, conversation);
    }
  }

  const merged = primary.map(conversation => {
    const nativeConversation =
      buildContactIdCandidates(conversation.contactId)
        .map(candidate => nativeByContactId.get(candidate))
        .find(Boolean) || null;

    if (!nativeConversation) {
      return conversation;
    }

    const existingTags = Array.isArray(conversation?.tags) ? conversation.tags : [];
    const existingTagIds = Array.isArray(conversation?.tagIds) ? conversation.tagIds : [];
    const mergedTagIds = [...new Set([
      ...existingTags.map(tag => String(tag?.id || tag || "").trim()).filter(Boolean),
      ...existingTagIds.map(tag => String(tag || "").trim()).filter(Boolean),
      ...(Array.isArray(nativeConversation.tagIds) ? nativeConversation.tagIds : []).map(tag => String(tag || "").trim()).filter(Boolean)
    ])];
    const mergedTags = getClientFacingConversationTags(mergedTagIds);

    return {
      ...conversation,
      tags: mergedTags,
      tagIds: mergedTagIds,
      summary: conversation.summary || nativeConversation.summary,
      previewText: conversation.previewText || nativeConversation.previewText,
      previewSide: conversation.previewSide || nativeConversation.previewSide
    };
  });

  const knownIds = new Set(merged.map(conversation => String(conversation?.contactId || "")));
  for (const nativeConversation of nativeConversations) {
    const alreadyKnown = [...knownIds].some(contact => matchesContactIdVariant(contact, nativeConversation.contactId));
    if (!alreadyKnown) {
      merged.push(nativeConversation);
      knownIds.add(String(nativeConversation.contactId || ""));
    }
  }

  return merged
    .sort((left, right) => {
      const leftTime = Number(new Date(left?.lastEventAt || 0).getTime() || 0);
      const rightTime = Number(new Date(right?.lastEventAt || 0).getTime() || 0);
      return rightTime - leftTime;
    })
    .slice(0, Math.max(1, Number(limit || 180)));
}

async function buildCompanionOverlayPayload() {
  const companionData = await getCompanionConversationsData({ limit: 180 });
  return buildCompanionPayload(companionData);
}

function shouldSyncInlineLabelNames() {
  return isWebTransport && (config.whatsappWebInlineOverlayEnabled || config.whatsappWebNativeLabelsEnabled);
}

async function syncConnectedBrowserCompanionOverlay() {
  if (!shouldSyncInlineLabelNames()) {
    return false;
  }

  await reconcileOperationalWhatsAppPage().catch(() => null);
  const activeClient = getClient();
  const page = activeClient?.pupPage || null;
  if (!page) {
    return false;
  }

  const payload = await buildCompanionOverlayPayload();
  await syncCompanionOverlayPage(page, payload);
  return true;
}

function startWebCompanionOverlaySync() {
  if (!shouldSyncInlineLabelNames() || webCompanionOverlayHandle) {
    return;
  }

  const run = () => {
    syncConnectedBrowserCompanionOverlay().catch(error => {
      console.warn("Companion overlay sync failed:", error?.message || error);
    });
  };

  run();
  webCompanionOverlayHandle = setInterval(run, WEB_COMPANION_OVERLAY_INTERVAL_MS);
}

async function clearConnectedBrowserCompanionOverlay() {
  if (!isWebTransport) {
    return false;
  }

  const activeClient = getClient();
  const page = activeClient?.pupPage || null;
  if (!page) {
    return false;
  }

  await clearCompanionOverlayPage(page);
  return true;
}

function startNativeLabelBootstrap() {
  if (!isWebTransport || !config.whatsappWebNativeLabelsEnabled || !config.whatsappWebNativeLabelBootstrapOnStart) {
    return;
  }

  if (nativeLabelBootstrapStarted) {
    return;
  }

  nativeLabelBootstrapStarted = true;
  runDetachedTask(async () => {
    try {
      const result = await bootstrapNativeLabels();
      if (!result?.ok) {
        nativeLabelBootstrapStarted = false;
        console.warn(`Bootstrap de etiquetas nativas no completado: ${result?.reason || "unknown_reason"}`);
        return;
      }

      if (Array.isArray(result.created) && result.created.length) {
        console.log(`Etiquetas nativas creadas: ${result.created.join(", ")}`);
      }

      if (shouldSyncInlineLabelNames()) {
        await syncConnectedBrowserCompanionOverlay().catch(error => {
          console.warn("No se pudieron sincronizar las etiquetas inline tras el bootstrap nativo:", error?.message || error);
        });
      }
    } catch (error) {
      nativeLabelBootstrapStarted = false;
      throw error;
    }
  }, "Fallo el bootstrap de etiquetas nativas:");
}

function runDetachedTask(task, errorPrefix) {
  Promise.resolve()
    .then(task)
    .catch(error => {
      console.error(errorPrefix, error?.message || error);
    });
}

function prewarmWebFastPath() {
  if (!FAST_WEB_RESPONSE_MODE) {
    return;
  }

  runDetachedTask(async () => {
    await Promise.allSettled([getBotMode(), getChatbotRuntimeConfig()]);
  }, "Fallo el precalentamiento del runtime web:");
}

function isStaleInboundProcessing(contactId, generation) {
  const safeGeneration = Number(generation || 0);
  if (!(safeGeneration > 0)) {
    return false;
  }
  return getInboundProcessingGeneration(contactId) !== safeGeneration;
}

function ensureInboundProcessingGeneration(contactId) {
  const queueKey = getInboundQueueKey(contactId);
  if (!queueKey) {
    return 0;
  }

  const currentGeneration = Number(inboundProcessingGenerations.get(queueKey) || 0);
  if (currentGeneration > 0) {
    return currentGeneration;
  }

  inboundProcessingGenerations.set(queueKey, 1);
  return 1;
}

async function handleInboundConversation({
  contactId,
  contactName,
  inboundText,
  inboundMessage,
  messageId,
  inboundTimestampMs = 0,
  processingGeneration = 0
}) {
  if (shouldIgnoreMessageByResetCheckpoint(contactId, messageId, inboundTimestampMs)) {
    console.log(`Se descarto un mensaje anterior ya reiniciado para ${contactId}.`);
    return;
  }

  const auditConversationPromise = Promise.resolve()
    .then(() =>
      recordInboundMessage({
        contactId,
        contactName,
        inboundText,
        inboundMessage,
        messageId
      })
    )
    .catch(error => {
      console.error("Audit inbound failed:", error?.message || error);
      return null;
    });

  const botMode = await withTimeout(
    getBotMode(),
    2500,
    () => buildTimeoutError("bot_mode_timeout", "La consulta de modo del bot excedio el tiempo esperado.", { contactId })
  );
  const replyHandler = config.agenticMode ? nextAgentBotReply : nextRuleBotReply;
  const flowResult =
    botMode === "holding"
      ? {
          actions: [{ type: "text", text: HOLDING_MESSAGE }],
          meta: { routeKey: "holding_auto_reply", mode: "holding" }
        }
      : await withTimeout(
          replyHandler({
            contactId,
            contactName,
            inboundText,
            inboundMessage
          }),
          INBOUND_CONVERSATION_TIMEOUT_MS,
          () =>
            buildTimeoutError(
              "reply_handler_timeout",
              `La logica del bot excedio ${INBOUND_CONVERSATION_TIMEOUT_MS} ms.`,
              { contactId }
            )
        );

  if (isStaleInboundProcessing(contactId, processingGeneration)) {
    console.log(`Se descarto una respuesta obsoleta para ${contactId} tras un reinicio de flujo mas nuevo.`);
    return;
  }

  if (isWebTransport && config.whatsappWebNativeLabelsEnabled) {
    runDetachedTask(async () => {
      await syncNativeLabelsForSession(contactId, {
        ...(flowResult?.meta?.sessionData || {}),
        waitingAdvisor: Boolean(flowResult?.meta?.handedToHuman)
      });
      if (shouldSyncInlineLabelNames()) {
        await syncConnectedBrowserCompanionOverlay();
      }
    }, "Fallo la sincronizacion de etiquetas nativas:");
  }

  const recordFlowTransitionTask = async () => {
    const auditConversation = await auditConversationPromise;
    await recordFlowTransition({
      conversationId: auditConversation?.id,
      flowMeta: flowResult?.meta
    });
  };

  if (FAST_WEB_RESPONSE_MODE) {
    runDetachedTask(recordFlowTransitionTask, "Audit flow transition failed:");
  } else {
    await recordFlowTransitionTask().catch(error => {
      console.error("Audit flow transition failed:", error?.message || error);
    });
  }

  for (const action of flowResult.actions || []) {
    if (isStaleInboundProcessing(contactId, processingGeneration)) {
      console.log(`Se cancelo un envio obsoleto para ${contactId} porque ya entro un mensaje mas nuevo.`);
      return;
    }
    if (shouldIgnoreMessageByResetCheckpoint(contactId, messageId, inboundTimestampMs)) {
      console.log(`Se cancelo un envio previo al reinicio mas nuevo para ${contactId}.`);
      return;
    }
    try {
      await withTimeout(
        dispatchActionWithRecipientFallback(contactId, action),
        OUTBOUND_ACTION_TIMEOUT_MS,
        () =>
          buildTimeoutError(
            "outbound_send_timeout",
            `El envio al contacto ${contactId} excedio ${OUTBOUND_ACTION_TIMEOUT_MS} ms.`,
            { contactId }
          )
      );
      markOutboundSent(contactId);
      const recordOutboundSentTask = async () => {
        const auditConversation = await auditConversationPromise;
        await recordOutboundMessage({
          conversationId: auditConversation?.id,
          action,
          status: "sent"
        });
      };

      if (FAST_WEB_RESPONSE_MODE) {
        runDetachedTask(recordOutboundSentTask, "Audit outbound sent failed:");
      } else {
        await recordOutboundSentTask().catch(error => {
          console.error("Audit outbound sent failed:", error?.message || error);
        });
      }
    } catch (error) {
      const recordOutboundFailureTask = async () => {
        const auditConversation = await auditConversationPromise;
        await recordOutboundMessage({
          conversationId: auditConversation?.id,
          action,
          status: "failed",
          error: error?.message || "send_failed"
        });
      };

      if (FAST_WEB_RESPONSE_MODE) {
        runDetachedTask(recordOutboundFailureTask, "Audit outbound failure failed:");
      } else {
        await recordOutboundFailureTask().catch(auditError => {
          console.error("Audit outbound failure failed:", auditError?.message || auditError);
        });
      }
      if (error?.code === "outbound_send_timeout") {
        markRuntimeTimeout(`outbound_send_timeout:${contactId}`);
        runDetachedTask(async () => {
          await reconcileOperationalWhatsAppPage().catch(() => null);
        }, "Fallo recuperando el runtime tras timeout de envio:");
      } else {
        markRuntimeError(`outbound_send_failed:${contactId}:${error?.message || error}`);
      }
      throw error;
    }
  }
}

async function enqueueInboundConversation(contactId, task, generationOverride = null) {
  const queueKey = getInboundQueueKey(contactId);
  if (!queueKey) {
    return Promise.resolve().then(task);
  }

  const generation = Number.isFinite(Number(generationOverride))
    ? Number(generationOverride)
    : getInboundProcessingGeneration(queueKey);
  const previous = inboundProcessingChains.get(queueKey) || Promise.resolve();
  const current = previous
    .catch(() => null)
    .then(async () => {
      if (getInboundProcessingGeneration(queueKey) !== generation) {
        return null;
      }
      markQueueStarted(queueKey, contactId, generation);
      try {
        const result = await Promise.resolve().then(task);
        markInboundProcessed(contactId);
        return result;
      } catch (error) {
        markRuntimeError(`inbound_processing_failed:${contactId}:${error?.message || error}`);
        throw error;
      } finally {
        clearQueueStarted(queueKey);
      }
    });

  inboundProcessingChains.set(queueKey, current);

  try {
    return await current;
  } finally {
    if (inboundProcessingChains.get(queueKey) === current) {
      inboundProcessingChains.delete(queueKey);
    }
  }
}

function cleanupInboundResetCheckpoints(now = Date.now()) {
  for (const [contactId, checkpoint] of inboundResetCheckpoints.entries()) {
    const updatedAt = Number(checkpoint?.updatedAt || 0);
    if (updatedAt <= 0 || now - updatedAt > INBOUND_RESET_CHECKPOINT_TTL_MS) {
      inboundResetCheckpoints.delete(contactId);
    }
  }
}

function setInboundResetCheckpoint(contactId, timestampMs, messageId = "") {
  const queueKey = getInboundQueueKey(contactId);
  if (!queueKey) {
    return;
  }

  cleanupInboundResetCheckpoints();
  inboundResetCheckpoints.set(queueKey, {
    timestampMs: Number(timestampMs || 0) > 0 ? Number(timestampMs) : Date.now(),
    messageId: String(messageId || "").trim(),
    updatedAt: Date.now()
  });
}

function clearInboundResetCheckpoint(contactId) {
  const queueKey = getInboundQueueKey(contactId);
  if (!queueKey) {
    return;
  }
  inboundResetCheckpoints.delete(queueKey);
}

function shouldIgnoreMessageByResetCheckpoint(contactId, messageId, timestampMs) {
  const queueKey = getInboundQueueKey(contactId);
  if (!queueKey) {
    return false;
  }

  cleanupInboundResetCheckpoints();
  const checkpoint =
    inboundResetCheckpoints.get(queueKey) ||
    [...inboundResetCheckpoints.entries()]
      .find(([candidateContactId]) => matchesContactIdVariant(candidateContactId, queueKey))
      ?.at(1);
  if (!checkpoint) {
    return false;
  }

  const normalizedMessageId = String(messageId || "").trim();
  if (normalizedMessageId && normalizedMessageId === String(checkpoint.messageId || "").trim()) {
    return false;
  }

  const safeTimestampMs = Number(timestampMs || 0);
  if (!(safeTimestampMs > 0)) {
    return Date.now() - Number(checkpoint.updatedAt || 0) <= 15000;
  }

  return safeTimestampMs < Number(checkpoint.timestampMs || 0);
}

function getInboundProcessingGeneration(contactId) {
  const queueKey = getInboundQueueKey(contactId);
  return Number(inboundProcessingGenerations.get(queueKey) || 0);
}

function bumpInboundProcessingGeneration(contactId) {
  const queueKey = getInboundQueueKey(contactId);
  if (!queueKey) {
    return 0;
  }

  const nextGeneration = getInboundProcessingGeneration(queueKey) + 1;
  inboundProcessingGenerations.set(queueKey, nextGeneration);
  return nextGeneration;
}

async function findLatestConversationByContactId(contactId) {
  for (const candidate of buildPreferredContactIdCandidates(contactId)) {
    try {
      const conversations = await listConversations({
        limit: 1,
        contactId: candidate
      });
      if (Array.isArray(conversations) && conversations.length) {
        return conversations[0];
      }
    } catch (error) {
      console.error("No se pudo buscar la conversacion para cierre de asesor:", error?.message || error);
    }
  }

  return null;
}

function hasManagedRuntimeConversationState(currentState) {
  return Boolean(
    currentState &&
      (
        String(currentState?.state || "").toLowerCase() !== "idle" ||
        String(currentState?.step || "").trim() ||
        Boolean(currentState?.sessionData?.waitingAdvisor) ||
        Boolean(currentState?.sessionData?.manualAdvisorIntervened)
      )
  );
}

async function resolveConversationContactId(contactId) {
  const currentState = await conversationRules._private.getContactConversationState(contactId);
  if (hasManagedRuntimeConversationState(currentState)) {
    return String(contactId || "").trim();
  }

  const conversation = await findLatestConversationByContactId(contactId);
  if (conversation?.contactId) {
    return String(conversation.contactId || "").trim();
  }

  for (const candidate of buildPreferredContactIdCandidates(contactId)) {
    const candidateState = await conversationRules._private.getContactConversationState(candidate);
    if (hasManagedRuntimeConversationState(candidateState)) {
      return candidate;
    }
  }

  return String(contactId || "").trim();
}

async function handleAdvisorClosureByHumanMessage(msg) {
  const messageId = String(msg?.id?._serialized || "").trim();
  const rawTo = String(
    msg?.to?._serialized ||
    msg?.to ||
    msg?.id?.remote ||
    msg?._data?.to ||
    msg?.chatId?._serialized ||
    msg?.from?._serialized ||
    msg?.from ||
    ""
  ).trim();
  const outboundText = String(msg?.body || "").trim();

  if (
    isProcessedAdvisorClosureMessageId(messageId) ||
    webTextClientPrivate.wasBotSentMessageId(messageId) ||
    webTextClientPrivate.wasRecentBotOutboundText(rawTo, outboundText)
  ) {
    return false;
  }

  if (!rawTo || rawTo.includes("@g.us") || msg?.isStatus) {
    return false;
  }

  const contactId = normalizeWebContactId(rawTo);
  return handleAdvisorHumanOutgoingMessage({
    messageId,
    contactId,
    outboundText
  });
}

function markProcessedAdvisorClosureMessageId(messageId) {
  const normalizedId = String(messageId || "").trim();
  if (!normalizedId) {
    return;
  }
  processedAdvisorClosureMessageIds.add(normalizedId);
  trimProcessedIds(processedAdvisorClosureMessageIds, MAX_TRACKED_ADVISOR_MESSAGE_IDS);
}

function isProcessedAdvisorClosureMessageId(messageId) {
  return processedAdvisorClosureMessageIds.has(String(messageId || "").trim());
}

async function handleAdvisorClosureCandidate({ messageId, contactId, outboundText }) {
  if (!contactId || !outboundText || !isAdvisorClosureText(outboundText)) {
    return false;
  }

  if (messageId) {
    markProcessedAdvisorClosureMessageId(messageId);
  }

  const resolvedContactId = await resolveConversationContactId(contactId);
  const currentState = await conversationRules._private.getContactConversationState(resolvedContactId);
  const conversation = await findLatestConversationByContactId(resolvedContactId);
  const nativeConversation =
    isWebTransport && config.whatsappWebNativeLabelsEnabled
      ? (await listNativeLabelConversations({ limit: 5, contactId: resolvedContactId }).catch(() => []))[0] || null
      : null;
  const waitingAdvisor = Boolean(currentState?.sessionData?.waitingAdvisor || currentState?.state === "agent");
  const hasRuntimeConversation = hasManagedRuntimeConversationState(currentState);
  const nativeWaitingAdvisor =
    isWebTransport && config.whatsappWebNativeLabelsEnabled
      ? await hasManagedNativeLabelForContact(resolvedContactId, "esperando_asesor").catch(() => false)
      : false;
  const hasKnownConversation = Boolean(conversation || nativeConversation);
  if (!waitingAdvisor && !nativeWaitingAdvisor && !hasRuntimeConversation && !hasKnownConversation) {
    return false;
  }

  const sessionData = (await conversationRules._private.closeContactConversation(resolvedContactId)) || {
    waitingAdvisor: false
  };
  const conversationId = conversation?.id || null;

  await sendTextMessage(resolvedContactId, buildAdvisorClosureFarewell());

  if (isWebTransport && config.whatsappWebNativeLabelsEnabled) {
    await syncNativeLabelsForSession(resolvedContactId, {
      ...sessionData,
      waitingAdvisor: false,
      advisorHandoffReason: "",
      manualAdvisorIntervened: false,
      finalized: true
    }).catch(error => {
      console.error("Fallo quitando la etiqueta de asesor en el cierre humano:", error?.message || error);
    });
    if (shouldSyncInlineLabelNames()) {
      await syncConnectedBrowserCompanionOverlay().catch(error => {
        console.error("Fallo actualizando las etiquetas inline tras el cierre humano:", error?.message || error);
      });
    }
  }

  if (conversationId) {
    await recordFlowTransition({
      conversationId,
      flowMeta: {
        routeKey: "advisor_closed_by_human",
        after: {
          state: "idle",
          step: null
        },
        closed: true,
        handedToHuman: false,
        sessionData: {
          ...sessionData,
          waitingAdvisor: false,
          advisorHandoffReason: "",
          manualAdvisorIntervened: false,
          finalized: true
        }
      }
    }).catch(error => {
      console.error("Fallo registrando el cierre humano del asesor:", error?.message || error);
    });

    await recordOutboundMessage({
      conversationId,
      action: {
        type: "text",
        text: buildAdvisorClosureFarewell()
      },
      status: "sent"
    }).catch(error => {
      console.error("Fallo auditando la despedida automatica del asesor:", error?.message || error);
    });
  }

  return true;
}

async function handleAdvisorHumanOutgoingMessage({ messageId, contactId, outboundText }) {
  if (!contactId || !outboundText) {
    return false;
  }

  const handledClosure = await handleAdvisorClosureCandidate({
    messageId,
    contactId,
    outboundText
  });
  if (handledClosure) {
    return true;
  }

  const resolvedContactId = await resolveConversationContactId(contactId);
  const currentState = await conversationRules._private.getContactConversationState(resolvedContactId).catch(() => null);
  const conversation = await findLatestConversationByContactId(resolvedContactId).catch(() => null);
  const nativeConversation =
    isWebTransport && config.whatsappWebNativeLabelsEnabled
      ? (await listNativeLabelConversations({ limit: 5, contactId: resolvedContactId }).catch(() => []))[0] || null
      : null;
  const waitingAdvisor = Boolean(currentState?.sessionData?.waitingAdvisor || currentState?.state === "agent");
  const hasRuntimeConversation = hasManagedRuntimeConversationState(currentState);
  const hasKnownConversation = Boolean(conversation || nativeConversation);
  if (!waitingAdvisor && !hasRuntimeConversation && !hasKnownConversation) {
    return false;
  }

  const sessionData = await conversationRules._private.markAdvisorManualControl(resolvedContactId).catch(() => null);
  if (!sessionData) {
    return false;
  }

  if (messageId) {
    markProcessedAdvisorClosureMessageId(messageId);
  }

  if (isWebTransport && config.whatsappWebNativeLabelsEnabled) {
    await syncNativeLabelsForSession(resolvedContactId, sessionData).catch(error => {
      console.error("Fallo sincronizando etiquetas tras la intervencion manual del asesor:", error?.message || error);
    });
    if (shouldSyncInlineLabelNames()) {
      await syncConnectedBrowserCompanionOverlay().catch(error => {
        console.error("Fallo actualizando las etiquetas inline tras la intervencion manual del asesor:", error?.message || error);
      });
    }
  }

  return true;
}

async function processIncomingEvent(payload) {
  const entries = payload.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const contacts = change.value?.contacts || [];
      const contactNamesByWaId = new Map();
      for (const contact of contacts) {
        const waId = contact?.wa_id;
        if (!waId) {
          continue;
        }
        contactNamesByWaId.set(waId, contact?.profile?.name || "");
      }

      const messages = change.value?.messages || [];
      for (const message of messages) {
        const messageId = message.id;
        const from = message.from;

        if (!messageId || !from) {
          continue;
        }

        if (processedMessageIds.has(messageId)) {
          continue;
        }

        processedMessageIds.add(messageId);
        trimProcessedIds(processedMessageIds, 10000);

        await handleInboundConversation({
          contactId: from,
          contactName: contactNamesByWaId.get(from) || "",
          inboundText: extractInboundText(message),
          inboundMessage: message,
          messageId
        });
      }
    }
  }
}

async function dispatchActionWithRecipientFallback(to, action) {
  const candidates = buildRecipientCandidates(to);
  let lastError = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const recipient = candidates[i];
    const isLastAttempt = i === candidates.length - 1;

    try {
      await withTimeout(
        sendAction(recipient, action),
        OUTBOUND_RECIPIENT_ATTEMPT_TIMEOUT_MS,
        () =>
          buildTimeoutError(
            "recipient_send_timeout",
            `El envio al destinatario ${recipient} excedio ${OUTBOUND_RECIPIENT_ATTEMPT_TIMEOUT_MS} ms.`,
            { recipient, originalRecipient: to }
          )
      );
      if (recipient !== to) {
        console.log(`Delivery succeeded with alternate recipient format: ${recipient}`);
      }
      return;
    } catch (error) {
      lastError = error;

      if (!isLastAttempt && isRetryableRecipientDispatchError(error)) {
        console.warn(`Delivery fallido para ${recipient}. Reintentando con formato alternativo...`, error?.message || error);
        await reconcileOperationalWhatsAppPage().catch(() => null);
        continue;
      }

      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }
}

async function sendAction(to, action) {
  if (action.type === "text") {
    await sendTextMessage(to, action.text);
  } else if (action.type === "interactive") {
    if (action.interactiveType === "list") {
      await sendInteractiveList(to, action.text, action.buttonText || "Ver opciones", action.sections || []);
    } else {
      await sendInteractiveButtons(to, action.text, action.buttons);
    }
  } else if (action.type === "image") {
    await sendImageMessage(to, action.url, action.caption);
  }
}

function buildRecipientCandidates(to) {
  const candidates = buildPreferredContactIdCandidates(to);

  if (!candidates.length && to) {
    candidates.push(to);
  }

  if (typeof to === "string" && /^549\d+$/.test(to)) {
    candidates.push(`54${to.slice(3)}`);
  }

  const arMobile = typeof to === "string" && to.match(/^549(\d{2})(\d{8})$/);
  if (arMobile) {
    candidates.push(`54${arMobile[1]}15${arMobile[2]}`);
  }

  return [...new Set(candidates)];
}

function isRecipientNotAllowedError(error) {
  const code = error?.response?.data?.error?.code;
  return Number(code) === 131030;
}

function isRetryableRecipientDispatchError(error) {
  if (isRecipientNotAllowedError(error)) {
    return true;
  }

  const code = String(error?.code || "").trim().toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  return (
    code === "recipient_send_timeout" ||
    code === "outbound_send_timeout" ||
    message.includes("execution context") ||
    message.includes("target closed") ||
    message.includes("session closed") ||
    message.includes("protocol error") ||
    message.includes("socket closed")
  );
}

function extractInboundText(message) {
  if (typeof message?.text?.body === "string") {
    return message.text.body;
  }

  if (typeof message?.button?.text === "string") {
    return message.button.text;
  }

  if (typeof message?.interactive?.button_reply?.title === "string") {
    return message.interactive.button_reply.title;
  }

  if (typeof message?.interactive?.list_reply?.title === "string") {
    return message.interactive.list_reply.title;
  }

  return "";
}

function serializeClientIncomingMessage(msg) {
  if (!msg) {
    return null;
  }

  return {
    id: String(msg?.id?._serialized || "").trim() || null,
    from:
      msg?.from?._serialized ||
      msg?.from ||
      msg?.id?.remote?._serialized ||
      msg?.id?.remote ||
      msg?.chatId?._serialized ||
      null,
    body: String(msg?.body || ""),
    type: String(msg?.type || "chat"),
    timestamp: Number(msg?.timestamp || msg?._data?.t || 0),
    notifyName: String(msg?.notifyName || msg?._data?.notifyName || ""),
    pushName: String(msg?._data?.pushname || msg?.author?.pushname || ""),
    fromMe: Boolean(msg?.fromMe || msg?.id?.fromMe)
  };
}

function trimProcessedIds(store, maxSize) {
  if (store.size <= maxSize) {
    return;
  }

  const toDelete = store.size - maxSize;
  let deleted = 0;

  for (const id of store) {
    store.delete(id);
    deleted += 1;
    if (deleted >= toDelete) {
      break;
    }
  }
}

function isHistoricWebMessage(message) {
  const timestamp = normalizeWebMessageTimestampSeconds(message?.timestamp);
  return timestamp > 0 && timestamp < webIncomingBridgeBaselineTimestamp;
}

function normalizeWebMessageTimestampSeconds(rawTimestamp) {
  const value = Number(rawTimestamp || 0);
  if (!(value > 0)) {
    return 0;
  }

  return value > 1000000000000 ? Math.floor(value / 1000) : Math.floor(value);
}

function normalizeWebContactId(rawFrom) {
  return normalizeTransportContactId(rawFrom);
}

async function seedExistingWebInboundMessageIds(options = {}) {
  const force = Boolean(options?.force);
  if (webIncomingSeeded && !force) {
    return;
  }

  const baselineTimestampSeconds = Math.max(
    webIncomingBridgeBaselineTimestamp,
    Number(options?.baselineTimestampSeconds || 0) > 0
      ? Number(options.baselineTimestampSeconds)
      : webIncomingBridgeBaselineTimestamp
  );
  const baselineTimestampMs = baselineTimestampSeconds * 1000;

  const messages = await collectWebIncomingMessages({
    minTimestamp: Math.floor(Date.now() / 1000) - 7200,
    unreadOnly: false,
    limit: 250,
    logErrors: false
  });

  for (const message of messages) {
    if (message?.id) {
      processedMessageIds.add(message.id);
    }

    const contactId = normalizeWebContactId(message?.from);
    const timestampMs = normalizeWebMessageTimestampSeconds(message?.timestamp) * 1000;
    if (contactId && timestampMs > 0) {
      const effectiveTimestampMs = Math.max(timestampMs, baselineTimestampMs);
      rememberInboundStartupWatermark(contactId, effectiveTimestampMs);
      rememberInboundAcceptedTimestamp(contactId, effectiveTimestampMs);
    }
  }

  trimProcessedIds(processedMessageIds, 10000);
  webIncomingBridgeBaselineTimestamp = baselineTimestampSeconds;
  webIncomingSeeded = true;
}

async function refreshWebIncomingBaseline(reason = "runtime_event", options = {}) {
  if (!isWebTransport) {
    return false;
  }

  if (webIncomingBaselineRefreshPromise) {
    return webIncomingBaselineRefreshPromise;
  }

  webIncomingBaselineRefreshPromise = (async () => {
    await reconcileOperationalWhatsAppPage().catch(() => null);
    const runtime = getRuntimeStatus();
    const page = getClient()?.pupPage;

    if (!runtime.authenticated || !page) {
      return false;
    }

    const recoveryResult = options?.recoverPendingUnread
      ? await recoverLatestPendingWebMessages(reason)
      : { processedCount: 0, chatsSeen: 0 };
    const baselineTimestampSeconds = Math.floor(Date.now() / 1000);
    webIncomingBridgeBaselineTimestamp = Math.max(webIncomingBridgeBaselineTimestamp, baselineTimestampSeconds);
    webIncomingSeeded = false;
    webIncomingLastHealthyPollAt = 0;
    await seedExistingWebInboundMessageIds({
      force: true,
      baselineTimestampSeconds
    });
    if (recoveryResult.processedCount > 0) {
      console.log(
        `Se recuperaron ${recoveryResult.processedCount} mensajes pendientes al volver online (${reason}).`
      );
    }
    console.log(`Baseline de mensajes entrantes de WhatsApp Web refrescada (${reason}).`);
    return true;
  })();

  try {
    return await webIncomingBaselineRefreshPromise;
  } finally {
    webIncomingBaselineRefreshPromise = null;
  }
}

async function flushQueuedWebIncomingMessagesForContact(contactId, { upToTimestampMs = Date.now(), excludeMessageId = "" } = {}) {
  const normalizedContactId = String(contactId || "").trim();
  if (!normalizedContactId) {
    return 0;
  }

  const messages = await collectWebIncomingMessages({
    minTimestamp: Math.floor(Date.now() / 1000) - 7200,
    unreadOnly: false,
    limit: 250,
    logErrors: false
  });

  let flushedCount = 0;
  for (const message of messages) {
    const messageId = String(message?.id || "").trim();
    if (!messageId || messageId === String(excludeMessageId || "").trim()) {
      continue;
    }

    const messageContactId = normalizeWebContactId(message?.from);
    if (!matchesContactIdVariant(messageContactId, normalizedContactId)) {
      continue;
    }

    const timestampMs = normalizeWebMessageTimestampSeconds(message?.timestamp) * 1000;
    if (timestampMs > 0 && timestampMs > Number(upToTimestampMs || 0)) {
      continue;
    }

    if (!processedMessageIds.has(messageId)) {
      processedMessageIds.add(messageId);
      flushedCount += 1;
    }
  }

  if (flushedCount > 0) {
    trimProcessedIds(processedMessageIds, 10000);
  }

  return flushedCount;
}

function selectLatestRecoverableWebMessages(messages, options = {}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const latestByContact = new Map();

  for (const message of safeMessages) {
    const messageId = String(message?.id || "").trim();
    if (!messageId || message?.fromMe) {
      continue;
    }

    if (typeof options.alreadyProcessed === "function" && options.alreadyProcessed(messageId)) {
      continue;
    }

    const timestampSeconds = normalizeWebMessageTimestampSeconds(message?.timestamp);
    if (!(timestampSeconds > 0)) {
      continue;
    }

    const contactKey =
      getInboundQueueKey(normalizeWebContactId(message?.from)) ||
      String(message?.from || "").trim();
    if (!contactKey) {
      continue;
    }

    const previous = latestByContact.get(contactKey);
    if (!previous || timestampSeconds >= normalizeWebMessageTimestampSeconds(previous?.timestamp)) {
      latestByContact.set(contactKey, message);
    }
  }

  const prunedBatch = pruneCollectedWebIncomingMessages(Array.from(latestByContact.values()), {
    normalizeContactId: value => normalizeWebContactId(value),
    markDroppedMessageId: options.markDroppedMessageId
  });

  return {
    kept: prunedBatch.kept,
    droppedIds: prunedBatch.droppedIds,
    chatsSeen: latestByContact.size
  };
}

async function handleNormalizedWebIncomingMessage(message, sourceEvent, options = {}) {
  const messageId = message?.id;
  if (!messageId || processedMessageIds.has(messageId) || message?.fromMe) {
    return;
  }

  const contactId = normalizeWebContactId(message.from);
  const normalizedTimestampSeconds = normalizeWebMessageTimestampSeconds(message?.timestamp);
  const timestampMs = normalizedTimestampSeconds > 0 ? normalizedTimestampSeconds * 1000 : Date.now();

  if (shouldIgnoreMessageByResetCheckpoint(contactId, messageId, timestampMs)) {
    processedMessageIds.add(messageId);
    trimProcessedIds(processedMessageIds, 10000);
    return;
  }

  if (shouldIgnoreMessageByInboundWatermark(contactId, timestampMs)) {
    console.log(`Mensaje entrante web ignorado por watermark de aceptacion from=${contactId} ts=${timestampMs}`);
    processedMessageIds.add(messageId);
    trimProcessedIds(processedMessageIds, 10000);
    return;
  }

  if (shouldIgnoreMessageByStartupWatermark(contactId, timestampMs)) {
    console.log(`Mensaje entrante web ignorado por watermark de arranque from=${contactId} ts=${timestampMs}`);
    processedMessageIds.add(messageId);
    trimProcessedIds(processedMessageIds, 10000);
    return;
  }

  if (!options?.allowHistoric && isHistoricWebMessage(message)) {
    processedMessageIds.add(messageId);
    trimProcessedIds(processedMessageIds, 10000);
    return;
  }

  const contactName = message.pushName || message.notifyName || "Cliente";
  const inboundText = message.body || "";
  markInboundReceived(contactId, timestampMs);

  if (conversationRules._private.markInboundFingerprint(contactId, inboundText, timestampMs)) {
    console.log(
      `Mensaje entrante web suprimido por duplicado reciente (${sourceEvent}) from=${contactId} body=${JSON.stringify(inboundText).slice(0, 240)}`
    );
    processedMessageIds.add(messageId);
    trimProcessedIds(processedMessageIds, 10000);
    return;
  }

  processedMessageIds.add(messageId);
  trimProcessedIds(processedMessageIds, 10000);

  console.log(
    `Mensaje entrante web detectado (${sourceEvent}) from=${contactId} type=${message.type} body=${JSON.stringify(inboundText).slice(0, 240)}`
  );

  const invalidatesQueuedInbound = shouldInvalidateQueuedInboundMessages(inboundText);
  let generation = 0;

  if (invalidatesQueuedInbound) {
    generation = clearInboundTrackingForContact(contactId);
    rememberInboundAcceptedTimestamp(contactId, timestampMs);
    setInboundResetCheckpoint(contactId, timestampMs, messageId);
    const flushedCount = await flushQueuedWebIncomingMessagesForContact(contactId, {
      upToTimestampMs: timestampMs,
      excludeMessageId: messageId
    });
    if (flushedCount > 0) {
      console.log(`Se limpiaron ${flushedCount} mensajes viejos pendientes para ${contactId} al reiniciar el flujo.`);
    }
  }

  rememberInboundAcceptedTimestamp(contactId, timestampMs);
  if (!invalidatesQueuedInbound) {
    clearInboundResetCheckpoint(contactId);
  }

  generation = invalidatesQueuedInbound
    ? generation || ensureInboundProcessingGeneration(contactId)
    : ensureInboundProcessingGeneration(contactId);

  try {
    await enqueueInboundConversation(contactId, async () =>
      handleInboundConversation({
        contactId,
        contactName,
        inboundText,
        inboundMessage: {
          id: messageId,
          from: contactId,
          type: message.type,
          text: { body: inboundText }
        },
        messageId,
        inboundTimestampMs: timestampMs,
        processingGeneration: generation
      }),
      generation
    );
  } catch (error) {
    console.error(`Fallo procesando mensaje entrante de ${contactId}:`, error?.message || error);
  }
}

async function processLatestRecoverableWebMessages({
  minTimestamp = Math.floor(Date.now() / 1000) - 1800,
  unreadOnly = false,
  limit = 180,
  logErrors = true,
  sourceEvent = "manual_backfill",
  allowHistoric = false
} = {}) {
  const messages = await collectWebIncomingMessages({
    minTimestamp,
    unreadOnly,
    limit,
    logErrors
  });

  const selection = selectLatestRecoverableWebMessages(messages, {
    alreadyProcessed(messageId) {
      return processedMessageIds.has(messageId);
    },
    markDroppedMessageId(messageId) {
      processedMessageIds.add(messageId);
      trimProcessedIds(processedMessageIds, 10000);
    }
  });

  let processedCount = 0;
  for (const message of selection.kept) {
    await handleNormalizedWebIncomingMessage(message, sourceEvent, { allowHistoric });
    processedCount += 1;
  }

  return {
    processedCount,
    chatsSeen: selection.chatsSeen
  };
}

async function collectWebIncomingMessages({
  minTimestamp = webIncomingPollStartedAt,
  unreadOnly = false,
  limit = 40,
  logErrors = true
} = {}) {
  const waClient = getClient();
  const page = waClient?.pupPage;

  if (!page) {
    return [];
  }

  try {
    return await page.evaluate(
      ({ minTimestamp: innerMinTimestamp, unreadOnly: innerUnreadOnly, limit: innerLimit }) => {
        if (!window.Store?.Msg?.getModelsArray || !window.Store?.Chat?.getModelsArray) {
          return [];
        }

        const unreadChatIds = new Set(
          window.Store.Chat.getModelsArray()
            .filter(chat => Number(chat?.unreadCount || 0) > 0 && !chat?.isGroup)
            .map(chat => chat?.id?._serialized)
            .filter(Boolean)
        );

        return window.Store.Msg.getModelsArray()
          .filter(message => {
            const remote =
              message?.id?.remote ||
              message?.chat?.id?._serialized ||
              message?.from?._serialized ||
              message?.from;

            return (
              message &&
              !message.id?.fromMe &&
              !message.fromMe &&
              !message.isStatusV3 &&
              !String(remote || "").includes("@g.us") &&
              Number(message.t || 0) >= innerMinTimestamp &&
              typeof message.body === "string" &&
              message.body.trim() &&
              (!innerUnreadOnly || unreadChatIds.has(String(remote || "")))
            );
          })
          .sort((left, right) => Number(left.t || 0) - Number(right.t || 0))
          .slice(-innerLimit)
          .map(message => ({
            id: message.id?._serialized || null,
            from:
              message.from?._serialized ||
              message.from ||
              message.id?.remote ||
              message.chat?.id?._serialized ||
              null,
            body: message.body || "",
            type: message.type || "chat",
            timestamp: Number(message.t || 0),
            notifyName: message.notifyName || "",
            pushName: message.senderObj?.pushname || message.senderObj?.formattedName || "",
            fromMe: Boolean(message.id?.fromMe || message.fromMe)
          }));
      },
      { minTimestamp, unreadOnly, limit }
    );
  } catch (error) {
    const message = String(error?.message || error || "");
    if (logErrors && !message.includes("Execution context")) {
      console.error("Fallo leyendo mensajes entrantes desde la store de WhatsApp Web:", error);
    }
    return [];
  }
}

async function pollWebIncomingMessages() {
  if (!isWebTransport) {
    return;
  }

  const runtime = getRuntimeStatus();

  if (!runtime.authenticated) {
    return;
  }

  const now = Date.now();
  if (now - webAdvisorClosureLastPollAt >= WEB_ADVISOR_CLOSURE_POLL_INTERVAL_MS) {
    webAdvisorClosureLastPollAt = now;
    await pollAdvisorClosureMessages();
  }

  if (webIncomingBridgeHealthy) {
    if (now - webIncomingLastHealthyPollAt < WEB_HEALTHY_POLL_INTERVAL_MS) {
      return;
    }
    webIncomingLastHealthyPollAt = now;
  }

  const messages = await collectWebIncomingMessages({
    minTimestamp: webIncomingPollStartedAt,
    unreadOnly: false,
    limit: 40,
    logErrors: false
  });

  const prunedBatch = pruneCollectedWebIncomingMessages(messages, {
    normalizeContactId: value => normalizeWebContactId(value),
    markDroppedMessageId(messageId) {
      processedMessageIds.add(messageId);
      trimProcessedIds(processedMessageIds, 10000);
    }
  });

  for (const message of prunedBatch.kept) {
    await handleNormalizedWebIncomingMessage(message, "store_poll");
  }
}

async function collectWebOutgoingMessages({
  minTimestamp = webIncomingPollStartedAt,
  limit = 40
} = {}) {
  const waClient = getClient();
  const page = waClient?.pupPage;

  if (!page) {
    return [];
  }

  try {
    return await page.evaluate(
      ({ minTimestamp: innerMinTimestamp, limit: innerLimit }) => {
        if (!window.Store?.Msg?.getModelsArray) {
          return [];
        }

        return window.Store.Msg.getModelsArray()
          .filter(message => {
            const remote =
              message?.to?._serialized ||
              message?.to ||
              message?.id?.remote ||
              message?.chat?.id?._serialized ||
              "";

            return (
              message &&
              (message?.id?.fromMe || message?.fromMe) &&
              !message?.isStatusV3 &&
              !String(remote || "").includes("@g.us") &&
              Number(message.t || 0) >= innerMinTimestamp &&
              typeof message.body === "string" &&
              message.body.trim()
            );
          })
          .sort((left, right) => Number(left.t || 0) - Number(right.t || 0))
          .slice(-innerLimit)
          .map(message => ({
            id: message.id?._serialized || null,
            to:
              message.to?._serialized ||
              message.to ||
              message.id?.remote ||
              message.chat?.id?._serialized ||
              null,
            body: message.body || "",
            timestamp: Number(message.t || 0)
          }));
      },
      { minTimestamp, limit }
    );
  } catch (error) {
    const message = String(error?.message || error || "");
    if (!message.includes("Execution context")) {
      console.error("Fallo leyendo mensajes salientes desde la store de WhatsApp Web:", error);
    }
    return [];
  }
}

async function pollAdvisorClosureMessages() {
  const runtime = getRuntimeStatus();
  if (!isWebTransport || !runtime.authenticated) {
    return;
  }

  const messages = await collectWebOutgoingMessages({
    minTimestamp: webIncomingPollStartedAt,
    limit: 50
  });

  for (const message of messages) {
    const messageId = String(message?.id || "").trim();
    if (
      !messageId ||
      isProcessedAdvisorClosureMessageId(messageId) ||
      webTextClientPrivate.wasBotSentMessageId(messageId) ||
      webTextClientPrivate.wasRecentBotOutboundText(message?.to, message?.body)
    ) {
      continue;
    }

    if (isHistoricWebMessage(message)) {
      markProcessedAdvisorClosureMessageId(messageId);
      continue;
    }

    await handleAdvisorHumanOutgoingMessage({
      messageId,
      contactId: normalizeWebContactId(message.to),
      outboundText: String(message.body || "").trim()
    });
  }
}

async function backfillLatestUnreadWebMessages() {
  return processLatestRecoverableWebMessages({
    minTimestamp: Math.floor(Date.now() / 1000) - 1800,
    unreadOnly: false,
    limit: 180,
    logErrors: true,
    sourceEvent: "manual_backfill"
  });
}

async function recoverLatestPendingWebMessages(reason = "runtime_recovery") {
  if (!isWebTransport) {
    return { processedCount: 0, chatsSeen: 0 };
  }

  const runtime = getRuntimeStatus();
  const page = getClient()?.pupPage;
  if (!runtime.authenticated || !page) {
    return { processedCount: 0, chatsSeen: 0 };
  }

  return processLatestRecoverableWebMessages({
    minTimestamp: Math.floor(Date.now() / 1000) - WEB_RECOVERY_LOOKBACK_SECONDS,
    unreadOnly: true,
    limit: 250,
    logErrors: false,
    sourceEvent: `runtime_recovery_${reason}`,
    allowHistoric: true
  });
}

async function sendWebTestMessage(to, text) {
  await dispatchActionWithRecipientFallback(to, { type: "text", text });
}

function startWebIncomingPoller() {
  if (!isWebTransport || webIncomingPollHandle) {
    return;
  }

  webIncomingPollHandle = setInterval(() => {
    pollWebIncomingMessages().catch(error => {
      console.error("Fallo en el poller de mensajes entrantes de WhatsApp Web:", error);
    });
  }, WEB_INCOMING_POLL_INTERVAL_MS);

  if (typeof webIncomingPollHandle.unref === "function") {
    webIncomingPollHandle.unref();
  }
}

async function ensureWebIncomingBridge(options = {}) {
  if (!isWebTransport) {
    return false;
  }

  await reconcileOperationalWhatsAppPage().catch(() => null);
  let runtime = getRuntimeStatus();
  let waClient = getClient();
  let page = waClient?.pupPage;

  if (!runtime.authenticated || !page) {
    return false;
  }

  if (!webIncomingSeeded) {
    const prepared = await refreshWebIncomingBaseline(options?.reason || "bridge_prepare", {
      recoverPendingUnread: true
    });

    if (!prepared) {
      return false;
    }

    await reconcileOperationalWhatsAppPage().catch(() => null);
    runtime = getRuntimeStatus();
    waClient = getClient();
    page = waClient?.pupPage;

    if (!runtime.authenticated || !page) {
      return false;
    }
  }

  try {
    await page.exposeFunction("__delkoOnIncomingMessage", async payload => {
      await handleNormalizedWebIncomingMessage(payload, "store_bridge");
    });
  } catch (error) {
    const message = String(error?.message || error || "");
    if (!message.includes("already exists")) {
      throw error;
    }
  }

  const result = await page.evaluate(() => {
    if (!window.Store?.Msg?.on || typeof window.__delkoOnIncomingMessage !== "function") {
      return { installed: false, reason: "store_or_binding_missing" };
    }

    if (window.__delkoIncomingBridgeInstalled) {
      return { installed: true, reused: true };
    }

    const serialize = msg => ({
      id: msg?.id?._serialized || null,
      from:
        msg?.from?._serialized ||
        msg?.from ||
        msg?.id?.remote ||
        msg?.chat?.id?._serialized ||
        null,
      body: msg?.body || "",
      type: msg?.type || "chat",
      timestamp: Number(msg?.t || 0),
      notifyName: msg?.notifyName || "",
      pushName: msg?.senderObj?.pushname || msg?.senderObj?.formattedName || "",
      fromMe: Boolean(msg?.id?.fromMe || msg?.fromMe)
    });

    const shouldIgnore = msg => {
      const remote =
        msg?.from?._serialized ||
        msg?.from ||
        msg?.id?.remote ||
        msg?.chat?.id?._serialized ||
        "";

      return (
        !msg ||
        msg?.id?.fromMe ||
        msg?.fromMe ||
        msg?.isStatusV3 ||
        String(remote).includes("@g.us")
      );
    };

    window.Store.Msg.on("add", msg => {
      if (shouldIgnore(msg)) {
        return;
      }

      if (msg?.type === "ciphertext" && typeof msg.once === "function") {
        msg.once("change:type", innerMsg => {
          if (!shouldIgnore(innerMsg)) {
            window.__delkoOnIncomingMessage(serialize(innerMsg));
          }
        });
        return;
      }

      window.__delkoOnIncomingMessage(serialize(msg));
    });

    window.__delkoIncomingBridgeInstalled = true;
    return { installed: true, reused: false };
  });

  webIncomingBridgeHealthy = Boolean(result?.installed);

  if (result?.installed && !result?.reused && !webIncomingBridgeLogged) {
    console.log("Bridge nativo de mensajes entrantes de WhatsApp Web instalado.");
    webIncomingBridgeLogged = true;
  }

  return Boolean(result?.installed);
}

function reconcileWebIncomingRuntime(reason) {
  runDetachedTask(async () => {
    await refreshWebIncomingBaseline(reason, { recoverPendingUnread: true });
    await ensureWebIncomingBridge({ reason });
  }, `Fallo reconciliando el runtime de mensajes de WhatsApp Web (${reason}):`);
}

function startWebIncomingBridge() {
  if (!isWebTransport || webIncomingBridgeHandle) {
    return;
  }

  webIncomingBridgeHandle = setInterval(() => {
    ensureWebIncomingBridge().catch(error => {
      webIncomingBridgeHealthy = false;
      console.error("Fallo reconciliando el bridge nativo de WhatsApp Web:", error);
    });
  }, WEB_BRIDGE_RECONCILE_INTERVAL_MS);

  if (typeof webIncomingBridgeHandle.unref === "function") {
    webIncomingBridgeHandle.unref();
  }

  ensureWebIncomingBridge().catch(error => {
    webIncomingBridgeHealthy = false;
    console.error("Fallo instalando el bridge nativo inicial de WhatsApp Web:", error);
  });
}

if (isWebTransport && !isTestRuntime) {
  const waClient = getClient();

  waClient.on("ready", () => {
    console.log("WhatsApp Web listener listo para mensajes entrantes.");
    prewarmWebFastPath();
    startNativeLabelBootstrap();
    reconcileWebIncomingRuntime("ready");
  });

  waClient.on("change_state", state => {
    console.log(`WhatsApp Web state: ${state}`);
    if (state === "CONNECTED") {
      startNativeLabelBootstrap();
      reconcileWebIncomingRuntime("connected");
    }
  });

  waClient.on("authenticated", () => {
    prewarmWebFastPath();
    startNativeLabelBootstrap();
    reconcileWebIncomingRuntime("authenticated");
  });

  waClient.on("message", async msg => {
    try {
      const serialized = serializeClientIncomingMessage(msg);
      if (!serialized || serialized.fromMe) {
        return;
      }

      await handleNormalizedWebIncomingMessage(serialized, "client_message_event");
    } catch (error) {
      console.error("Fallo procesando un mensaje entrante desde whatsapp-web.js:", error);
    }
  });

  waClient.on("message_create", async msg => {
    if (!msg?.fromMe) {
      return;
    }

    try {
      await handleAdvisorClosureByHumanMessage(msg);
    } catch (error) {
      console.error("Fallo procesando un posible cierre manual del asesor:", error);
    }
  });

  initializeWhatsAppClient();
  prewarmWebFastPath();
  startWebIncomingBridge();
  startWebIncomingPoller();
  startLocalInactivityScheduler();
  reconcileWebIncomingRuntime("startup");
  if (shouldSyncInlineLabelNames()) {
    startWebCompanionOverlaySync();
  } else {
    runDetachedTask(clearConnectedBrowserCompanionOverlay, "Fallo limpiando el overlay visual de companion:");
  }
}

if (!isVercelRuntime && !isTestRuntime) {
  app.listen(config.port, () => {
    console.log(`Express dashboard listening on port ${config.port}`);
  });
}

module.exports = app;
module.exports._private = {
  clearInboundTrackingForContact,
  ensureInboundProcessingGeneration,
  getInboundProcessingGeneration,
  bumpInboundProcessingGeneration,
  buildOperationalLiveness,
  enqueueInboundConversation,
  setInboundResetCheckpoint,
  clearInboundResetCheckpoint,
  shouldIgnoreMessageByResetCheckpoint,
  markQueueStarted,
  clearQueueStarted,
  handleAdvisorClosureByHumanMessage,
  handleAdvisorHumanOutgoingMessage,
  handleNormalizedWebIncomingMessage,
  selectLatestRecoverableWebMessages,
  buildInactivityCronErrorResponse,
  runInactivityCheck,
  startLocalInactivityScheduler
};
