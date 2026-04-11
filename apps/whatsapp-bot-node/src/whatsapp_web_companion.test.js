const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCompanionConversation,
  buildCompanionPayload,
  statusLabel
} = require("./whatsapp_web_companion");

test("arma una conversacion amigable para el companion de whatsapp web", () => {
  const result = buildCompanionConversation({
    id: "conv_1",
    contactId: "5491160231844",
    contactName: "Nicolas",
    status: "agent_pending",
    summary: "Delivery | Particular | 2 items",
    currentStep: "summary",
    lastEventAt: "2026-04-09T18:00:00.000Z",
    tags: ["delivery", "particular", "mode:delivery", "zone:recoleta"]
  });

  assert.equal(result.displayName, "Nicolas");
  assert.equal(result.statusLabel, "Con asesor");
  assert.deepEqual(result.tags, [
    { id: "delivery", label: "Delivery" },
    { id: "particular", label: "Particular" }
  ]);
  assert.deepEqual(result.tagIds, ["delivery", "particular"]);
});

test("devuelve grupos de filtros con contadores", () => {
  const payload = buildCompanionPayload({
    conversations: [
      { id: "1", contactId: "54911", tags: ["delivery", "particular"] },
      { id: "2", contactId: "54922", tags: ["mostrador", "obra_social"] },
      { id: "3", contactId: "54933", tags: ["delivery", "programa_obesidad_y_diabetes", "test_run"] }
    ],
    summary: {
      total: 3,
      open: 1,
      agentPending: 1,
      closed: 1,
      testRuns: 1,
      lastEventAt: "2026-04-09T18:00:00.000Z"
    }
  });

  assert.equal(payload.summary.total, 3);
  assert.equal(payload.conversations.length, 3);
  assert.equal(payload.filterGroups[0].options.find(option => option.id === "delivery").count, 2);
  assert.equal(
    payload.filterGroups[1].options.find(option => option.id === "programa_obesidad_y_diabetes").count,
    1
  );
  assert.equal(payload.filterGroups[2].options.find(option => option.id === "test_run").count, 1);
});

test("mapea etiquetas de estado a copy simple", () => {
  assert.equal(statusLabel("open"), "Abierto");
  assert.equal(statusLabel("agent_pending"), "Con asesor");
  assert.equal(statusLabel("closed"), "Cerrado");
});
