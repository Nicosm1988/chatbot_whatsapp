const { test, after } = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.WHATSAPP_TRANSPORT = "cloud";
process.env.WHATSAPP_MOCK_MODE = "true";
process.env.WHATSAPP_WEB_BROWSER_URL = "";
process.env.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "test-phone";
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "test-verify";
process.env.WHATSAPP_WEB_INBOUND_CONVERSATION_TIMEOUT_MS = "50";
process.env.WHATSAPP_WEB_OUTBOUND_ACTION_TIMEOUT_MS = "50";
process.env.WHATSAPP_WEB_STUCK_QUEUE_THRESHOLD_MS = "25";
process.env.WHATSAPP_WEB_LIVENESS_TIMEOUT_BACKOFF_MS = "200";

const { config } = require("./config");
const originalTransport = config.whatsappTransport;
const originalMockMode = config.whatsappMockMode;
config.whatsappTransport = "cloud";
config.whatsappMockMode = true;
const app = require("./index");
const conversationRules = require("./conversation_rules");
const { _private: webTextClientPrivate } = require("./webTextClient");
const { _private } = app;

after(() => {
  config.whatsappTransport = originalTransport;
  config.whatsappMockMode = originalMockMode;
});

function makeContactId() {
  return `54911${Date.now()}${Math.floor(Math.random() * 1000)}@lid`;
}

test("el cambio de modo por HTTP solo admite conexiones locales", () => {
  assert.equal(_private.isLoopbackAddress("127.0.0.1"), true);
  assert.equal(_private.isLoopbackAddress("::1"), true);
  assert.equal(_private.isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(_private.isLoopbackAddress("192.168.1.30"), false);
  assert.equal(_private.canManageBotMode({ ip: "127.0.0.1" }), true);
  assert.equal(_private.canManageBotMode({ ip: "203.0.113.10" }), false);
});

test("el endpoint de modo rechaza una solicitud externa", async () => {
  let statusCode = null;
  let payload = null;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    }
  };

  await _private.handleBotModeUpdateRequest(
    { ip: "203.0.113.10", body: { mode: "holding" } },
    response
  );

  assert.equal(statusCode, 403);
  assert.deepEqual(payload, { error: "bot_mode_update_not_allowed" });
});

test("el Bot inicial recupera la espera y la atencion desde la auditoria durable", () => {
  assert.deepEqual(
    _private.getDurableInitialModeState({
      status: "agent_pending",
      tags: ["esperando_asesor"],
      context: { automationMode: "initial", initialWelcomeSent: true }
    }),
    { welcomeAlreadySent: true, attendedByHuman: false }
  );

  assert.deepEqual(
    _private.getDurableInitialModeState({
      status: "open",
      tags: [{ id: "atendido" }],
      context: { manualAdvisorIntervened: true }
    }),
    { welcomeAlreadySent: true, attendedByHuman: true }
  );

  assert.deepEqual(
    _private.getDurableInitialModeState({
      status: "closed",
      tags: ["atendido"],
      context: { manualAdvisorIntervened: true }
    }),
    { welcomeAlreadySent: false, attendedByHuman: false }
  );
});

test("un audio o archivo humano cuenta como atencion aunque no tenga texto", () => {
  assert.equal(_private.hasHumanOutboundContent({ outboundType: "ptt", outboundText: "" }), true);
  assert.equal(_private.hasHumanOutboundContent({ hasMedia: true, outboundText: "" }), true);
  assert.equal(_private.hasHumanOutboundContent({ outboundType: "location", outboundText: "" }), true);
  assert.equal(_private.hasHumanOutboundContent({ outboundType: "vcard", outboundText: "" }), true);
  assert.equal(_private.hasHumanOutboundContent({ outboundType: "poll_creation", outboundText: "" }), true);
  assert.equal(_private.hasHumanOutboundContent({ outboundType: "chat", outboundText: "" }), false);
});

test("una conversacion historica cerrada no vuelve a quedar Atendida por un mensaje posterior", () => {
  assert.equal(_private.isActiveAuditConversation({ status: "open" }), true);
  assert.equal(_private.isActiveAuditConversation({ status: "agent_pending" }), true);
  assert.equal(_private.isActiveAuditConversation({ status: "closed" }), false);
  assert.equal(_private.isActiveAuditConversation(null), false);
});

function buttonMessage(id, title) {
  return {
    type: "interactive",
    interactive: {
      button_reply: { id, title }
    }
  };
}

function listMessage(id, title) {
  return {
    type: "interactive",
    interactive: {
      list_reply: { id, title }
    }
  };
}

async function driveCheckoutUntilAdvisorHold(contactId, contactName = "Cliente") {
  await conversationRules._private.resetContactState(contactId);
  await conversationRules._private.forceParticularSearchFlow(contactId, { contactName, mode: "DELIVERY" });
  await conversationRules.nextBotReply({ contactId, contactName, inboundText: "" });
  await conversationRules.nextBotReply({
    contactId,
    contactName,
    inboundText: "Buscar por nombre",
    inboundMessage: buttonMessage("particular_search_name", "Buscar por nombre")
  });
  await conversationRules.nextBotReply({
    contactId,
    contactName,
    inboundText: "Mounjaro 5 mg KwikPen"
  });
  await conversationRules.nextBotReply({
    contactId,
    contactName,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await conversationRules.nextBotReply({
    contactId,
    contactName,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await conversationRules.nextBotReply({
    contactId,
    contactName,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await conversationRules.nextBotReply({
    contactId,
    contactName,
    inboundText: "Nico San Martin, nico@test.com"
  });
  return conversationRules.nextBotReply({
    contactId,
    contactName,
    inboundText: "Coronel Diaz 123, entre Soler y Paraguay, Recoleta"
  });
}

test("invalidar tracking no recicla generaciones viejas del mismo contacto", () => {
  const contactId = makeContactId();

  assert.equal(_private.ensureInboundProcessingGeneration(contactId), 1);
  assert.equal(_private.getInboundProcessingGeneration(contactId), 1);

  const invalidatedGeneration = _private.clearInboundTrackingForContact(contactId);
  assert.equal(invalidatedGeneration, 2);
  assert.equal(_private.getInboundProcessingGeneration(contactId), 2);

  assert.equal(_private.ensureInboundProcessingGeneration(contactId), 2);
  assert.equal(_private.bumpInboundProcessingGeneration(contactId), 3);
  assert.equal(_private.getInboundProcessingGeneration(contactId), 3);
});

test("el checkpoint de reset ignora mensajes viejos pero preserva el mensaje actual", () => {
  const contactId = makeContactId();
  _private.clearInboundTrackingForContact(contactId);
  _private.setInboundResetCheckpoint(contactId, 1_000, "m-reset");

  assert.equal(_private.shouldIgnoreMessageByResetCheckpoint(contactId, "m-old", 999), true);
  assert.equal(_private.shouldIgnoreMessageByResetCheckpoint(contactId, "m-reset", 1_000), false);
  assert.equal(_private.shouldIgnoreMessageByResetCheckpoint(contactId, "m-next", 1_000), false);

  _private.clearInboundResetCheckpoint(contactId);
});

test("la intervencion manual del asesor detectada desde otra variante del contacto silencia el bot", async () => {
  const bare = `54911${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const lidContactId = `${bare}@lid`;
  const cUsContactId = `${bare}@c.us`;

  await conversationRules.nextBotReply({ contactId: lidContactId, contactName: "Cliente", inboundText: "hola" });

  const handled = await _private.handleAdvisorHumanOutgoingMessage({
    messageId: `advisor-manual-${Date.now()}`,
    contactId: cUsContactId,
    outboundText: "Hola Nico, ya te estoy atendiendo por aca."
  });

  assert.equal(handled, true);

  const currentState = await conversationRules._private.getContactConversationState(lidContactId);
  assert.equal(currentState?.state, "agent");
  assert.equal(currentState?.sessionData?.waitingAdvisor, false);
  assert.equal(currentState?.sessionData?.manualAdvisorIntervened, true);

  const afterCustomerReply = await conversationRules.nextBotReply({
    contactId: lidContactId,
    contactName: "Cliente",
    inboundText: "Hola, estan por ahi?"
  });

  assert.equal(Array.isArray(afterCustomerReply.actions) ? afterCustomerReply.actions.length : 0, 0);
});

test("despues del control manual y el cierre del chat el cliente puede volver a iniciar normalmente", async () => {
  const bare = `54911${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const lidContactId = `${bare}@lid`;
  const cUsContactId = `${bare}@c.us`;

  await conversationRules.nextBotReply({ contactId: lidContactId, contactName: "Cliente", inboundText: "hola" });
  await _private.handleAdvisorHumanOutgoingMessage({
    messageId: `advisor-manual-${Date.now()}`,
    contactId: cUsContactId,
    outboundText: "Hola Nico, ya te estoy atendiendo por aca."
  });
  await conversationRules._private.closeContactConversation(lidContactId);

  const resumed = await conversationRules.nextBotReply({
    contactId: lidContactId,
    contactName: "Cliente",
    inboundText: "hola"
  });

  const visibleText = Array.isArray(resumed.actions)
    ? resumed.actions.map(action => String(action?.text || "")).join("\n")
    : "";

  assert.match(visibleText, /continuar/i);
});

test("hola y una letra valida en el mismo segundo no se pierden en el runtime web", async () => {
  const contactId = makeContactId();
  const previousMockMode = config.whatsappMockMode;
  config.whatsappMockMode = true;

  try {
    await conversationRules._private.resetContactState(contactId);
    _private.clearInboundTrackingForContact(contactId);

    const timestamp = Math.floor(Date.now() / 1000);

    await _private.handleNormalizedWebIncomingMessage(
      {
        id: `m-hola-${Date.now()}`,
        from: contactId,
        body: "Hola",
        type: "chat",
        timestamp,
        pushName: "Cliente",
        notifyName: "Cliente",
        fromMe: false
      },
      "test_runtime"
    );

    await _private.handleNormalizedWebIncomingMessage(
      {
        id: `m-a-${Date.now() + 1}`,
        from: contactId,
        body: "A",
        type: "chat",
        timestamp,
        pushName: "Cliente",
        notifyName: "Cliente",
        fromMe: false
      },
      "test_runtime"
    );

    const state = await conversationRules._private.getContactConversationState(contactId);
    assert.equal(state?.state, "order");
    assert.equal(state?.step, "service_type");
    assert.equal(state?.sessionData?.mode, "DELIVERY");
  } finally {
    config.whatsappMockMode = previousMockMode;
  }
});

test("un mensaje historico puede recuperarse explicitamente al volver online", async () => {
  const contactId = makeContactId();
  const previousMockMode = config.whatsappMockMode;
  config.whatsappMockMode = true;

  try {
    await conversationRules._private.resetContactState(contactId);
    _private.clearInboundTrackingForContact(contactId);

    const historicTimestamp = Math.floor(Date.now() / 1000) - 3600;

    await _private.handleNormalizedWebIncomingMessage(
      {
        id: `m-historic-ignore-${Date.now()}`,
        from: contactId,
        body: "Hola",
        type: "chat",
        timestamp: historicTimestamp,
        pushName: "Cliente",
        notifyName: "Cliente",
        fromMe: false
      },
      "test_runtime"
    );

    let state = await conversationRules._private.getContactConversationState(contactId);
    assert.notEqual(state?.state, "order");

    await _private.handleNormalizedWebIncomingMessage(
      {
        id: `m-historic-recover-${Date.now() + 1}`,
        from: contactId,
        body: "Hola",
        type: "chat",
        timestamp: historicTimestamp,
        pushName: "Cliente",
        notifyName: "Cliente",
        fromMe: false
      },
      "test_runtime_recovery",
      { allowHistoric: true }
    );

    state = await conversationRules._private.getContactConversationState(contactId);
    assert.equal(state?.state, "order");
    assert.equal(state?.step, "menu");
  } finally {
    config.whatsappMockMode = previousMockMode;
  }
});

test("la seleccion de recuperacion conserva solo el ultimo pendiente por contacto logico", () => {
  const bare = `54911${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const selected = _private.selectLatestRecoverableWebMessages(
    [
      {
        id: "old-lid",
        from: `${bare}@lid`,
        body: "Hola",
        timestamp: 100,
        fromMe: false
      },
      {
        id: "new-cus",
        from: `${bare}@c.us`,
        body: "Necesito ayuda",
        timestamp: 101,
        fromMe: false
      },
      {
        id: "other-contact",
        from: `54922${Date.now()}@lid`,
        body: "MENU",
        timestamp: 99,
        fromMe: false
      },
      {
        id: "already-processed",
        from: `54933${Date.now()}@lid`,
        body: "Hola",
        timestamp: 102,
        fromMe: false
      }
    ],
    {
      alreadyProcessed(messageId) {
        return messageId === "already-processed";
      }
    }
  );

  assert.equal(selected.chatsSeen, 2);
  assert.deepEqual(
    selected.kept.map(message => message.id).sort(),
    ["new-cus", "other-contact"]
  );
});

test("enqueueInboundConversation rastrea y libera la cola por contacto", async () => {
  const contactId = makeContactId();
  _private.clearInboundTrackingForContact(contactId);
  let releaseTask = null;

  const taskPromise = _private.enqueueInboundConversation(
    contactId,
    () =>
      new Promise(resolve => {
        releaseTask = resolve;
      }),
    1
  );

  await new Promise(resolve => setTimeout(resolve, 10));
  let liveness = _private.buildOperationalLiveness();
  assert.ok(liveness.activeQueues.some(queue => queue.contactId === contactId));

  releaseTask("ok");
  await taskPromise;

  liveness = _private.buildOperationalLiveness();
  assert.equal(liveness.activeQueues.some(queue => queue.contactId === contactId), false);
});

test("la liveness operativa detecta colas trabadas", async () => {
  const contactId = makeContactId();
  _private.markQueueStarted(contactId, contactId, 1);
  await new Promise(resolve => setTimeout(resolve, 35));

  const liveness = _private.buildOperationalLiveness();
  assert.equal(liveness.ok, false);
  assert.ok(Array.isArray(liveness.stuckQueues));
  assert.ok(liveness.stuckQueues.length >= 1);

  _private.clearQueueStarted(contactId);
});

test("una cola de un contacto no bloquea el procesamiento de otro contacto", async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const contactA = `54911001${suffix}@lid`;
  const contactB = `54911002${suffix}@lid`;
  const generationA = _private.ensureInboundProcessingGeneration(contactA);
  const generationB = _private.ensureInboundProcessingGeneration(contactB);
  let releaseA = null;

  const blocked = _private.enqueueInboundConversation(
    contactA,
    () =>
      new Promise(resolve => {
        releaseA = resolve;
      }),
    generationA
  );

  await new Promise(resolve => setTimeout(resolve, 10));

  const fastResult = await _private.enqueueInboundConversation(contactB, async () => "ok-b", generationB);
  assert.equal(fastResult, "ok-b");

  releaseA("ok-a");
  const blockedResult = await blocked;
  assert.equal(blockedResult, "ok-a");
});

test("los mensajes salientes del bot con sufijos alternativos no activan el control manual del asesor", async () => {
  const bare = `54911${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const lidContactId = `${bare}@lid`;
  const botText = "Hola Nico, somos Farmacia Delko.";

  await conversationRules._private.resetContactState(lidContactId);
  await conversationRules.nextBotReply({ contactId: lidContactId, contactName: "Cliente", inboundText: "hola" });

  webTextClientPrivate.rememberRecentBotOutboundText(`${bare}@c.us`, botText);

  const handled = await _private.handleAdvisorClosureByHumanMessage({
    fromMe: true,
    body: botText,
    to: { _serialized: `${bare}@s.whatsapp.net` },
    id: { _serialized: `bot-msg-${Date.now()}` }
  });

  assert.equal(handled, false);

  const currentState = await conversationRules._private.getContactConversationState(lidContactId);
  assert.equal(currentState?.state, "order");
  assert.notEqual(Boolean(currentState?.sessionData?.manualAdvisorIntervened), true);
});

test("el cron de inactividad no rompe el workflow cuando el storage persistente no esta disponible", () => {
  const error = new Error(
    "audit_storage_unavailable:Your project has exceeded the data transfer quota. Upgrade your plan to increase limits."
  );
  error.code = "audit_storage_unavailable";

  const response = _private.buildInactivityCronErrorResponse(error);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.skipped, true);
  assert.equal(response.body.reason, "audit_storage_unavailable");
  assert.match(response.body.detail, /data transfer quota/i);
});

test("despues del resumen final el cliente recibe el mensaje de paciencia hasta que intervenga un asesor", async () => {
  const contactId = makeContactId();
  const summaryResult = await driveCheckoutUntilAdvisorHold(contactId);

  assert.equal(summaryResult?.meta?.sessionData?.waitingAdvisor, true);
  assert.equal(summaryResult?.meta?.sessionData?.advisorHandoffReason, "checkout_final_summary");

  const followUp = await conversationRules.nextBotReply({
    contactId,
    contactName: "Cliente",
    inboundText: "hola, cuanto falta?"
  });

  const visibleText = Array.isArray(followUp.actions)
    ? followUp.actions.map(action => String(action?.text || "")).join("\n")
    : "";

  assert.match(visibleText, /te pedimos paciencia/i);
});

test("cuando el asesor escribe manualmente tras el resumen final, el bot guarda silencio ante nuevos mensajes del cliente", async () => {
  const bare = `54911${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const lidContactId = `${bare}@lid`;
  const cUsContactId = `${bare}@c.us`;

  const summaryResult = await driveCheckoutUntilAdvisorHold(lidContactId);
  assert.equal(summaryResult?.meta?.sessionData?.waitingAdvisor, true);

  const handled = await _private.handleAdvisorHumanOutgoingMessage({
    messageId: `advisor-manual-${Date.now()}`,
    contactId: cUsContactId,
    outboundText: "Hola Laura, ya te estoy atendiendo por aca."
  });

  assert.equal(handled, true);

  const afterCustomerReply = await conversationRules.nextBotReply({
    contactId: lidContactId,
    contactName: "Cliente",
    inboundText: "siguen ahi?"
  });

  assert.equal(Array.isArray(afterCustomerReply.actions) ? afterCustomerReply.actions.length : 0, 0);
});

test("un audio del asesor sin texto cambia la espera a Atendido", async () => {
  const contactId = makeContactId();
  await conversationRules._private.resetContactState(contactId);
  await conversationRules._private.enterInitialBotMode(contactId, { contactName: "Cliente" });

  const handled = await _private.handleAdvisorHumanOutgoingMessage({
    messageId: `advisor-audio-${Date.now()}`,
    contactId,
    outboundText: "",
    outboundType: "ptt",
    hasMedia: true
  });

  assert.equal(handled, true);

  const currentState = await conversationRules._private.getContactConversationState(contactId);
  assert.equal(currentState?.sessionData?.waitingAdvisor, false);
  assert.equal(currentState?.sessionData?.manualAdvisorIntervened, true);
});

test("el cierre manual del asesor funciona tambien cuando el chat quedo idle esperando asesor", async () => {
  const bare = `54911${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const lidContactId = `${bare}@lid`;
  const cUsContactId = `${bare}@c.us`;

  const summaryResult = await driveCheckoutUntilAdvisorHold(lidContactId);
  assert.equal(summaryResult?.meta?.sessionData?.waitingAdvisor, true);

  const handled = await _private.handleAdvisorHumanOutgoingMessage({
    messageId: `advisor-closure-${Date.now()}`,
    contactId: cUsContactId,
    outboundText: "Damos por finalizada la operacion."
  });

  assert.equal(handled, true);

  const resumed = await conversationRules.nextBotReply({
    contactId: lidContactId,
    contactName: "Cliente",
    inboundText: "hola"
  });

  const visibleText = Array.isArray(resumed.actions)
    ? resumed.actions.map(action => String(action?.text || "")).join("\n")
    : "";

  assert.match(visibleText, /continuar/i);
  assert.doesNotMatch(visibleText, /te pedimos paciencia/i);
});
