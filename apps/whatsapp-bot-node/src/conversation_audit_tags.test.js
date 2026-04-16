const test = require("node:test");
const assert = require("node:assert/strict");

const {
  mergeConversationContextTags,
  buildSummaryFromContext,
  getClientFacingConversationTags
} = require("./conversation_audit_tags");

test("genera etiquetas amigables para delivery y particular", () => {
  const tags = mergeConversationContextTags([], {
    mode: "DELIVERY",
    orderType: "PARTICULAR",
    zone: "Recoleta"
  });

  assert.ok(tags.includes("delivery"));
  assert.ok(tags.includes("particular"));
  assert.ok(tags.includes("mode:delivery"));
  assert.ok(tags.includes("order_type:particular"));
  assert.ok(tags.includes("zone:recoleta"));
});

test("mapea vacunas a programa de sobrepeso y diabetes para cliente", () => {
  const tags = mergeConversationContextTags([], {
    mode: "DELIVERY",
    orderType: "VACUNAS"
  });

  assert.ok(tags.includes("programa_obesidad_y_diabetes"));
  assert.equal(buildSummaryFromContext({ mode: "DELIVERY", orderType: "VACUNAS", items: 2 }), "Delivery | Programa de sobrepeso y diabetes | 2 items");
});

test("no duplica mostrador como modalidad y tipo al resumir", () => {
  const summary = buildSummaryFromContext({
    mode: "MOSTRADOR",
    orderType: "MOSTRADOR",
    items: 1
  });

  assert.equal(summary, "Mostrador | 1 item");
});

test("filtra etiquetas visibles y las devuelve con label simple", () => {
  const visible = getClientFacingConversationTags([
    "mode:delivery",
    "delivery",
    "obra_social",
    "test_run",
    "zone:recoleta"
  ]);

  assert.deepEqual(visible, [
    { id: "delivery", label: "Delivery" },
    { id: "obra_social", label: "Obra social" },
    { id: "test_run", label: "Prueba" }
  ]);
});

test("reemplaza etiquetas excluyentes cuando cambia de delivery a mostrador o viceversa", () => {
  const tags = mergeConversationContextTags(["delivery", "mode:delivery", "mostrador", "order_type:mostrador"], {
    mode: "DELIVERY",
    orderType: "PARTICULAR"
  });

  assert.ok(tags.includes("delivery"));
  assert.ok(tags.includes("mode:delivery"));
  assert.ok(tags.includes("particular"));
  assert.ok(tags.includes("order_type:particular"));
  assert.ok(!tags.includes("mostrador"));
  assert.ok(!tags.includes("order_type:mostrador"));
});

test("expone la etiqueta de espera de asesor para el cliente", () => {
  const visible = getClientFacingConversationTags(
    mergeConversationContextTags([], {
      mode: "DELIVERY",
      orderType: "PARTICULAR",
      waitingAdvisor: true
    })
  );

  assert.deepEqual(visible, [
    { id: "delivery", label: "Delivery" },
    { id: "particular", label: "Particular" },
    { id: "esperando_asesor", label: "Esperando a ser atendido por asesor" }
  ]);
});
