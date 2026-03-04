const assert = require("node:assert/strict");
const test = require("node:test");

const { nextBotReply, _private } = require("./conversation");

const CONTACT_ID = "5491112345678";

test("responds with welcome menu when sending random text in IDLE state", async () => {
  _private.resetSessions();

  const result = await nextBotReply({
    contactId: CONTACT_ID,
    inboundText: "hola buen dia"
  });

  assert.equal(result.actions.length, 1);
  const action = result.actions[0];
  assert.equal(action.type, "interactive");
  assert.equal(action.buttons.length, 3);
  assert.match(action.text, /Farmacias Selma/);
});

test("transitions to order state and shows delivery/pickup menu", async () => {
  _private.resetSessions();

  const result = await nextBotReply({
    contactId: CONTACT_ID,
    inboundText: "HACER PEDIDO"
  });

  assert.equal(result.actions.length, 1);
  const action = result.actions[0];
  assert.equal(action.type, "interactive");
  assert.equal(action.buttons.length, 2);
  assert.match(action.text, /\*CANCELAR\* para anular/);
});

test("transitions to delivery capture state and shows promo image", async () => {
  _private.resetSessions();

  // state 1: Order
  await nextBotReply({ contactId: CONTACT_ID, inboundText: "hacer pedido" });

  // state 2: Delivery info
  const result = await nextBotReply({ contactId: CONTACT_ID, inboundText: "ENVIOS" });

  assert.equal(result.actions.length, 1);
  const action = result.actions[0];
  assert.equal(action.type, "image");
  assert.match(action.caption, /COSTO DEL ENVIO/);
});

test("can cancel at any time and return to welcome menu", async () => {
  _private.resetSessions();

  await nextBotReply({ contactId: CONTACT_ID, inboundText: "hacer pedido" });

  const result = await nextBotReply({ contactId: CONTACT_ID, inboundText: "cancelar" });

  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[0].type, "text");
  assert.equal(result.actions[1].type, "interactive");
  assert.match(result.actions[0].text, /Pedido anulado/);
});
