const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.AUDIT_ALLOW_MEMORY_FALLBACK = "true";

const auditStore = require("./conversation_audit_kv_store");

test("la auditoria mantiene la misma conversacion mientras espera atencion humana", async () => {
  const contactId = `54911${Date.now()}${Math.floor(Math.random() * 1000)}@lid`;
  const first = await auditStore.recordInboundMessage({
    contactId,
    contactName: "Cliente",
    inboundText: "Hola",
    inboundMessage: null,
    messageId: `inbound-first-${Date.now()}`
  });

  await auditStore.recordFlowTransition({
    conversationId: first.id,
    flowMeta: {
      after: { state: "agent", step: null },
      handedToHuman: true,
      sessionData: {
        automationMode: "initial",
        initialWelcomeSent: true,
        waitingAdvisor: true,
        manualAdvisorIntervened: false
      }
    }
  });

  const followUp = await auditStore.recordInboundMessage({
    contactId,
    contactName: "Cliente",
    inboundText: "¿Siguen ahí?",
    inboundMessage: null,
    messageId: `inbound-follow-up-${Date.now()}`
  });

  assert.equal(followUp.id, first.id);
  assert.equal(followUp.status, "agent_pending");
  assert.equal(followUp.context?.initialWelcomeSent, true);
  assert.equal(followUp.inboundCount, 2);
});
