const test = require("node:test");
const assert = require("node:assert/strict");

const { getPricingScenarios, findProductByText, suggestProductByText, searchProductsByText } = require("./product_discount_catalog");

function findScenario(scenarios, id) {
  return scenarios.find(item => item.id === id) || null;
}

test("calcula descuentos secuenciales desde el precio de lista para Delko 1", () => {
  const scenarios = getPricingScenarios("dutide_1_jer_x4", 152903.45);

  assert.equal(findScenario(scenarios, "particular_cash_transfer")?.finalPrice, 114677.59);
  assert.equal(findScenario(scenarios, "particular_debit")?.finalPrice, 122322.76);
  assert.equal(findScenario(scenarios, "particular_credit")?.finalPrice, 137613.11);
  assert.equal(findScenario(scenarios, "ftcheq_30_cash_transfer")?.finalPrice, 85625.94);
});

test("arma rangos variables para productos con FTCheq y recetario", () => {
  const scenarios = getPricingScenarios("ozempic_1_x3ml", 100000, { includeRecetario: true });

  assert.deepEqual(findScenario(scenarios, "ftcheq_variable_cash_transfer"), {
    id: "ftcheq_variable_cash_transfer",
    label: "FTCheq + Delko 20% ef/transf",
    minPrice: 52000,
    maxPrice: 60000,
    rangeNote: "segun porcentaje del laboratorio"
  });

  assert.deepEqual(findScenario(scenarios, "recetario_ftcheq_combo_cash_transfer"), {
    id: "recetario_ftcheq_combo_cash_transfer",
    label: "Recetario + FTCheq + Delko 20% ef/transf",
    minPrice: 41600,
    maxPrice: 48000,
    rangeNote: "segun porcentaje del laboratorio"
  });
});

test("permite ocultar escenarios de recetario cuando no corresponden", () => {
  const scenarios = getPricingScenarios("ozempic_1_x3ml", 100000, { includeRecetario: false });

  assert.ok(findScenario(scenarios, "ftcheq_variable_cash_transfer"));
  assert.equal(findScenario(scenarios, "recetario_ftcheq_combo_cash_transfer"), null);
});

test("aplica descuentos de particular a productos generales del sistema aunque no esten mapeados", () => {
  const scenarios = getPricingScenarios("", 32532.49, { includeRecetario: true });

  assert.equal(findScenario(scenarios, "particular_cash_transfer")?.finalPrice, 24399.37);
  assert.equal(findScenario(scenarios, "particular_debit")?.finalPrice, 26025.99);
  assert.equal(findScenario(scenarios, "particular_credit")?.finalPrice, 29279.24);
});

test("distingue entre match directo y sugerencia por similitud", () => {
  assert.equal(findProductByText("Mounjaro 5 mg KwikPen")?.id, "mounjaro_5_kwikpen");
  assert.equal(findProductByText("Monjaro 5 kwipen"), null);
  assert.equal(suggestProductByText("Monjaro 5 kwipen")?.id, "mounjaro_5_kwikpen");
});

test("searchProductsByText devuelve opciones textuales pero no typos flojos", () => {
  assert.ok(searchProductsByText("Mounjaro", "", { limit: 5 }).some(item => item.id === "mounjaro_5_kwikpen"));
  assert.equal(searchProductsByText("Monjaro 5 kwipen", "", { limit: 5 }).length, 0);
});
