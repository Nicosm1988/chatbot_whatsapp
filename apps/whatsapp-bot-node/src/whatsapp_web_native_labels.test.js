const test = require("node:test");
const assert = require("node:assert/strict");

const nativeLabels = require("./whatsapp_web_native_labels");

test("arma candidatos de chat para telefono y lid", () => {
  assert.deepEqual(nativeLabels._private.buildChatIdCandidates("5491122334455"), [
    "5491122334455@lid",
    "5491122334455@c.us",
    "5491122334455"
  ]);

  assert.deepEqual(nativeLabels._private.buildChatIdCandidates("199303830229137@lid"), ["199303830229137@lid"]);
});

test("resuelve etiquetas nativas deseadas por nombre", () => {
  const catalog = [
    { id: "a1", name: "Delivery" },
    { id: "b2", name: "Programa de sobrepeso y diabetes" }
  ];

  const result = nativeLabels._private.buildDesiredNativeLabelIds(["delivery", "programa_obesidad_y_diabetes"], catalog);

  assert.deepEqual(result.desiredLabelIds, ["a1", "b2"]);
  assert.deepEqual(result.missingLabelNames, []);
});
