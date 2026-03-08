const test = require("node:test");
const assert = require("node:assert/strict");

const { createFlowEngine } = require("./flow_engine");

test("flow engine resuelve rutas por routeKey, fallback y salida por defecto", () => {
  const engine = createFlowEngine({
    id: "wf_test",
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    edges: [
      { id: "e1", from: "a", to: "b", routeKey: "go_b", disabled: false },
      { id: "e2", from: "a", to: "c", routeKey: "", disabled: false },
      { id: "e3", from: "c", to: "d", routeKey: "go_d", disabled: true }
    ]
  });

  assert.equal(engine.resolveRoute("a", "go_b", "c"), "b");
  assert.equal(engine.resolveRoute("a", "missing_key", "c"), "c");
  assert.equal(engine.resolveRoute("a", "missing_key", "missing"), "b");
  assert.equal(engine.resolveRoute("c", "go_d", "a"), "a");
});

test("flow engine ejecuta handler por nodo", () => {
  const engine = createFlowEngine({
    id: "wf_test",
    nodes: [{ id: "menu", kind: "ui" }],
    edges: []
  });

  const result = engine.executeNode({
    nodeId: "menu",
    handlers: {
      menu: () => ({
        actions: [{ type: "text", text: "ok" }]
      })
    },
    context: {}
  });

  assert.equal(Array.isArray(result.actions), true);
  assert.equal(result.actions[0].text, "ok");
});

