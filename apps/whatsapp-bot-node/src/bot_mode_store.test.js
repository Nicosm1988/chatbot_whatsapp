const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeBotMode,
  INITIAL_WELCOME_MESSAGE,
  HOLDING_MESSAGE
} = require("./bot_mode_store");

test("acepta los nombres publicos de Bot inicial y Bot completo", () => {
  assert.equal(normalizeBotMode("inicial"), "holding");
  assert.equal(normalizeBotMode("initial"), "holding");
  assert.equal(normalizeBotMode("completo"), "chatbot");
  assert.equal(normalizeBotMode("complete"), "chatbot");
  assert.equal(normalizeBotMode("desconocido"), "");
});

test("el Bot inicial usa el mensaje propuesto y conserva el alias anterior", () => {
  assert.equal(HOLDING_MESSAGE, INITIAL_WELCOME_MESSAGE);
  assert.match(INITIAL_WELCOME_MESSAGE, /Muchas gracias por comunicarte con Farmacia Delko/);
  assert.match(INITIAL_WELCOME_MESSAGE, /En breve, una persona de nuestro equipo te atenderá/);
  assert.match(INITIAL_WELCOME_MESSAGE, /💚/u);
});
