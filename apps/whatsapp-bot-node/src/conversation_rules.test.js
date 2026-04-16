const test = require("node:test");
const assert = require("node:assert/strict");

const { nextBotReply, _private } = require("./conversation_rules");
const { getPricingScenarios } = require("./product_discount_catalog");

function buttonMessage(id, title) {
  return {
    type: "interactive",
    interactive: {
      button_reply: { id, title }
    }
  };
}

function listMessage(id, title) {
  return {
    type: "interactive",
    interactive: {
      list_reply: { id, title }
    }
  };
}

function imageMessage() {
  return {
    type: "image",
    image: { id: "img-1" }
  };
}

function firstText(actions) {
  const textAction = (actions || []).find(action => action.type === "text");
  return textAction ? textAction.text : "";
}

function firstInteractive(actions) {
  return (actions || []).find(action => action.type === "interactive") || null;
}

function promptText(actions) {
  return firstInteractive(actions)?.text || firstText(actions);
}

function rawOptions(actions) {
  return (actions || [])
    .filter(action => action.type === "interactive")
    .flatMap(action =>
      action.interactiveType === "list"
        ? (action.sections || []).flatMap(section => section.rows || [])
        : action.buttons || []
    );
}

function allOptions(actions) {
  return rawOptions(actions).filter(option => option.id !== "nav_home" && option.id !== "nav_restart");
}

function interactiveCount(actions) {
  return (actions || []).filter(action => action.type === "interactive").length;
}

function assertNoMojibake(actions) {
  const visibleText = [
    ...((actions || []).map(action => action.text || "")),
    ...((actions || []).map(action => action.buttonText || "")),
    ...allOptions(actions).map(option => option.title || ""),
    ...allOptions(actions).map(option => option.description || "")
  ].join("\n");

  assert.doesNotMatch(visibleText, /ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢|ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡/);
}

let contactCounter = 0;

function makeContactId() {
  contactCounter += 1;
  return `5499${String(Date.now()).slice(-8)}${String(contactCounter).padStart(3, "0")}`;
}

async function openParticular(contactId) {
  return nextBotReply({
    contactId,
    inboundText: "Particular",
    inboundMessage: listMessage("service_particular", "Particular")
  });
}

async function forceAutomatedParticular(contactId, options = {}) {
  await _private.forceParticularSearchFlow(contactId, options);
}

async function showCurrentPrompt(contactId) {
  return nextBotReply({
    contactId,
    inboundText: ""
  });
}

async function openAutomatedParticularDelivery(contactId) {
  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });
  await forceAutomatedParticular(contactId, { mode: "DELIVERY" });
  return showCurrentPrompt(contactId);
}

async function chooseParticularSearchByName(contactId) {
  return nextBotReply({
    contactId,
    inboundText: "Buscar por nombre",
    inboundMessage: buttonMessage("particular_search_name", "Buscar por nombre")
  });
}

async function chooseParticularSearchByDrug(contactId) {
  return nextBotReply({
    contactId,
    inboundText: "Buscar por droga",
    inboundMessage: buttonMessage("particular_search_drug", "Buscar por droga")
  });
}

async function chooseSearchNewFromHistory(contactId) {
  return nextBotReply({
    contactId,
    inboundText: "Buscar otro producto",
    inboundMessage: listMessage("recent_product_search_new", "Buscar otro producto")
  });
}

test.beforeEach(() => {
  _private.resetSessions();
});

test("el lookup usa copy honesto cuando el stock no pudo confirmarse", () => {
  const text = _private.buildLookupDetailsText({
    title: "DUTIDE 1 mg jer. prell. x 4",
    productId: "dutide_1_jer_x4",
    labTitle: "Elea",
    brandTitle: "DUTIDE",
    available: null,
    publicPrice: 152903.45,
    source: "api",
    note: "Stock: A pedido."
  });

  assert.match(text, /Stock: A pedido\./i);
  assert.match(text, /Stock:/i);
  assert.match(text, /Precios con descuentos en Delko 1:/i);
  assert.match(text, /Particular ef\/transf \(25%\): \$\s*114\.677,59/i);
  assert.match(text, /FTCheq 30% \+ Delko 20% ef\/transf: \$\s*85\.625,94/i);
  assert.doesNotMatch(text, /pendiente de validaci/i);
  assert.doesNotMatch(text, /Precio validado por Plex Center/i);
});

test("el lookup de productos generales tambien muestra descuentos y modalidades", () => {
  const text = _private.buildLookupDetailsText({
    title: "CLOB-X SHAMPOO 0.05% shamp.x 125 ml",
    productId: "",
    labTitle: "",
    brandTitle: "",
    available: null,
    publicPrice: 32532.49,
    source: "api",
    note: "Stock: A pedido."
  });

  assert.match(text, /Producto: CLOB-X SHAMPOO 0\.05% shamp\.x 125 ml/i);
  assert.match(text, /Precio: \$\s*32\.532,49/i);
  assert.match(text, /Precios con descuentos en Delko 1:/i);
  assert.match(text, /Particular ef\/transf \(25%\): \$\s*24\.399,37/i);
  assert.match(text, /Particular debito \(20%\): \$\s*26\.025,99/i);
  assert.match(text, /Particular credito \(10% \+ 3 cuotas\): \$\s*29\.279,24/i);
  assert.doesNotMatch(text, /\u00a0|\u202f|\u2007|\u2060|ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¿Ãƒâ€šÃ‚Â½/);
});

test("el resumen final deja detalle operativo y descuentos para productos generales", () => {
  const pricingScenarios = getPricingScenarios("", 32532.49, { includeRecetario: false });
  const text = _private.buildFinalCheckoutText({
    mode: "DELIVERY",
    recetarioAdhered: false,
    itemsList: [
      {
        productId: "",
        productTitle: "CLOB-X SHAMPOO 0.05% shamp.x 125 ml",
        stockStatus: "A pedido",
        publicPrice: 32532.49,
        note: "Stock: A pedido.",
        pricingScenarios
      }
    ],
    deliveryDraft: {
      firstName: "Nicolas",
      lastName: "San Marco",
      email: "nico@test.com",
      addressLine: "Av. Siempre Viva 123",
      crossStreets: "Belgrano y Mitre",
      neighborhood: "Centro"
    }
  });

  assert.match(text, /\*Resumen final\*/i);
  assert.match(text, /\*Productos\*/i);
  assert.match(text, /Producto: CLOB-X SHAMPOO 0\.05% shamp\.x 125 ml/i);
  assert.match(text, /Opciones de pago:/i);
  assert.match(text, /\*Totales del pedido\*/i);
  assert.match(text, /Particular ef\/transf \(25%\): \$\s*24\.399,37/i);
  assert.match(text, /\*Formas de pago\*/i);
  assert.match(text, /efectivo \/ transferencia/i);
  assert.match(text, /Av\. Siempre Viva 123/i);
  assert.match(text, /nico@\u200btest\.\u200bcom/i);
});

test("el saludo abre con Delivery o Mostrador", async () => {
  const result = await nextBotReply({
    contactId: makeContactId(),
    inboundText: "hola"
  });

  assert.match(firstText(result.actions), /farmacia delko/i);
  assert.equal(firstInteractive(result.actions)?.interactiveType, undefined);
  assert.deepEqual(allOptions(result.actions).map(option => option.title), ["Delivery", "Mostrador"]);
  assertNoMojibake(result.actions);
});

test("la modalidad web permite navegar menus escribiendo la letra de la opcion", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });

  let result = await nextBotReply({
    contactId,
    inboundText: "A"
  });

  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Particular", "Programa de sobrepeso y diabetes", "Obra Social", "Volver al menú anterior"]
  );

  result = await nextBotReply({
    contactId,
    inboundText: "B"
  });

  assert.match(promptText(result.actions), /laboratorio/i);

  result = await nextBotReply({
    contactId,
    inboundText: "A"
  });

  assert.match(promptText(result.actions), /marca/i);
  assertNoMojibake(result.actions);
});

test("la deduplicacion no bloquea la misma letra cuando cambia el menu", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  assert.equal(_private.markInboundFingerprint(contactId, "A", 1000), false);

  await nextBotReply({
    contactId,
    inboundText: "A"
  });

  assert.equal(_private.markInboundFingerprint(contactId, "A", 1200), false);

  const result = await nextBotReply({
    contactId,
    inboundText: "A"
  });

  assert.match(firstText(result.actions), /asesor/i);
  assert.equal(result.meta.handedToHuman, true);
  assertNoMojibake(result.actions);
});

test("la misma letra funciona al pasar de marca a presentacion en programa de sobrepeso y diabetes", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({ contactId, inboundText: "A" });
  await nextBotReply({ contactId, inboundText: "B" });

  let result = await nextBotReply({
    contactId,
    inboundText: "A"
  });

  assert.match(promptText(result.actions), /marca/i);

  result = await nextBotReply({
    contactId,
    inboundText: "A"
  });

  assert.match(promptText(result.actions), /present/i);
  assert.ok(allOptions(result.actions).some(option => option.title === "0.25 jer x4"));
  assertNoMojibake(result.actions);
});

test("muestra un solo volver al inicio visible y vuelve al menu principal", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  const serviceType = await nextBotReply({
    contactId,
    inboundText: "A"
  });

  assert.ok(rawOptions(serviceType.actions).some(option => option.id === "nav_home"));
  assert.equal(rawOptions(serviceType.actions).some(option => option.id === "nav_restart"), false);

  const restarted = await nextBotReply({
    contactId,
    inboundText: "Volver al inicio",
    inboundMessage: buttonMessage("nav_home", "Volver al inicio")
  });

  assert.deepEqual(allOptions(restarted.actions).map(option => option.title), ["Delivery", "Mostrador"]);
  assertNoMojibake(restarted.actions);
});

test("delivery abre Particular, Programa de sobrepeso y diabetes y Obra Social con opcion de volver", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  const result = await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });

  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /eleg|opci/i);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Particular", "Programa de sobrepeso y diabetes", "Obra Social", "Volver al menú anterior"]
  );
  assert.equal(firstInteractive(result.actions)?.interactiveType, "list");
  assertNoMojibake(result.actions);
});

test("volver al inicio lleva de nuevo al menu principal", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  let result = await nextBotReply({ contactId, inboundText: "A" });

  assert.ok(rawOptions(result.actions).some(option => option.id === "nav_home"));

  result = await nextBotReply({
    contactId,
    inboundText: "Volver al inicio",
    inboundMessage: buttonMessage("nav_home", "Volver al inicio")
  });

  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Delivery", "Mostrador"]
  );
});

test("la modalidad web permite elegir una opcion de producto escribiendo la letra", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({ contactId, inboundText: "A" });
  await nextBotReply({ contactId, inboundText: "B" });
  await nextBotReply({ contactId, inboundText: "A" });
  const optionsResult = await nextBotReply({ contactId, inboundText: "A" });

  assert.match(promptText(optionsResult.actions), /present/i);
  assert.ok(allOptions(optionsResult.actions).length >= 1);

  const pickResult = await nextBotReply({
    contactId,
    inboundText: "A"
  });

  assert.doesNotMatch(promptText(pickResult.actions), /No te entendÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­ bien/i);
  assert.ok(promptText(pickResult.actions).length > 0);
  assert.ok(allOptions(pickResult.actions).length >= 1);
});

test("mostrador va directo a receta y deriva a mostrador", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  let result = await nextBotReply({
    contactId,
    inboundText: "Mostrador",
    inboundMessage: buttonMessage("mode_counter", "Mostrador")
  });

  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /mostrador/i);
  assert.match(promptText(result.actions), /receta/i);
  assert.equal(firstInteractive(result.actions)?.interactiveType, undefined);
  assert.ok(allOptions(result.actions).some(button => button.id === "nav_back"));

  result = await nextBotReply({
    contactId,
    inboundText: "",
    inboundMessage: imageMessage()
  });

  assert.match(firstText(result.actions), /mostrador/i);
  assert.equal(result.meta.handedToHuman, true);
});

test("si en mostrador escriben un producto insiste con pedir la receta", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  const result = await nextBotReply({
    contactId,
    inboundText: "Mostrador",
    inboundMessage: buttonMessage("mode_counter", "Mostrador")
  });

  assert.match(promptText(result.actions), /receta/i);

  const retry = await nextBotReply({
    contactId,
    inboundText: "Quiero un shampoo Pantene"
  });

  assert.equal(interactiveCount(retry.actions), 1);
  assert.equal(retry.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(retry.actions), /receta en foto o pdf/i);
  assert.ok(allOptions(retry.actions).some(button => button.id === "nav_back"));
  assertNoMojibake(retry.actions);
});

test("obra social pide receta y responde con mensaje breve de asesor", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });

  let result = await nextBotReply({
    contactId,
    inboundText: "Obra Social",
    inboundMessage: listMessage("service_obra_social", "Obra Social")
  });
  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /obra social/i);
  assert.match(promptText(result.actions), /receta/i);
  assert.equal(firstInteractive(result.actions)?.interactiveType, undefined);

  result = await nextBotReply({
    contactId,
    inboundText: "",
    inboundMessage: imageMessage()
  });
  assert.match(firstText(result.actions), /muchas gracias|asesor continu/i);
  assert.equal(result.meta.handedToHuman, true);
});

test("si en obra social escriben un producto insiste con pedir la receta", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });

  await nextBotReply({
    contactId,
    inboundText: "Obra Social",
    inboundMessage: listMessage("service_obra_social", "Obra Social")
  });

  const retry = await nextBotReply({
    contactId,
    inboundText: "Quiero un shampoo Pantene"
  });

  assert.equal(interactiveCount(retry.actions), 1);
  assert.equal(retry.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(retry.actions), /receta en foto o pdf/i);
  assert.ok(allOptions(retry.actions).some(button => button.id === "nav_back"));
  assertNoMojibake(retry.actions);
});

test("vacunas guia por documento y muestra todas las presentaciones sin mas opciones", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });

  let result = await nextBotReply({
    contactId,
    inboundText: "Programa de sobrepeso y diabetes",
    inboundMessage: listMessage("service_treatment", "Programa de sobrepeso y diabetes")
  });
  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /programa de sobrepeso y diabetes/i);
  assert.match(promptText(result.actions), /laboratorio/i);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Elea", "Novo Nordisk", "Adium", "Volver al menú anterior"]
  );
  assert.equal(firstInteractive(result.actions)?.interactiveType, "list");

  result = await nextBotReply({
    contactId,
    inboundText: "Elea",
    inboundMessage: listMessage("item_lab_elea", "Elea")
  });
  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /marca/i);
  assert.equal(firstInteractive(result.actions)?.interactiveType, "list");

  result = await nextBotReply({
    contactId,
    inboundText: "DUTIDE",
    inboundMessage: buttonMessage("item_brand_dutide", "DUTIDE")
  });
  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /present/i);
  assert.equal(firstInteractive(result.actions)?.interactiveType, "list");
  assert.deepEqual(
    allOptions(result.actions).map(button => button.title),
    ["0.25 jer x4", "0.5 jer x4", "1 mg jer x4", "14 mg comp", "3 mg comp", "7 mg comp", "Volver al menú anterior"]
  );

  result = await nextBotReply({
    contactId,
    inboundText: "1 mg jer x4",
    inboundMessage: listMessage("item_variant_dutide_1_jer_x4", "1 mg jer x4")
  });
  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /producto:|stock:|precio/i);
  assert.ok(firstInteractive(result.actions));
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Terminar compra", "Volver al menú anterior"]
  );
  assertNoMojibake(result.actions);

  result = await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /recetario solidario/i);
  assert.deepEqual(
    allOptions(result.actions).map(button => button.title),
    ["Sí", "No", "Volver al menú anterior"]
  );
  assertNoMojibake(result.actions);
});

test("volver regresa al menu anterior dentro del flujo guiado", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });
  await nextBotReply({
    contactId,
    inboundText: "Programa de sobrepeso y diabetes",
    inboundMessage: listMessage("service_treatment", "Programa de sobrepeso y diabetes")
  });
  await nextBotReply({
    contactId,
    inboundText: "Elea",
    inboundMessage: listMessage("item_lab_elea", "Elea")
  });

  const result = await nextBotReply({
    contactId,
    inboundText: "Volver al menú anterior",
    inboundMessage: buttonMessage("nav_back", "Volver al menú anterior")
  });

  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /laboratorio/i);
  assert.equal(firstInteractive(result.actions)?.interactiveType, "list");
  assert.equal(allOptions(result.actions)?.[0]?.title, "Elea");
});

test("menu vuelve a las opciones sin volver a saludar", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });

  const result = await nextBotReply({
    contactId,
    inboundText: "MENU"
  });

  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /continuar/i);
  assert.equal(firstInteractive(result.actions)?.interactiveType, undefined);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Delivery", "Mostrador"]
  );
});

test("menu permite avanzar con la primera letra sin repetir la opcion", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "MENU"
  });

  const result = await nextBotReply({
    contactId,
    inboundText: "A"
  });

  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Particular", "Programa de sobrepeso y diabetes", "Obra Social", "Volver al menú anterior"]
  );
  assert.match(promptText(result.actions), /elegi una opcion|elegí una opción/i);
});

test("la misma letra se puede reutilizar en pasos consecutivos sin quedar suprimida", async () => {
  const contactId = makeContactId();

  let result = await nextBotReply({ contactId, inboundText: "hola" });
  assert.match(promptText(result.actions), /continuar/i);

  result = await nextBotReply({ contactId, inboundText: "A" });
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Particular", "Programa de sobrepeso y diabetes", "Obra Social", "Volver al menú anterior"]
  );

  result = await nextBotReply({ contactId, inboundText: "B" });
  assert.match(promptText(result.actions), /laboratorio/i);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Elea", "Novo Nordisk", "Adium", "Volver al menú anterior"]
  );

  result = await nextBotReply({ contactId, inboundText: "A" });
  assert.match(promptText(result.actions), /marca/i);
  assert.ok(allOptions(result.actions).some(option => option.title === "DUTIDE"));

  result = await nextBotReply({ contactId, inboundText: "A" });
  assert.match(promptText(result.actions), /present/i);
  assert.ok(allOptions(result.actions).some(option => option.title === "0.25 jer x4"));

  result = await nextBotReply({ contactId, inboundText: "A" });
  assert.match(promptText(result.actions), /producto:|stock:|precio/i);
});

test("particular deriva a asesor en el camino real del cliente", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });

  const result = await openParticular(contactId);
  assert.match(promptText(result.actions), /particular/i);
  assert.match(promptText(result.actions), /asesor/i);
  assert.equal(result.meta.handedToHuman, true);
  assert.equal(result.meta.sessionData?.waitingAdvisor, true);
  assertNoMojibake(result.actions);
});

test("particular tambien permite buscar por droga y elegir una opcion del sistema", async () => {
  const contactId = makeContactId();

  let result = await openAutomatedParticularDelivery(contactId);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Buscar por droga", "Buscar por nombre", "Volver al menú anterior"]
  );

  result = await chooseParticularSearchByDrug(contactId);
  assert.match(promptText(result.actions), /droga/i);
  assert.ok(allOptions(result.actions).some(button => button.id === "nav_back"));

  result = await nextBotReply({
    contactId,
    inboundText: "tirzepatida"
  });

  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(firstInteractive(result.actions)?.interactiveType, "list");
  assert.match(promptText(result.actions), /droga "tirzepatida"/i);
  assert.ok(allOptions(result.actions).some(option => /mounjaro/i.test(option.title)));
  assert.ok(allOptions(result.actions).some(option => option.id === "particular_option_human"));

  result = await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });

  assert.match(promptText(result.actions), /producto:|mounjaro/i);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Agregar algo más", "Terminar compra", "Volver al menú anterior"]
  );
  assertNoMojibake(result.actions);
});

test("delivery permite sumar mas de un producto y cerrar con datos de entrega", async () => {
  const contactId = makeContactId();

  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);

  let result = await nextBotReply({
    contactId,
    inboundText: "Mounjaro 5 mg KwikPen"
  });
  result = await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  assert.deepEqual(
    allOptions(result.actions).map(button => button.title),
    ["Agregar algo más", "Terminar compra", "Volver al menú anterior"]
  );
  assertNoMojibake(result.actions);

  result = await nextBotReply({
    contactId,
    inboundText: "Agregar algo más",
    inboundMessage: buttonMessage("summary_add_more", "Agregar algo más")
  });
  assert.match(promptText(result.actions), /sumar|producto/i);

  result = await nextBotReply({
    contactId,
    inboundText: "DUTIDE 1 mg jer x4"
  });
  assert.equal(firstInteractive(result.actions)?.interactiveType, "list");

  result = await nextBotReply({
    contactId,
    inboundText: "DUTIDE 1 mg jer. prell. x 4",
    inboundMessage: listMessage("particular_option_pick_0", "DUTIDE 1 mg jer. prell. x 4")
  });
  result = await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  assert.match(promptText(result.actions), /recetario solidario/i);
  assert.deepEqual(allOptions(result.actions).map(button => button.title), ["Sí", "No", "Volver al menú anterior"]);
  assertNoMojibake(result.actions);

  result = await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  assert.match(promptText(result.actions), /nombre/i);
  assert.match(promptText(result.actions), /apellido/i);
  assert.match(promptText(result.actions), /mail/i);
  assert.doesNotMatch(promptText(result.actions), /copi|formato/i);

  result = await nextBotReply({ contactId, inboundText: "Nicolas San Marco, nico@test.com" });
  assert.match(promptText(result.actions), /direcci/i);
  assert.match(promptText(result.actions), /entre calles/i);
  assert.match(promptText(result.actions), /barrio/i);
  assert.doesNotMatch(promptText(result.actions), /copi|formato/i);

  result = await nextBotReply({ contactId, inboundText: "Av. Siempre Viva 123, entre Belgrano y Mitre, Centro" });

  assert.match(firstText(result.actions), /Resumen final/i);
  assert.match(firstText(result.actions), /MOUNJARO/i);
  assert.match(firstText(result.actions), /DUTIDE/i);
  assert.match(firstText(result.actions), /Total:/i);
  assert.match(firstText(result.actions), /\*Recetario Solidario\*/i);
  assert.match(firstText(result.actions), /Totales con descuentos/i);
  assert.match(firstText(result.actions), /\*Formas de pago\*/i);
  assert.match(firstText(result.actions), /Av\. Siempre Viva 123/i);
  assertNoMojibake(result.actions);
  assert.equal(result.meta.handedToHuman, true);
});

test("delivery reutiliza la direccion guardada para el mismo celular", async () => {
  const contactId = makeContactId();

  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({
    contactId,
    inboundText: "Mounjaro 5 mg KwikPen"
  });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await nextBotReply({ contactId, inboundText: "Nicolas San Marco, nico@test.com" });
  await nextBotReply({ contactId, inboundText: "Av. Siempre Viva 123, entre Belgrano y Mitre, Centro" });

  await _private.closeContactConversation(contactId);
  await nextBotReply({ contactId, inboundText: "MENU" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });
  await forceAutomatedParticular(contactId, { mode: "DELIVERY" });
  let historyPrompt = await showCurrentPrompt(contactId);
  assert.match(promptText(historyPrompt.actions), /particular/i);
  assert.match(promptText(historyPrompt.actions), /último pedido|ultimo pedido|producto/i);
  assert.ok(allOptions(historyPrompt.actions).some(option => option.id === "recent_product_search_new"));

  await chooseSearchNewFromHistory(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({
    contactId,
    inboundText: "DUTIDE 1 mg jer x4"
  });
  await nextBotReply({
    contactId,
    inboundText: "DUTIDE 1 mg jer. prell. x 4",
    inboundMessage: listMessage("particular_option_pick_0", "DUTIDE 1 mg jer. prell. x 4")
  });
  const result = await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });

  assert.match(promptText(result.actions), /recetario solidario/i);
  assert.deepEqual(
    allOptions(result.actions).map(button => button.title),
    ["Sí", "No", "Volver al menú anterior"]
  );
  assertNoMojibake(result.actions);

  const savedAddressResult = await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });

  assert.match(promptText(savedAddressResult.actions), /tengo guardada esta direcci/i);
  assert.match(promptText(savedAddressResult.actions), /siempre viva 123/i);
  assert.deepEqual(
    allOptions(savedAddressResult.actions).map(button => button.title),
    ["Usar esta dirección", "Otra dirección", "Volver al menú anterior"]
  );
  assertNoMojibake(savedAddressResult.actions);
});

test("delivery completa el barrio en un segundo mensaje sin perder la direccion anterior", async () => {
  const contactId = makeContactId();
  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({
    contactId,
    inboundText: "Mounjaro 5 mg KwikPen"
  });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });

  let result = await nextBotReply({ contactId, inboundText: "Nicol\u00e1s San Marco, nmarcosan@gmail.com" });
  assert.match(promptText(result.actions), /direcci/i);

  result = await nextBotReply({ contactId, inboundText: "Coronel D\u00edaz, CABA, entre Soler y Paraguay" });
  assert.match(promptText(result.actions), /Me faltan estos datos: barrio/i);

  result = await nextBotReply({ contactId, inboundText: "Recoleta" });
  assert.match(firstText(result.actions), /Resumen final/i);
  assert.match(firstText(result.actions), /Nicol\u00e1s San Marco/i);
  assert.match(firstText(result.actions), /Coronel D\u00edaz, CABA/i);
  assert.match(firstText(result.actions), /Entre calles: Soler y Paraguay/i);
  assert.match(firstText(result.actions), /Barrio: Recoleta/i);
  assertNoMojibake(result.actions);
});

test("el prompt de recetario solidario sale limpio y con signos correctos", async () => {
  const contactId = makeContactId();

  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({
    contactId,
    inboundText: "Mounjaro 5 mg KwikPen"
  });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });

  const result = await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });

  assert.match(promptText(result.actions), /¿estás adherido al Recetario Solidario\?/i);
  assertNoMojibake(result.actions);
});

test("delivery acepta direccion, entre calles y barrio en tres lineas", async () => {
  const contactId = makeContactId();

  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({
    contactId,
    inboundText: "Mounjaro 5 mg KwikPen"
  });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await nextBotReply({ contactId, inboundText: "Nicolás San Marco, nmarcosan@gmail.com" });

  const result = await nextBotReply({
    contactId,
    inboundText: "Coronel Díaz 1465\nEntre Soler y Paraguay\nRecoleta"
  });

  assert.match(firstText(result.actions), /Resumen final/i);
  assert.match(firstText(result.actions), /Coronel Díaz 1465/i);
  assert.match(firstText(result.actions), /Entre calles: Soler y Paraguay/i);
  assert.match(firstText(result.actions), /Barrio: Recoleta/i);
  assert.doesNotMatch(firstText(result.actions), /Me faltan estos datos: barrio/i);
  assertNoMojibake(result.actions);
});

test("particular ofrece recompra rapida con los ultimos productos del mismo celular", async () => {
  const contactId = makeContactId();
  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({
    contactId,
    inboundText: "Mounjaro 5 mg KwikPen"
  });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await nextBotReply({ contactId, inboundText: "Nicolas San Marco, nico@test.com" });
  await nextBotReply({ contactId, inboundText: "Av. Siempre Viva 123, entre Belgrano y Mitre, Centro" });

  const profile = _private.getProfileSnapshot(contactId);
  assert.ok(Array.isArray(profile?.lastOrder?.itemsDetailed));
  assert.ok(profile.lastOrder.itemsDetailed.some(item => /mounjaro/i.test(item.productTitle)));

  await _private.closeContactConversation(contactId);
  await nextBotReply({ contactId, inboundText: "MENU" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });
  await forceAutomatedParticular(contactId, { mode: "DELIVERY" });
  let result = await showCurrentPrompt(contactId);
  assert.match(promptText(result.actions), /último pedido|ultimo pedido/i);
  assert.ok(allOptions(result.actions).some(option => /mounjaro/i.test(option.title)));
  assert.ok(allOptions(result.actions).some(option => option.id === "recent_product_search_new"));

  result = await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("recent_product_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });

  assert.match(promptText(result.actions), /producto:|mounjaro/i);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Agregar algo más", "Terminar compra", "Volver al menú anterior"]
  );
  assertNoMojibake(result.actions);
});

test("particular confirma por similitud antes de continuar", async () => {
  const contactId = makeContactId();
  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);

  let result = await nextBotReply({
    contactId,
    inboundText: "Monjaro 5 kwipen"
  });

  assert.equal(interactiveCount(result.actions), 1);
  assert.match(promptText(result.actions), /quisiste decir/i);
  assert.match(promptText(result.actions), /mounjaro 5 mg/i);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Sí", "No", "Volver a escribir"]
  );
  assertNoMojibake(result.actions);

  result = await nextBotReply({
    contactId,
    inboundText: "Si",
    inboundMessage: buttonMessage("particular_suggest_yes", "Si")
  });

  assert.equal(interactiveCount(result.actions), 1);
  assert.match(promptText(result.actions), /producto:|mounjaro/i);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Agregar algo más", "Terminar compra", "Volver al menú anterior"]
  );
  assertNoMojibake(result.actions);
});

test("particular permite rechazar la sugerencia y volver a escribir", async () => {
  const contactId = makeContactId();
  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);

  await nextBotReply({
    contactId,
    inboundText: "Monjaro 5 kwipen"
  });

  const result = await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("particular_suggest_no", "No")
  });

  assert.equal(interactiveCount(result.actions), 1);
  assert.match(promptText(result.actions), /escribime el nombre del producto otra vez/i);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Volver al menú anterior"]
  );
});

test("si no encuentra el producto ofrece reescribir o contactar asesor", async () => {
  const contactId = makeContactId();
  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);

  const result = await nextBotReply({
    contactId,
    inboundText: "zzzxproductoquenoexiste"
  });

  assert.equal(interactiveCount(result.actions), 1);
  assert.equal(result.actions.filter(action => action.type === "text").length, 0);
  assert.match(promptText(result.actions), /no encontr/i);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Volver a escribir", "Contactar asesor", "Volver al menú anterior"]
  );
});

test("particular permite escalar a asesor desde resultados no encontrados", async () => {
  const contactId = makeContactId();
  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({
    contactId,
    inboundText: "zzzxproductoquenoexiste"
  });

  const result = await nextBotReply({
    contactId,
    inboundText: "Contactar asesor",
    inboundMessage: buttonMessage("particular_option_human", "Contactar asesor")
  });

  assert.match(firstText(result.actions), /asesor/i);
  assert.equal(result.meta.handedToHuman, true);
});

test("escala a asesor luego de tres fallbacks consecutivos", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({ contactId, inboundText: "???" });
  await nextBotReply({ contactId, inboundText: "???" });
  const result = await nextBotReply({ contactId, inboundText: "???" });

  assert.match(firstText(result.actions), /asesor/i);
});

test("volver desde el submenu vuelve en una sola tarjeta al menu principal", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery")
  });

  const result = await nextBotReply({
    contactId,
    inboundText: "Volver al menú anterior",
    inboundMessage: listMessage("nav_back", "Volver al menú anterior")
  });

  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].type, "interactive");
  assert.match(promptText(result.actions), /continuar/i);
  assert.equal(firstInteractive(result.actions)?.interactiveType, undefined);
  assert.deepEqual(
    allOptions(result.actions).map(option => option.title),
    ["Delivery", "Mostrador"]
  );
});

test("suprime mensajes identicos casi simultaneos en el mismo contacto", async () => {
  const contactId = makeContactId();
  await _private.resetContactState(contactId);

  const firstTs = Date.now();
  const first = _private.markInboundFingerprint(contactId, "Hola", firstTs);
  const second = _private.markInboundFingerprint(contactId, "Hola", firstTs + 1000);
  const third = _private.markInboundFingerprint(contactId, "Hola", firstTs + 7000);

  assert.equal(first, false);
  assert.equal(second, true);
  assert.equal(third, false);
});

test("resetContactState limpia las variantes @lid, @c.us y bare del mismo contacto", async () => {
  const contactId = makeContactId();
  const bare = contactId.replace(/@c\.us$/i, "");
  const lid = `${bare}@lid`;

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({ contactId: bare, inboundText: "hola" });
  await nextBotReply({ contactId: lid, inboundText: "hola" });

  await _private.resetContactState(contactId, { preserveProfile: true });

  const mainState = await _private.getContactConversationState(contactId);
  const bareState = await _private.getContactConversationState(bare);
  const lidState = await _private.getContactConversationState(lid);

  assert.equal(mainState?.state, "idle");
  assert.equal(mainState?.step, null);
  assert.equal(bareState?.state, "idle");
  assert.equal(bareState?.step, null);
  assert.equal(lidState?.state, "idle");
  assert.equal(lidState?.step, null);
});

test.skip("despues del resumen final MENU pide paciencia hasta que responda un asesor [reemplazado]", async () => {
  const contactId = makeContactId();

  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({
    contactId,
    inboundText: "Mounjaro 5 mg KwikPen"
  });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await nextBotReply({ contactId, inboundText: "Nicolas San Marco, nico@test.com" });

  const finalSummary = await nextBotReply({
    contactId,
    inboundText: "Av. Siempre Viva 123, entre Belgrano y Mitre, Centro"
  });

  assert.match(firstText(finalSummary.actions), /Resumen final/i);
  assert.equal(finalSummary.meta.handedToHuman, true);
  assert.equal(finalSummary.meta.sessionData?.waitingAdvisor, true);

  const stateAfterSummary = await _private.getContactConversationState(contactId);
  assert.equal(stateAfterSummary?.state, "idle");
  assert.equal(stateAfterSummary?.sessionData?.waitingAdvisor, true);

  const resumed = await nextBotReply({ contactId, inboundText: "MENU" });
  assert.doesNotMatch(promptText(resumed.actions), /revisión|revision|asesor/i);
  assert.match(promptText(resumed.actions), /continuar/i);
  assert.deepEqual(allOptions(resumed.actions).map(option => option.title), ["Delivery", "Mostrador"]);

  const firstChoice = await nextBotReply({ contactId, inboundText: "A" });
  assert.deepEqual(
    allOptions(firstChoice.actions).map(option => option.title),
    ["Particular", "Programa de sobrepeso y diabetes", "Obra Social", "Volver al menú anterior"]
  );
});

test.skip("despues del resumen final un hola retoma el bot sin quedar atrapado en asesor [reemplazado]", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    inboundText: "Delivery",
    inboundMessage: buttonMessage("mode_delivery", "Delivery"),
    contactId
  });
  await openParticular(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({ contactId, inboundText: "Mounjaro 5 mg KwikPen" });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await nextBotReply({ contactId, inboundText: "Nicolas San Marco, nico@test.com" });
  await nextBotReply({ contactId, inboundText: "Av. Siempre Viva 123, entre Belgrano y Mitre, Centro" });

  const resumed = await nextBotReply({ contactId, inboundText: "Hola" });
  assert.doesNotMatch(promptText(resumed.actions), /revisión|revision|asesor/i);
  assert.match(promptText(resumed.actions), /continuar/i);
  assert.deepEqual(allOptions(resumed.actions).map(option => option.title), ["Delivery", "Mostrador"]);
});

test("despues del resumen final MENU recibe el mensaje de paciencia", async () => {
  const contactId = makeContactId();

  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({ contactId, inboundText: "Mounjaro 5 mg KwikPen" });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await nextBotReply({ contactId, inboundText: "Nicolas San Marco, nico@test.com" });
  await nextBotReply({ contactId, inboundText: "Av. Siempre Viva 123, entre Belgrano y Mitre, Centro" });

  const resumed = await nextBotReply({ contactId, inboundText: "MENU" });
  assert.match(
    firstText(resumed.actions),
    /Te pedimos paciencia, por favor, en breve un asesor se va a comunicar por este medio para terminar la compra\./i
  );
});

test("despues del resumen final un hola tambien recibe el mensaje de paciencia", async () => {
  const contactId = makeContactId();

  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({ contactId, inboundText: "Mounjaro 5 mg KwikPen" });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await nextBotReply({ contactId, inboundText: "Nicolas San Marco, nico@test.com" });
  await nextBotReply({ contactId, inboundText: "Av. Siempre Viva 123, entre Belgrano y Mitre, Centro" });

  const resumed = await nextBotReply({ contactId, inboundText: "Hola" });
  assert.match(
    firstText(resumed.actions),
    /Te pedimos paciencia, por favor, en breve un asesor se va a comunicar por este medio para terminar la compra\./i
  );
});

test("despues de la intervencion manual del asesor el bot deja de contestar automaticamente", async () => {
  const contactId = makeContactId();

  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({ contactId, inboundText: "Mounjaro 5 mg KwikPen" });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await nextBotReply({ contactId, inboundText: "Nicolas San Marco, nico@test.com" });
  await nextBotReply({ contactId, inboundText: "Av. Siempre Viva 123, entre Belgrano y Mitre, Centro" });

  await _private.markAdvisorManualControl(contactId);

  const afterAdvisorMessage = await nextBotReply({ contactId, inboundText: "Hola" });
  assert.equal(Array.isArray(afterAdvisorMessage.actions) ? afterAdvisorMessage.actions.length : 0, 0);
});

test("despues del cierre humano el cliente puede volver a iniciar normalmente", async () => {
  const contactId = makeContactId();

  await openAutomatedParticularDelivery(contactId);
  await chooseParticularSearchByName(contactId);
  await nextBotReply({ contactId, inboundText: "Mounjaro 5 mg KwikPen" });
  await nextBotReply({
    contactId,
    inboundText: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    inboundMessage: listMessage("particular_option_pick_0", "MOUNJARO 5 mg/0.6 mLx1 KwikPen")
  });
  await nextBotReply({
    contactId,
    inboundText: "Terminar compra",
    inboundMessage: buttonMessage("summary_finish", "Terminar compra")
  });
  await nextBotReply({
    contactId,
    inboundText: "No",
    inboundMessage: buttonMessage("recetario_no", "No")
  });
  await nextBotReply({ contactId, inboundText: "Nicolas San Marco, nico@test.com" });
  await nextBotReply({ contactId, inboundText: "Av. Siempre Viva 123, entre Belgrano y Mitre, Centro" });

  await _private.markAdvisorManualControl(contactId);
  await _private.closeContactConversation(contactId);

  const resumed = await nextBotReply({ contactId, inboundText: "Hola" });
  assert.match(promptText(resumed.actions), /continuar/i);
  assert.deepEqual(allOptions(resumed.actions).map(option => option.title), ["Delivery", "Mostrador"]);
});

test("en estado asesor no repite el aviso en loop", async () => {
  const contactId = makeContactId();

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({ contactId, inboundText: "Necesito ayuda humana" });
  const first = await nextBotReply({ contactId, inboundText: "sigo aca" });
  const second = await nextBotReply({ contactId, inboundText: "sigo aca" });

  assert.match(firstText(first.actions), /revisión|revision|MENU/i);
  assert.equal(Array.isArray(second.actions) ? second.actions.length : 0, 0);
});
