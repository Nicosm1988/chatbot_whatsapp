const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeTransportContactId,
  shouldInvalidateQueuedInboundMessages,
  buildContactIdCandidates,
  buildPreferredContactIdCandidates,
  buildInboundQueueKey,
  matchesContactIdVariant,
  pruneCollectedWebIncomingMessages
} = require("./whatsapp_runtime_utils");

test("detecta mensajes que deben reiniciar la cola conversacional", () => {
  assert.equal(shouldInvalidateQueuedInboundMessages("Hola"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("MENU"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("inicio"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("opciones"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("Volver al inicio"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("Comenzar nuevamente desde el inicio"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("Comenzar nuevamente"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("reiniciar"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("Buen día"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("Buenas tardes"), true);
  assert.equal(shouldInvalidateQueuedInboundMessages("Quiero Mounjaro"), false);
});

test("genera variantes compatibles de contactId para @lid y @c.us", () => {
  assert.deepEqual(buildContactIdCandidates("5491122334455@c.us"), [
    "5491122334455@c.us",
    "5491122334455",
    "5491122334455@lid",
    "5491122334455@c.us"
  ].filter((value, index, array) => array.indexOf(value) === index));

  assert.equal(matchesContactIdVariant("199303830229137@lid", "199303830229137@c.us"), true);
  assert.equal(matchesContactIdVariant("199303830229137", "199303830229137@lid"), true);
  assert.equal(matchesContactIdVariant("199303830229137@lid", "108057166086307@lid"), false);
});

test("preserva la identidad de transporte y prioriza @lid para el runtime web", () => {
  assert.equal(normalizeTransportContactId({ _serialized: "199303830229137@lid" }), "199303830229137@lid");
  assert.equal(normalizeTransportContactId("199303830229137@c.us"), "199303830229137@c.us");

  assert.deepEqual(buildPreferredContactIdCandidates("199303830229137@c.us"), [
    "199303830229137@c.us",
    "199303830229137@lid",
    "199303830229137"
  ]);

  assert.deepEqual(buildPreferredContactIdCandidates("199303830229137"), [
    "199303830229137@lid",
    "199303830229137@c.us",
    "199303830229137"
  ]);

  assert.equal(buildInboundQueueKey("199303830229137@lid"), "199303830229137");
  assert.equal(buildInboundQueueKey("199303830229137@c.us"), "199303830229137");
  assert.equal(buildInboundQueueKey("199303830229137"), "199303830229137");
});

test("descarta backlog previo cuando en el lote aparece un Hola o MENU mas reciente", () => {
  const droppedIds = [];
  const input = [
    { id: "m1", from: "199303830229137@lid", body: "Entre Soler y Paraguay Recoleta" },
    { id: "m2", from: "199303830229137@lid", body: "Nicolás San Marco nmarcosan@gmail.com" },
    { id: "m3", from: "199303830229137@lid", body: "Hola" },
    { id: "m4", from: "199303830229137@lid", body: "A" },
    { id: "m5", from: "108057166086307@lid", body: "MENU" }
  ];

  const result = pruneCollectedWebIncomingMessages(input, {
    normalizeContactId: value => String(value || ""),
    markDroppedMessageId: messageId => droppedIds.push(messageId)
  });

  assert.deepEqual(
    result.kept.map(message => message.id),
    ["m3", "m4", "m5"]
  );
  assert.deepEqual(droppedIds, ["m1", "m2"]);
});

test("descarta backlog previo aunque MENU/Hola y mensajes viejos usen variantes distintas del mismo contacto", () => {
  const droppedIds = [];
  const input = [
    { id: "m1", from: "199303830229137@c.us", body: "Nicolás San Marco nmarcosan@gmail.com" },
    { id: "m2", from: "199303830229137", body: "Entre Soler y Paraguay Recoleta" },
    { id: "m3", from: "199303830229137@lid", body: "MENU" },
    { id: "m4", from: "199303830229137@c.us", body: "Hola" },
    { id: "m5", from: "108057166086307@lid", body: "Hola" }
  ];

  const result = pruneCollectedWebIncomingMessages(input, {
    normalizeContactId: value => String(value || ""),
    markDroppedMessageId: messageId => droppedIds.push(messageId)
  });

  assert.deepEqual(
    result.kept.map(message => message.id),
    ["m4", "m5"]
  );
  assert.deepEqual(droppedIds, ["m1", "m2", "m3"]);
});
