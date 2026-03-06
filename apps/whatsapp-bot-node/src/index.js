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

app.get("/", (_req, res) => {
  const now = new Date().toISOString();
  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Farmacia Modelo - WhatsApp Webhook</title>
    <style>
      :root {
        --bg: #f4f8ff;
        --card: #ffffff;
        --ink: #0f172a;
        --muted: #475569;
        --accent: #0b69ff;
        --ok: #0f9d58;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        background: radial-gradient(circle at 15% 20%, #dbeafe 0, transparent 30%),
                    radial-gradient(circle at 90% 10%, #cffafe 0, transparent 35%),
                    var(--bg);
        color: var(--ink);
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 760px;
        background: var(--card);
        border: 1px solid #d9e4ff;
        border-radius: 14px;
        padding: 24px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 1.3rem;
      }
      p {
        margin: 0 0 12px;
        color: var(--muted);
        line-height: 1.45;
      }
      .badge {
        display: inline-block;
        background: #e9fbef;
        color: #0a7d45;
        border: 1px solid #b8efcf;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 0.8rem;
        margin-bottom: 12px;
      }
      .grid {
        display: grid;
        gap: 10px;
        margin: 16px 0;
      }
      .row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .k {
        font-weight: 700;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 2px 6px;
      }
      a {
        color: var(--accent);
        text-decoration: none;
      }
      a:hover { text-decoration: underline; }
      .foot {
        margin-top: 14px;
        font-size: 0.85rem;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge">Webhook Online</div>
      <h1>Farmacia Modelo - WhatsApp API</h1>
      <p>This is the production webhook service for WhatsApp Cloud API.</p>
      <div class="grid">
        <div class="row"><span class="k">Health:</span> <code>/health</code></div>
        <div class="row"><span class="k">Webhook verify:</span> <code>GET /webhook</code></div>
        <div class="row"><span class="k">Webhook events:</span> <code>POST /webhook</code></div>
      </div>
      <p>For Meta setup, callback URL is <code>/webhook</code> and verify token must match server configuration.</p>
      <p class="foot">Last server render: ${now}</p>
    </main>
  </body>
</html>`);
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
          inboundText,
          inboundMessage: message
        });

        for (const action of flowResult.actions || []) {
          await dispatchActionWithRecipientFallback(mappedFrom, action);
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
        console.log(`ℹ️ Envío exitoso con destinatario alternativo: ${recipient}`);
      }
      return;
    } catch (error) {
      lastError = error;

      if (!isLastAttempt && isRecipientNotAllowedError(error)) {
        console.warn(`⚠️ Destinatario no permitido (${recipient}). Reintentando con formato alternativo...`);
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
    await sendInteractiveButtons(to, action.text, action.buttons);
  } else if (action.type === "image") {
    await sendImageMessage(to, action.url, action.caption);
  }
}

function buildRecipientCandidates(to) {
  const candidates = [to];

  // Meta test recipients for AR numbers may accept 54 + area + number
  // while inbound webhooks deliver wa_id with 549 prefix.
  if (typeof to === "string" && /^549\d+$/.test(to)) {
    candidates.push(`54${to.slice(3)}`);
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
