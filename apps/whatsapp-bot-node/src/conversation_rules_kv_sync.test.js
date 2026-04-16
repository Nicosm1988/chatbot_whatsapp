const test = require("node:test");
const assert = require("node:assert/strict");

function buttonMessage(id, title) {
  return {
    type: "interactive",
    interactive: {
      button_reply: { id, title }
    }
  };
}

function buildFetchStub(store) {
  return async function fetchStub(url) {
    const value = String(url || "");

    if (value.includes("/get/")) {
      const key = decodeURIComponent(value.split("/get/")[1] || "");
      const payload = store.has(key) ? JSON.stringify(store.get(key)) : null;
      return {
        ok: true,
        async json() {
          return { result: payload };
        }
      };
    }

    const setexMatch = value.match(/\/setex\/([^/]+)\/\d+\/(.+)$/);
    if (setexMatch) {
      const key = decodeURIComponent(setexMatch[1] || "");
      const payload = JSON.parse(decodeURIComponent(setexMatch[2] || ""));
      store.set(key, payload);
      return {
        ok: true,
        async json() {
          return { result: "OK" };
        }
      };
    }

    throw new Error(`Unexpected fetch call: ${value}`);
  };
}

function clearConversationRuleModules() {
  delete require.cache[require.resolve("./conversation_rules")];
  delete require.cache[require.resolve("./conversation_rules_v2")];
}

test("usa el estado de KV si es mas nuevo que una sesion local vieja", async () => {
  const previousUrl = process.env.KV_REST_API_URL;
  const previousToken = process.env.KV_REST_API_TOKEN;
  const previousHydrateGrace = process.env.LOCAL_STATE_HYDRATE_GRACE_MS;
  const previousWebUseKvState = process.env.WHATSAPP_WEB_USE_KV_STATE;
  const previousFetch = global.fetch;
  const kv = new Map();

  process.env.KV_REST_API_URL = "https://kv.example";
  process.env.KV_REST_API_TOKEN = "token";
  process.env.LOCAL_STATE_HYDRATE_GRACE_MS = "0";
  process.env.WHATSAPP_WEB_USE_KV_STATE = "true";
  global.fetch = buildFetchStub(kv);
  clearConversationRuleModules();

  const { nextBotReply, _private } = require("./conversation_rules");
  _private.resetSessions();

  const contactId = "5491100000001";
  const stateKey = `wa:state:${contactId}`;

  try {
    await nextBotReply({ contactId, inboundText: "hola" });
    await nextBotReply({
      contactId,
      inboundText: "Mostrador",
      inboundMessage: buttonMessage("mode_counter", "Mostrador")
    });

    const stalePayload = kv.get(stateKey);
    assert.ok(stalePayload?.session, "expected persisted session");
    assert.equal(stalePayload.session.step, "receta_upload");

    kv.set(stateKey, {
      ...stalePayload,
      session: {
        ...stalePayload.session,
        state: "order",
        step: "recetario",
        updatedAt: Number(stalePayload.session.updatedAt || 0) + 1000,
        data: {
          mode: "DELIVERY",
          orderType: "VACUNAS",
          lookup: {
            productId: "wegovy_24_x3ml",
            title: "WEGOVY 2.4 mg/ds lap.x1 x3ml",
            available: null,
            source: "document"
          }
        }
      }
    });

    const result = await nextBotReply({
      contactId,
      inboundText: "Sí",
      inboundMessage: buttonMessage("recetario_yes", "Sí")
    });

    assert.equal(result.meta.before.step, "recetario");
    assert.match(result.actions[0]?.text || "", /nombre|direccion|delivery/i);
  } finally {
    process.env.KV_REST_API_URL = previousUrl;
    process.env.KV_REST_API_TOKEN = previousToken;
    process.env.LOCAL_STATE_HYDRATE_GRACE_MS = previousHydrateGrace;
    process.env.WHATSAPP_WEB_USE_KV_STATE = previousWebUseKvState;
    global.fetch = previousFetch;
    clearConversationRuleModules();
  }
});
