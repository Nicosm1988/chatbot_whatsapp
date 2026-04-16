const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeAdvisorText,
  isAdvisorClosureText,
  buildAdvisorClosureFarewell
} = require("./advisor_closure_detection");

test("detecta cierres escritos por asesor con lenguaje natural", () => {
  assert.equal(isAdvisorClosureText("Damos por cerrada la operación."), true);
  assert.equal(isAdvisorClosureText("Pedido finalizado, muchas gracias."), true);
  assert.equal(isAdvisorClosureText("Compra concluida."), true);
  assert.equal(isAdvisorClosureText("Atención finalizada. Gracias."), true);
  assert.equal(isAdvisorClosureText("Damos por terminada la operación."), true);
  assert.equal(isAdvisorClosureText("Pedido terminado."), true);
  assert.equal(isAdvisorClosureText("Seguimos en contacto."), false);
});

test("normaliza bien el texto para detectar acentos y mayúsculas", () => {
  assert.equal(normalizeAdvisorText("OPERACIÓN CERRADA"), "operacion cerrada");
});

test("la despedida del asesor es cálida y reutilizable", () => {
  const text = buildAdvisorClosureFarewell();
  assert.match(text, /Farmacia Delko/i);
  assert.match(text, /Te esperamos pronto/i);
});
