const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCompanionConversation } = require("./whatsapp_web_companion");

test("arma tags visibles del companion aunque solo existan tagIds", () => {
  const conversation = buildCompanionConversation({
    id: "conv-1",
    contactId: "5491122334455",
    contactName: "Nico",
    status: "open",
    tagIds: ["delivery", "programa_obesidad_y_diabetes"]
  });

  assert.deepEqual(
    conversation.tags.map(tag => tag.label),
    ["Delivery", "Programa de sobrepeso y diabetes"]
  );
  assert.deepEqual(conversation.tagIds, ["delivery", "programa_obesidad_y_diabetes"]);
});

test("arma tags visibles del companion cuando tags llega como objetos", () => {
  const conversation = buildCompanionConversation({
    id: "conv-2",
    contactId: "5491122334455",
    contactName: "Tania",
    status: "open",
    tags: [{ id: "mostrador" }, { id: "esperando_asesor" }]
  });

  assert.deepEqual(
    conversation.tags.map(tag => tag.label),
    ["Mostrador", "Aguardando ser atendido"]
  );
  assert.deepEqual(conversation.tagIds, ["mostrador", "esperando_asesor"]);
});
