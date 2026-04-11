const test = require("node:test");
const assert = require("node:assert/strict");

const {
  INACTIVITY_PROMPT_TAG,
  buildInactivityCloseMeta,
  processInactivityConversations,
  stripInactivityPromptTag
} = require("./inactivity_cron");

test("inactivity cron envia el recordatorio luego de 15 minutos", async () => {
  const nowMs = Date.UTC(2026, 2, 21, 18, 0, 0);
  const dispatchCalls = [];
  const outboundCalls = [];
  const tagCalls = [];
  const flowCalls = [];

  const result = await processInactivityConversations({
    nowMs,
    listConversations: async () => [
      {
        id: "conv_1",
        contactId: "5491111111111",
        lastEventAt: new Date(nowMs - 16 * 60 * 1000).toISOString(),
        tags: []
      }
    ],
    dispatchAction: async (to, action) => {
      dispatchCalls.push({ to, action });
    },
    recordOutboundMessage: async payload => {
      outboundCalls.push(payload);
    },
    addConversationTag: async (conversationId, tag) => {
      tagCalls.push({ conversationId, tag });
    },
    recordFlowTransition: async payload => {
      flowCalls.push(payload);
    }
  });

  assert.deepEqual(result, { promptedCount: 1, closedCount: 0 });
  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0].action.type, "interactive");
  assert.equal(dispatchCalls[0].action.buttons[0].id, "inactivity_continue_yes");
  assert.equal(outboundCalls.length, 1);
  assert.deepEqual(tagCalls, [{ conversationId: "conv_1", tag: INACTIVITY_PROMPT_TAG }]);
  assert.equal(flowCalls.length, 0);
});

test("inactivity cron cierra la conversacion si no hay respuesta despues del recordatorio", async () => {
  const nowMs = Date.UTC(2026, 2, 21, 18, 0, 0);
  const dispatchCalls = [];
  const outboundCalls = [];
  const flowCalls = [];
  const conversation = {
    id: "conv_2",
    contactId: "5491222222222",
    currentState: "order",
    currentStep: "summary",
    lastEventAt: new Date(nowMs - 16 * 60 * 1000).toISOString(),
    tags: [INACTIVITY_PROMPT_TAG]
  };

  const result = await processInactivityConversations({
    nowMs,
    listConversations: async () => [conversation],
    dispatchAction: async (to, action) => {
      dispatchCalls.push({ to, action });
    },
    recordOutboundMessage: async payload => {
      outboundCalls.push(payload);
    },
    addConversationTag: async () => {},
    recordFlowTransition: async payload => {
      flowCalls.push(payload);
    }
  });

  assert.deepEqual(result, { promptedCount: 0, closedCount: 1 });
  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0].action.type, "text");
  assert.match(dispatchCalls[0].action.text, /cerrar esta conversacion/i);
  assert.equal(outboundCalls.length, 1);
  assert.deepEqual(flowCalls[0], {
    conversationId: "conv_2",
    flowMeta: buildInactivityCloseMeta(conversation)
  });
});

test("stripInactivityPromptTag limpia la marca cuando la persona vuelve a escribir", () => {
  assert.deepEqual(stripInactivityPromptTag(["test_run", INACTIVITY_PROMPT_TAG]), ["test_run"]);
  assert.deepEqual(stripInactivityPromptTag([]), []);
  assert.deepEqual(stripInactivityPromptTag(null), []);
});
