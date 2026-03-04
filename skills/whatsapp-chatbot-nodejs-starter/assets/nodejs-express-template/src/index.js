const crypto = require("crypto");
const express = require("express");

const { config } = require("./config");
const { sendTextMessage } = require("./metaClient");

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

app.post("/webhook", (req, res) => {
  if (!isSignatureValid(req)) {
    return res.sendStatus(401);
  }

  const payload = req.body;
  res.sendStatus(200);

  setImmediate(async () => {
    try {
      await processIncomingEvent(payload);
    } catch (error) {
      console.error("Failed processing webhook event", error);
    }
  });
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

        const inboundText = message.text?.body || "";
        const replyText = buildReplyText(inboundText);

        await sendTextMessage(from, replyText);
      }
    }
  }
}

function buildReplyText(inboundText) {
  const normalized = inboundText.trim().toLowerCase();

  if (!normalized) {
    return "Recibi tu mensaje. Puedes contarme que necesitas?";
  }

  if (normalized.includes("agente") || normalized.includes("humano")) {
    return "Te voy a derivar con un agente humano."
  }

  return `Recibi: "${inboundText}". Este es un bot base, ahora puedes conectar intents reales.`;
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

app.listen(config.port, () => {
  console.log(`WhatsApp starter listening on port ${config.port}`);
});
