const test = require("node:test");
const assert = require("node:assert/strict");

const {
  summarizeInboundMessage,
  summarizeOutboundAction
} = require("./conversation_audit_formatters");

test("summarizeOutboundAction conserva listas interactivas con secciones y filas", () => {
  const summary = summarizeOutboundAction({
    type: "interactive",
    interactiveType: "list",
    text: "Elegi una opcion.",
    buttonText: "Ver opciones",
    sections: [
      {
        title: "Opciones",
        rows: [
          { id: "service_particular", title: "Particular" },
          { id: "service_treatment", title: "Vacunas" },
          { id: "service_obra_social", title: "Obra Social" },
          { id: "nav_back", title: "Volver" }
        ]
      }
    ]
  });

  assert.deepEqual(summary, {
    type: "interactive",
    interactiveType: "list",
    text: "Elegi una opcion.",
    buttonText: "Ver opciones",
    sections: [
      {
        title: "Opciones",
        rows: [
          { id: "service_particular", title: "Particular" },
          { id: "service_treatment", title: "Vacunas" },
          { id: "service_obra_social", title: "Obra Social" },
          { id: "nav_back", title: "Volver" }
        ]
      }
    ]
  });
});

test("summarizeOutboundAction conserva botones interactivos clasicos", () => {
  const summary = summarizeOutboundAction({
    type: "interactive",
    text: "Como queres continuar?",
    buttons: [
      { id: "mode_delivery", title: "Delivery" },
      { id: "mode_counter", title: "Mostrador" }
    ]
  });

  assert.deepEqual(summary, {
    type: "interactive",
    text: "Como queres continuar?",
    buttons: [
      { id: "mode_delivery", title: "Delivery" },
      { id: "mode_counter", title: "Mostrador" }
    ]
  });
});

test("summarizeInboundMessage conserva list_reply y buttonId", () => {
  const summary = summarizeInboundMessage(
    {
      type: "interactive",
      interactive: {
        list_reply: {
          id: "service_particular",
          title: "Particular"
        }
      }
    },
    "Particular"
  );

  assert.deepEqual(summary, {
    type: "interactive",
    text: "Particular",
    buttonId: "service_particular",
    hasMedia: false
  });
});
