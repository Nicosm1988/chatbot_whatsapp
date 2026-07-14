const test = require("node:test");
const assert = require("node:assert/strict");

const { _private } = require("./webTextClient");
const { buildInactivityPromptAction } = require("./inactivity_cron");

test("el fallback de botones en modo web muestra letras y la instruccion en claro", () => {
  const text = _private.buildButtonFallbackText("Elegí una opción.", [
    { id: "mode_delivery", title: "Delivery" },
    { id: "mode_counter", title: "Mostrador" }
  ]);

  assert.match(text, /\*A\) Delivery\*/);
  assert.match(text, /\*B\) Mostrador\*/);
  assert.match(text, /\*Respondé con la letra de la opción\.\*/);
});

test("el fallback de listas en modo web separa productos y ayuda con formato claro", () => {
  const text = _private.buildListFallbackText("Elegí una opción.", [
    {
      title: "Productos",
      rows: [
        { id: "prod_a", title: "JABON DOVE PACK X8X90G", description: "$ 10.633,71" },
        { id: "prod_b", title: "JABON DOVE X90G", description: "$ 2.730,40" }
      ]
    },
    {
      title: "Ayuda",
      rows: [
        { id: "particular_option_rewrite", title: "Volver a escribir" },
        { id: "particular_option_human", title: "Contactar asesor", description: "El producto no está" }
      ]
    }
  ]);

  assert.match(text, /\*Opciones\*/);
  assert.match(text, /\*Productos\*/);
  assert.match(text, /\*A\) JABON DOVE PACK X8X90G \$ 10\.633,71\*/);
  assert.match(text, /\*B\) JABON DOVE X90G \$ 2\.730,40\*/);
  assert.match(text, /\*Ayuda\*/);
  assert.match(text, /C\) Volver a escribir/);
  assert.match(text, /D\) Contactar asesor\. El producto no está/);
  assert.doesNotMatch(text, /\*C\) Volver a escribir\*/);
  assert.doesNotMatch(text, /\*D\) Contactar asesor\. El producto no está\*/);
  assert.match(text, /\*Respondé con la letra de la opción\.\*/);
});

test("el recordatorio de inactividad muestra Si y No con letras", () => {
  const action = buildInactivityPromptAction();
  const text = _private.buildButtonFallbackText(action.text, action.buttons);

  assert.match(text, /¿Seguís ahí\? ¿Querés que continuemos\?/);
  assert.match(text, /\*A\) Sí\*/);
  assert.match(text, /\*B\) No\*/);
});

test("expone un helper para distinguir mensajes enviados por el bot", () => {
  assert.equal(_private.wasBotSentMessageId("wamid.fake"), false);
});

test("canoniza el destinatario saliente para deduplicar @c.us y @lid como el mismo chat", () => {
  assert.equal(
    _private.buildOutboundRecipientFingerprintKey("199303830229137@c.us"),
    "199303830229137"
  );
  assert.equal(
    _private.buildOutboundRecipientFingerprintKey("199303830229137@lid"),
    "199303830229137"
  );
});

test("extrae el id del mensaje cuando whatsapp-web.js devuelve el shape esperado", () => {
  assert.equal(
    _private.extractResponseMessageId({ id: { _serialized: "wamid.web.123" } }),
    "wamid.web.123"
  );
});

test("genera un id de respaldo si whatsapp-web.js devuelve una respuesta sin id", () => {
  const fallbackId = _private.extractResponseMessageId({});

  assert.match(fallbackId, /^web-\d+-\d+$/);
});
