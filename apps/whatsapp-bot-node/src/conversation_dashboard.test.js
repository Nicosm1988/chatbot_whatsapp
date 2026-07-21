const test = require("node:test");
const assert = require("node:assert/strict");

const { renderConversationDashboard } = require("./conversation_dashboard");

test("el dashboard de conversaciones genera un script valido y con auto refresh", () => {
  const html = renderConversationDashboard();
  const match = html.match(/<script>([\s\S]*)<\/script>/);

  assert.ok(match, "script embebido no encontrado");
  assert.doesNotThrow(() => new Function(match[1]));
  assert.match(match[1], /AUTO_REFRESH_MS\s*=\s*12000/);
  assert.match(match[1], /window\.setInterval/);
  assert.match(match[1], /buildTranscriptEntries/);
  assert.match(html, /class="chat-shell"/);
  assert.match(html, /class="bubble-options"/);
  assert.match(html, /Bot inicial/);
  assert.match(html, /Bot completo/);
  assert.match(html, /data\.canUpdate===true/);
  assert.match(html, /Por seguridad, cambiá el modo desde la PC del bot/);
  assert.match(html, /Aguardando ser atendido/);
  assert.match(html, /Atendido/);
});
