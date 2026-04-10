const express = require("express");

const { config } = require("./config");
const { nextBotReply: nextRuleBotReply } = require("./conversation_rules");
const { nextBotReply: nextAgentBotReply } = require("./conversation_agent");
const { getPharmacyLookupStatus } = require("./pharmacy_system_lookup");
const { buildSystemReadiness } = require("./runtime_readiness");
const { getWebhookSignatureStatus, validateWebhookSignature } = require("./webhook_security");
const { getWorkflowCatalog, saveWorkflowCatalog, resetWorkflowCatalog } = require("./workflow_store");
const { renderFlowDashboard } = require("./flow_dashboard");
const { renderFlowClientDashboard } = require("./flow_client_dashboard");
const { renderConversationDashboard } = require("./conversation_dashboard");
const { renderControlCenterDashboard } = require("./control_center_dashboard");
const { buildCompanionPayload } = require("./whatsapp_web_companion");
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
const { getBotMode, setBotMode, HOLDING_MESSAGE, VALID_MODES } = require("./bot_mode_store");

const app = express();
const processedMessageIds = new Set();
const webhookSignatureStatus = getWebhookSignatureStatus(config);

app.disable("x-powered-by");

app.use(
  express.json({
    limit: `${config.whatsappWebhookBodyLimitKb}kb`,
    verify(req, _res, buf) {
      req.rawBody = buf;
    }
  })
);

if (!config.whatsappMockMode && !webhookSignatureStatus.hardened) {
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
    const conversations = await listConversations({
      limit: Number(req.query.limit || 180),
      status: String(req.query.status || ""),
      contactId: String(req.query.contactId || ""),
      tag: String(req.query.tag || "")
    });
    const summary = await getConversationSummary();
    res.status(200).json(
      buildCompanionPayload({
        conversations,
        summary
      })
    );
  } catch (error) {
    console.error("Failed loading companion conversations", error);
    sendConversationApiError(res, error, "companion_conversation_list_failed");
  }
});

app.get("/api/cron/inactivity", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === "production" && process.env.VERCEL) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const result = await processInactivityConversations({
      listConversations,
      dispatchAction: dispatchActionWithRecipientFallback,
      recordOutboundMessage,
      addConversationTag,
      recordFlowTransition,
      onDispatchError(conversation, error) {
        console.error(`Failed to process inactivity follow-up for ${conversation.contactId}:`, error);
      }
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("Cron inactivity error:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.whatsappWebhookVerifyToken) {
    return res.status(200).send(challenge || "");
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
  const signatureValidation = validateWebhookSignature({
    appSecret: config.whatsappAppSecret,
    signatureHeader: req.get("x-hub-signature-256"),
    rawBody: req.rawBody,
    signatureRequired: config.whatsappSignatureRequired,
    mockMode: config.whatsappMockMode
  });

  if (!signatureValidation.valid) {
    console.warn(`Webhook rejected due to signature validation failure: ${signatureValidation.reason}`);
    return res.sendStatus(401);
  }

  const payload = req.body;
  console.log("Received Meta webhook:", JSON.stringify(payload, null, 2));

  try {
    // In serverless runtimes we must complete processing before replying,
    // otherwise the function can terminate before outbound dispatch finishes.
    await processIncomingEvent(payload);
    res.sendStatus(200);
  } catch (error) {
    console.error("Failed processing webhook event", error);
    res.sendStatus(500);
  }
});

function getSystemReadiness() {
  return buildSystemReadiness({
    config,
    auditStorageStatus: getAuditStorageStatus(),
    pharmacyLookupStatus: getPharmacyLookupStatus()
  });
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

        const mappedFrom = from;
        const contactName = contactNamesByWaId.get(from) || "";

        const inboundText = extractInboundText(message);
        let auditConversation = null;
        try {
          auditConversation = await recordInboundMessage({
            contactId: mappedFrom,
            contactName,
            inboundText,
            inboundMessage: message,
            messageId
          });
        } catch (error) {
          console.error("Audit inbound failed:", error?.message || error);
        }
        const botMode = await getBotMode();
        let flowResult;
        if (botMode === "holding") {
          flowResult = {
            actions: [{ type: "text", text: HOLDING_MESSAGE }],
            meta: { routeKey: "holding_auto_reply", mode: "holding" }
          };
        } else {
          const replyHandler = config.agenticMode ? nextAgentBotReply : nextRuleBotReply;
          flowResult = await replyHandler({
            contactId: mappedFrom,
            contactName,
            inboundText,
            inboundMessage: message
          });
        }

        try {
          await recordFlowTransition({
            conversationId: auditConversation?.id,
            flowMeta: flowResult?.meta
          });
        } catch (error) {
          console.error("Audit flow transition failed:", error?.message || error);
        }

        for (const action of flowResult.actions || []) {
          try {
            await dispatchActionWithRecipientFallback(mappedFrom, action);
            try {
              await recordOutboundMessage({
                conversationId: auditConversation?.id,
                action,
                status: "sent"
              });
            } catch (error) {
              console.error("Audit outbound sent failed:", error?.message || error);
            }
          } catch (error) {
            try {
              await recordOutboundMessage({
                conversationId: auditConversation?.id,
                action,
                status: "failed",
                error: error?.message || "send_failed"
              });
            } catch (auditError) {
              console.error("Audit outbound failure failed:", auditError?.message || auditError);
            }
            throw error;
          }
        }
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
      await sendAction(recipient, action);
      if (recipient !== to) {
        console.log(`Delivery succeeded with alternate recipient format: ${recipient}`);
      }
      return;
    } catch (error) {
      lastError = error;

      if (!isLastAttempt && isRecipientNotAllowedError(error)) {
        console.warn(`Recipient not allowed (${recipient}). Retrying with alternate format...`);
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
  const candidates = [to];

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

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`WhatsApp bot listening on port ${config.port}`);
  });
}

module.exports = app;
