const test = require("node:test");
const assert = require("node:assert/strict");

const { nextBotReply, _private } = require("./conversation_rules");

function buttonMessage(id, title) {
  return {
    type: "interactive",
    interactive: {
      button_reply: {
        id,
        title
      }
    }
  };
}

function imageMessage() {
  return {
    type: "image",
    image: {
      id: "mock-image-id"
    }
  };
}

function firstText(actions) {
  const item = (actions || []).find(action => action.type === "text");
  return item ? item.text : "";
}

test.beforeEach(() => {
  _private.resetSessions();
});

test("flujo completo de stock hasta cierre", async () => {
  const contactId = "5491111111111";

  let result = await nextBotReply({
    contactId,
    inboundText: "Consultar Stock",
    inboundMessage: buttonMessage("btn_stock", "📦 Consultar Stock")
  });
  assert.match(firstText(result.actions), /Consultar Stock/i);

  result = await nextBotReply({ contactId, inboundText: "Ibuprofeno" });
  assert.match(firstText(result.actions), /presentacion|dosis/i);

  result = await nextBotReply({ contactId, inboundText: "400 mg x 20" });
  assert.match(firstText(result.actions), /cantidad|cuantas/i);

  result = await nextBotReply({ contactId, inboundText: "2" });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Retiro sucursal",
    inboundMessage: buttonMessage("stock_mode_pickup", "Retiro sucursal")
  });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Centro",
    inboundMessage: buttonMessage("stock_branch_centro", "Centro")
  });
  assert.match(firstText(result.actions), /horario/i);

  result = await nextBotReply({ contactId, inboundText: "Hoy 18 a 20" });
  assert.equal(result.actions[1].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Confirmar",
    inboundMessage: buttonMessage("stock_confirm_yes", "Confirmar")
  });
  assert.match(firstText(result.actions), /Solicitud de stock registrada/i);
});

test("flujo completo de receta hasta cierre", async () => {
  const contactId = "5491122222222";

  let result = await nextBotReply({
    contactId,
    inboundText: "Enviar Receta",
    inboundMessage: buttonMessage("btn_receta", "📝 Enviar Receta")
  });
  assert.match(firstText(result.actions), /Enviar Receta/i);

  result = await nextBotReply({
    contactId,
    inboundText: "",
    inboundMessage: imageMessage()
  });
  assert.match(firstText(result.actions), /nombre y apellido/i);

  result = await nextBotReply({ contactId, inboundText: "Juan Perez" });
  assert.match(firstText(result.actions), /DNI/i);

  result = await nextBotReply({ contactId, inboundText: "30123456" });
  assert.match(firstText(result.actions), /obra social|cobertura|particular/i);

  result = await nextBotReply({ contactId, inboundText: "Particular" });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Retiro sucursal",
    inboundMessage: buttonMessage("receta_mode_pickup", "Retiro sucursal")
  });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Centro",
    inboundMessage: buttonMessage("receta_branch_centro", "Centro")
  });
  assert.match(firstText(result.actions), /horario/i);

  result = await nextBotReply({ contactId, inboundText: "Mañana por la mañana" });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Usar este numero",
    inboundMessage: buttonMessage("receta_contact_whatsapp", "Usar este numero")
  });
  assert.equal(result.actions[1].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Confirmar",
    inboundMessage: buttonMessage("receta_confirm_yes", "Confirmar")
  });
  assert.match(firstText(result.actions), /Solicitud de receta registrada/i);
});

test("flujo completo de turno hasta cierre", async () => {
  const contactId = "5491133333333";

  let result = await nextBotReply({
    contactId,
    inboundText: "Sacar un Turno",
    inboundMessage: buttonMessage("btn_turnos", "📅 Sacar un Turno")
  });
  assert.match(firstText(result.actions), /Sacar un Turno/i);

  result = await nextBotReply({
    contactId,
    inboundText: "Vacunacion",
    inboundMessage: buttonMessage("turno_service_vacuna", "Vacunacion")
  });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Norte 24hs",
    inboundMessage: buttonMessage("turno_branch_norte", "Norte 24hs")
  });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Hoy",
    inboundMessage: buttonMessage("turno_date_hoy", "Hoy")
  });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Tarde",
    inboundMessage: buttonMessage("turno_slot_tarde", "Tarde")
  });
  assert.match(firstText(result.actions), /nombre y apellido/i);

  result = await nextBotReply({ contactId, inboundText: "Maria Gomez" });
  assert.match(firstText(result.actions), /vacuna|orden medica|consulta/i);

  result = await nextBotReply({ contactId, inboundText: "Antigripal, sin orden medica" });
  assert.equal(result.actions[0].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Usar este numero",
    inboundMessage: buttonMessage("turno_contact_whatsapp", "Usar este numero")
  });
  assert.equal(result.actions[1].type, "interactive");

  result = await nextBotReply({
    contactId,
    inboundText: "Confirmar",
    inboundMessage: buttonMessage("turno_confirm_yes", "Confirmar")
  });
  assert.match(firstText(result.actions), /Turno pre-reservado/i);
});

test("escala a asesor humano despues de tres fallbacks consecutivos", async () => {
  const contactId = "5491144444444";

  await nextBotReply({
    contactId,
    inboundText: "Consultar Stock",
    inboundMessage: buttonMessage("btn_stock", "📦 Consultar Stock")
  });

  await nextBotReply({ contactId, inboundText: "" });
  await nextBotReply({ contactId, inboundText: "" });
  const result = await nextBotReply({ contactId, inboundText: "" });

  assert.match(firstText(result.actions), /asesor humano/i);
});
