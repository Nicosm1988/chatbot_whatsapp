const test = require("node:test");
const assert = require("node:assert/strict");

const { nextBotReply, _private } = require("./conversation_rules");

function buttonMessage(id, title) {
  return {
    type: "interactive",
    interactive: {
      button_reply: { id, title }
    }
  };
}

function imageMessage() {
  return {
    type: "image",
    image: { id: "img-1" }
  };
}

function documentMessage() {
  return {
    type: "document",
    document: { id: "doc-1" }
  };
}

function firstText(actions) {
  const textAction = (actions || []).find(action => action.type === "text");
  return textAction ? textAction.text : "";
}

test.beforeEach(() => {
  _private.resetSessions();
});

test("flujo envio + obra social + pago + encuesta", async () => {
  const contactId = "5491111111111";

  let result = await nextBotReply({
    contactId,
    contactName: "Carla Test",
    inboundText: "hola"
  });
  assert.match(firstText(result.actions), /bienvenida|sistema de pedidos/i);

  result = await nextBotReply({
    contactId,
    inboundText: "Hacer pedido",
    inboundMessage: buttonMessage("menu_make_order", "Hacer pedido")
  });
  assert.match(firstText(result.actions), /modalidad|cancelar/i);

  result = await nextBotReply({
    contactId,
    inboundText: "Envios",
    inboundMessage: buttonMessage("order_mode_delivery", "Envios")
  });
  assert.match(firstText(result.actions), /zona de envio|selecciona la zona/i);

  result = await nextBotReply({
    contactId,
    inboundText: "Zona Norte",
    inboundMessage: buttonMessage("zone_norte", "Zona Norte")
  });
  assert.match(firstText(result.actions), /direccion/i);

  result = await nextBotReply({
    contactId,
    inboundText: "Jose Ingenieros 5334, Carapachay"
  });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Obra social",
    inboundMessage: buttonMessage("type_obra_social", "Obra social")
  });
  assert.match(firstText(result.actions), /recetas/i);

  result = await nextBotReply({
    contactId,
    inboundText: "",
    inboundMessage: imageMessage()
  });
  assert.match(firstText(result.actions), /Receta recibida/i);

  result = await nextBotReply({
    contactId,
    inboundText: "No tengo mas",
    inboundMessage: buttonMessage("receta_no_more", "No tengo mas")
  });
  assert.match(firstText(result.actions), /credencial/i);

  result = await nextBotReply({
    contactId,
    inboundText: "",
    inboundMessage: imageMessage()
  });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Pedido completo",
    inboundMessage: buttonMessage("items_done", "Pedido completo")
  });
  assert.match(firstText(result.actions), /un momento|continuamos/i);

  result = await nextBotReply({
    contactId,
    inboundText: "si"
  });
  assert.match(firstText(result.actions), /Resumen preliminar/i);

  result = await nextBotReply({
    contactId,
    inboundText: "no"
  });
  assert.match(firstText(result.actions), /Link de pago/i);

  result = await nextBotReply({
    contactId,
    inboundText: "",
    inboundMessage: documentMessage()
  });
  assert.match(firstText(result.actions), /pedido saldra|PEDIDO EN PREPARACION/i);

  result = await nextBotReply({
    contactId,
    inboundText: "9"
  });
  assert.match(firstText(result.actions), /puntuacion 9\/10/i);
});

test("flujo particular permite agregar producto y volver a decision", async () => {
  const contactId = "5491222222222";

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Hacer pedido",
    inboundMessage: buttonMessage("menu_make_order", "Hacer pedido")
  });
  await nextBotReply({
    contactId,
    inboundText: "Retiro tienda",
    inboundMessage: buttonMessage("order_mode_pickup", "Retiro tienda")
  });
  await nextBotReply({
    contactId,
    inboundText: "Martinez",
    inboundMessage: buttonMessage("pickup_martinez", "Martinez")
  });

  let result = await nextBotReply({
    contactId,
    inboundText: "Particular",
    inboundMessage: buttonMessage("type_particular", "Particular")
  });
  assert.match(firstText(result.actions), /primer producto/i);

  result = await nextBotReply({
    contactId,
    inboundText: "Paracetamol 500 mg x 16"
  });
  assert.match(firstText(result.actions), /Producto agregado/i);

  result = await nextBotReply({
    contactId,
    inboundText: "Agregar producto",
    inboundMessage: buttonMessage("items_add", "Agregar producto")
  });
  assert.match(firstText(result.actions), /siguiente producto/i);
});

test("cliente recurrente recibe opcion continuar o nuevo pedido", async () => {
  const contactId = "5491333333333";

  await nextBotReply({ contactId, contactName: "Carla Repeat", inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Hacer pedido",
    inboundMessage: buttonMessage("menu_make_order", "Hacer pedido")
  });
  await nextBotReply({
    contactId,
    inboundText: "Envios",
    inboundMessage: buttonMessage("order_mode_delivery", "Envios")
  });
  await nextBotReply({
    contactId,
    inboundText: "CABA",
    inboundMessage: buttonMessage("zone_caba", "CABA")
  });
  await nextBotReply({ contactId, inboundText: "Avenida Siempreviva 123, CABA" });
  await nextBotReply({
    contactId,
    inboundText: "Particular",
    inboundMessage: buttonMessage("type_particular", "Particular")
  });
  await nextBotReply({ contactId, inboundText: "Ibuprofeno" });
  await nextBotReply({
    contactId,
    inboundText: "Pedido completo",
    inboundMessage: buttonMessage("items_done", "Pedido completo")
  });
  await nextBotReply({ contactId, inboundText: "menu" });

  const result = await nextBotReply({
    contactId,
    inboundText: "hola"
  });

  assert.match(firstText(result.actions), /ultimo pedido|Continuamos/i);
  assert.equal(result.actions[1].type, "interactive");
});

test("escala a asesor luego de tres fallbacks consecutivos", async () => {
  const contactId = "5491444444444";

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Hacer pedido",
    inboundMessage: buttonMessage("menu_make_order", "Hacer pedido")
  });

  await nextBotReply({ contactId, inboundText: "???" });
  await nextBotReply({ contactId, inboundText: "???" });
  const result = await nextBotReply({ contactId, inboundText: "???" });

  assert.match(firstText(result.actions), /asesor humano/i);
});

test("si en paso tipo pedido llega media, la toma como receta y no retrocede", async () => {
  const contactId = "5491555555555";

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Hacer pedido",
    inboundMessage: buttonMessage("menu_make_order", "Hacer pedido")
  });
  await nextBotReply({
    contactId,
    inboundText: "Envios",
    inboundMessage: buttonMessage("order_mode_delivery", "Envios")
  });
  await nextBotReply({
    contactId,
    inboundText: "CABA",
    inboundMessage: buttonMessage("zone_caba", "CABA")
  });
  await nextBotReply({
    contactId,
    inboundText: "Av Corrientes 1234, CABA"
  });

  const result = await nextBotReply({
    contactId,
    inboundText: "",
    inboundMessage: imageMessage()
  });

  assert.match(firstText(result.actions), /Receta recibida/i);
});

test("si llega boton no tengo mas sin contador de recetas, continua a credencial", async () => {
  const contactId = "5491666666666";

  await nextBotReply({ contactId, inboundText: "hola" });
  await nextBotReply({
    contactId,
    inboundText: "Hacer pedido",
    inboundMessage: buttonMessage("menu_make_order", "Hacer pedido")
  });
  await nextBotReply({
    contactId,
    inboundText: "Envios",
    inboundMessage: buttonMessage("order_mode_delivery", "Envios")
  });
  await nextBotReply({
    contactId,
    inboundText: "CABA",
    inboundMessage: buttonMessage("zone_caba", "CABA")
  });
  await nextBotReply({ contactId, inboundText: "Av Corrientes 1234, CABA" });
  await nextBotReply({
    contactId,
    inboundText: "Obra social",
    inboundMessage: buttonMessage("type_obra_social", "Obra social")
  });

  const result = await nextBotReply({
    contactId,
    inboundText: "No tengo mas",
    inboundMessage: buttonMessage("receta_no_more", "No tengo mas")
  });

  assert.match(firstText(result.actions), /credencial/i);
});
