const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseBotModeCommand,
  isOperatorSelfChat,
  buildBotModeConfirmation
} = require("./operator_bot_mode_commands");

test("interpreta solamente comandos completos de cambio de bot", () => {
  assert.deepEqual(parseBotModeCommand("Activá el bot inicial"), {
    mode: "holding",
    publicName: "Bot inicial"
  });
  assert.deepEqual(parseBotModeCommand("¡Activá el bot completo!"), {
    mode: "chatbot",
    publicName: "Bot completo"
  });
  assert.equal(parseBotModeCommand("bot inicial"), null);
  assert.equal(parseBotModeCommand("un cliente dijo activá el bot completo"), null);
});

test("solo habilita comandos enviados al chat propio de la farmacia", () => {
  assert.equal(isOperatorSelfChat("5491122334455@c.us", { user: "5491122334455" }), true);
  assert.equal(isOperatorSelfChat("5491199999999@c.us", "5491122334455@c.us"), false);
});

test("confirma el modo con lenguaje operativo", () => {
  assert.match(buildBotModeConfirmation({ mode: "holding" }), /Bot inicial activado/);
  assert.match(buildBotModeConfirmation({ mode: "chatbot" }), /Bot completo activado/);
});
