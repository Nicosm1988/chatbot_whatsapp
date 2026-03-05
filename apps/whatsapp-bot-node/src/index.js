const crypto = require("crypto");
const express = require("express");

const { config } = require("./config");
const { nextBotReply: nextRuleBotReply } = require("./conversation_rules");
const { nextBotReply: nextAgentBotReply } = require("./conversation_agent");
const { sendTextMessage, sendInteractiveButtons, sendImageMessage } = require("./metaClient");

const app = express();
const processedMessageIds = new Set();

app.use(
  express.json({
    verify(req, _res, buf) {
      req.rawBody = buf;
    }
  })
);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
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

app.post("/webhook", async (req, res) => {
  if (!isSignatureValid(req)) {
    console.warn("⚠️ Recibido webhook con firma inválida.");
    return res.sendStatus(401);
  }

  const payload = req.body;
  console.log("📥 Recibido Webhook de Meta:", JSON.stringify(payload, null, 2));

  try {
    // En arquitecturas Serverless (como Vercel), debemos esperar la ejecución
    // antes de enviar el sendStatus, de lo contrario la función "muere" prematuramente.
    await processIncomingEvent(payload);
    res.sendStatus(200);
  } catch (error) {
    console.error("Failed processing webhook event", error);
    res.sendStatus(500);
  }
});

function isSignatureValid(req) {
  if (!config.whatsappAppSecret) {
    return true;
  }

  const signature = req.get("x-hub-signature-256");
  if (!signature || !req.rawBody) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", config.whatsappAppSecret)
    .update(req.rawBody)
    .digest("hex")}`;

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function processIncomingEvent(payload) {
  const entries = payload.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
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

        let mappedFrom = from;

        const inboundText = extractInboundText(message);
        const replyHandler = config.agenticMode ? nextAgentBotReply : nextRuleBotReply;
        const flowResult = await replyHandler({
          contactId: mappedFrom,
          inboundText
        });

        for (const action of flowResult.actions || []) {
          if (action.type === "text") {
            await sendTextMessage(mappedFrom, action.text);
          } else if (action.type === "interactive") {
            await sendInteractiveButtons(mappedFrom, action.text, action.buttons);
          } else if (action.type === "image") {
            await sendImageMessage(mappedFrom, action.url, action.caption);
          }
        }
      }
    }
  }
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
