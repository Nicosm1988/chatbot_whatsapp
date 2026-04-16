const test = require("node:test");
const assert = require("node:assert/strict");

const {
  inferSessionDataFromRouteKey,
  inferContextFromEvents,
  inferConversationPresentation
} = require("./conversation_audit_inference");

test("infiere modalidad y categoria desde route keys cuando faltan en sessionData", () => {
  const inferred = inferSessionDataFromRouteKey("service_treatment", { mode: "DELIVERY" });
  assert.equal(inferred.mode, "DELIVERY");
  assert.equal(inferred.orderType, "VACUNAS");
});

test("reconstruye contexto acumulando flow transitions utiles", () => {
  const context = inferContextFromEvents([
    {
      type: "flow_transition",
      payload: {
        transition: { routeKey: "menu_delivery" },
        sessionData: { mode: "DELIVERY" }
      }
    },
    {
      type: "flow_transition",
      payload: {
        transition: { routeKey: "service_particular" },
        sessionData: { orderType: "PARTICULAR", items: 1 }
      }
    }
  ]);

  assert.equal(context.mode, "DELIVERY");
  assert.equal(context.orderType, "PARTICULAR");
  assert.equal(context.items, 1);
});

test("arma tags y resumen inferidos para conversaciones historicas", () => {
  const conversation = inferConversationPresentation(
    {
      id: "conv_1",
      tags: ["test_run"],
      summary: "",
      context: {}
    },
    [
      {
        type: "flow_transition",
        payload: {
          transition: { routeKey: "menu_delivery" },
          sessionData: { mode: "DELIVERY" }
        }
      },
      {
        type: "flow_transition",
        payload: {
          transition: { routeKey: "service_treatment" },
          sessionData: { orderType: "VACUNAS" }
        }
      }
    ]
  );

  assert.equal(conversation.summary, "Delivery | Programa de sobrepeso y diabetes");
  assert.ok(conversation.tags.includes("delivery"));
  assert.ok(conversation.tags.includes("programa_obesidad_y_diabetes"));
  assert.ok(conversation.tags.includes("test_run"));
});
