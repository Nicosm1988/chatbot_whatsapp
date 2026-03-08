const { config } = require("./config");

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 20000;
const KV_REST_API_URL = String(process.env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
const KV_REST_API_TOKEN = String(process.env.KV_REST_API_TOKEN || "").trim();
const KV_STATE_PREFIX = String(process.env.STATE_STORE_PREFIX || "wa:state:").trim();
const KV_ENABLED = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);

const S = {
  IDLE: "idle",
  ORDER: "order",
  AGENT: "agent"
};

const STEP = {
  RETURNING: "returning",
  MENU: "menu",
  MODE: "mode",
  ZONE: "zone",
  ADDRESS_DECISION: "address_decision",
  ADDRESS_INPUT: "address_input",
  PICKUP_BRANCH: "pickup_branch",
  ORDER_TYPE: "order_type",
  RECETA_UPLOAD: "receta_upload",
  CREDENTIAL_UPLOAD: "credential_upload",
  ITEM_INPUT: "item_input",
  ITEM_DECISION: "item_decision",
  AGENT_CONTINUE: "agent_continue",
  AGENT_ADD_MORE: "agent_add_more",
  PAYMENT_PROOF: "payment_proof",
  SURVEY: "survey"
};

const sessions = new Map();
const profiles = new Map();

async function nextBotReply({ contactId, contactName, inboundText, inboundMessage }) {
  if (!contactId) {
    throw new Error("contactId is required");
  }

  await hydrateState(contactId);
  cleanupExpiredSessions();
  const profile = getProfile(contactId, contactName);
  const session = getSession(contactId);
  const input = buildInput(inboundText, inboundMessage);
  let result;

  if (isCancel(input.normalized)) {
    resetSession(session);
    result = { actions: [{ type: "text", text: "Pedido cancelado." }, ...mainMenu(profile)] };
  } else if (isMenu(input.normalized)) {
    resetSession(session);
    result = { actions: mainMenu(profile) };
  } else if (isHuman(input.normalized)) {
    session.state = S.AGENT;
    session.step = null;
    session.fallback = 0;
    result = { actions: [{ type: "text", text: "Te derivo con un asesor. Para volver al bot, escribi MENU." }] };
  } else if (session.state === S.AGENT) {
    result = { actions: [{ type: "text", text: "Tu caso sigue con asesor humano. Escribi MENU para volver al bot." }] };
  } else if (session.state === S.IDLE && recoverFromInput(session, input)) {
    result = handleOrder(session, profile, input);
  } else if (session.state === S.IDLE) {
    result = startFlow(session, profile, input);
  } else {
    result = handleOrder(session, profile, input);
  }

  touchSession(contactId, session);
  await persistState(contactId, session, profile);
  return result;
}

function startFlow(session, profile, input) {
  session.state = S.ORDER;
  if (!input.normalized || isGreeting(input.normalized)) {
    if (profile.lastOrder) {
      move(session, STEP.RETURNING);
      return { actions: returningPrompt(profile) };
    }
  }
  move(session, STEP.MENU);
  return { actions: mainMenu(profile) };
}

function handleOrder(session, profile, input) {
  switch (session.step) {
    case STEP.RETURNING: {
      const c = parseReturning(input);
      if (!c) return fallback(session, "Elegi Continuar o Nuevo pedido.", "Selecciona una opcion:", returningButtons());
      if (c === "continue") {
        hydrateFromLastOrder(session, profile.lastOrder);
        move(session, STEP.ORDER_TYPE);
        return {
          actions: [
            { type: "text", text: continueSummary(profile.lastOrder) },
            orderTypeButtons()
          ]
        };
      }
      move(session, STEP.MENU);
      session.data = {};
      return { actions: [{ type: "text", text: "Perfecto, hacemos un pedido nuevo." }, ...mainMenu(profile, true)] };
    }

    case STEP.MENU: {
      const c = parseMenu(input);
      if (!c) return fallback(session, "Elegi una opcion del menu.", "Selecciona una opcion:", menuButtons());
      if (c === "web") {
        return {
          actions: [
            {
              type: "text",
              text: `Compra online en ${config.catalogWebUrl} o MercadoLibre: ${config.mercadoLibreUrl}.`
            },
            menuButtons()
          ]
        };
      }
      if (c === "support") {
        session.state = S.AGENT;
        session.step = null;
        return { actions: [{ type: "text", text: "Te derivo al sector de consultas y reclamos." }] };
      }
      move(session, STEP.MODE);
      return {
        actions: [
          { type: "text", text: "Selecciona modalidad o escribi CANCELAR." },
          buildInteractive("Modalidad:", [
            { id: "order_mode_delivery", title: "Envios" },
            { id: "order_mode_pickup", title: "Retiro tienda" }
          ])
        ]
      };
    }

    case STEP.MODE: {
      const mode = parseMode(input);
      if (!mode) return fallback(session, "Elegi Envios o Retiro tienda.", "Modalidad:", modeButtons());
      session.data.mode = mode;
      if (mode === "ENVIO") {
        move(session, STEP.ZONE);
        const actions = [];
        if (config.shippingPromoImageUrl) {
          actions.push({ type: "image", url: config.shippingPromoImageUrl, caption: "Promociones de envio" });
        }
        actions.push({ type: "text", text: "Perfecto. Ahora selecciona la zona de envio." });
        actions.push(zoneButtons());
        return { actions };
      }
      move(session, STEP.PICKUP_BRANCH);
      return {
        actions: [
          buildInteractive("Selecciona sucursal:", [
            { id: "pickup_san_isidro", title: "San Isidro" },
            { id: "pickup_martinez", title: "Martinez" },
            { id: "pickup_caba", title: "CABA" }
          ])
        ]
      };
    }

    case STEP.ZONE: {
      const zone = parseZone(input);
      if (!zone) return fallback(session, "Elegi Zona Norte, CABA o Pilar.", "Zona:", zoneButtons());
      session.data.zone = zone;
      if (profile.lastOrder?.address) {
        move(session, STEP.ADDRESS_DECISION);
        return {
          actions: [
            buildInteractive(`Enviar a ${profile.lastOrder.address}?`, [
              { id: "addr_yes_saved", title: "Si misma dir" },
              { id: "addr_other", title: "Otra direccion" }
            ])
          ]
        };
      }
      move(session, STEP.ADDRESS_INPUT);
      return { actions: [{ type: "text", text: "Envia direccion completa para el envio." }] };
    }

    case STEP.ADDRESS_DECISION: {
      const c = parseAddressChoice(input);
      if (!c) return fallback(session, "Elegi direccion guardada u otra.", "Selecciona una opcion:", addressButtons());
      if (c === "saved") {
        session.data.address = profile.lastOrder.address;
        move(session, STEP.ORDER_TYPE);
        return { actions: [orderTypeButtons()] };
      }
      move(session, STEP.ADDRESS_INPUT);
      return { actions: [{ type: "text", text: "Envia la nueva direccion completa." }] };
    }

    case STEP.ADDRESS_INPUT:
      if (!input.text || input.text.length < 8) return fallback(session, "Necesito una direccion completa.");
      session.data.address = trim(input.text, 120);
      move(session, STEP.ORDER_TYPE);
      return { actions: [orderTypeButtons()] };

    case STEP.PICKUP_BRANCH: {
      const b = parseBranch(input);
      if (!b) return fallback(session, "Elegi San Isidro, Martinez o CABA.");
      session.data.branch = b;
      move(session, STEP.ORDER_TYPE);
      return { actions: [orderTypeButtons()] };
    }

    case STEP.ORDER_TYPE: {
      // Resiliencia: si llega una imagen/documento en este punto, asumimos que
      // el usuario ya esta en flujo de obra social y quiso enviar receta.
      if (input.hasMedia) {
        session.data.orderType = "OBRA SOCIAL/PREPAGA";
        session.data.recipes = Number(session.data.recipes || 0) + 1;
        move(session, STEP.RECETA_UPLOAD);
        return {
          actions: [
            { type: "text", text: "Receta recibida. Si tenes mas, segui enviando. Si no, NO TENGO MAS." },
            buildInteractive("Selecciona una opcion:", [{ id: "receta_no_more", title: "No tengo mas" }])
          ]
        };
      }

      const t = parseType(input);
      if (!t) return fallback(session, "Elegi Particular u Obra social.", "Selecciona tipo:", orderTypeButtons());
      session.data.orderType = t;
      if (t === "OBRA SOCIAL/PREPAGA") {
        session.data.recipes = 0;
        move(session, STEP.RECETA_UPLOAD);
        return {
          actions: [
            { type: "text", text: "Envia fotos/links/PDF de recetas. Al terminar toca NO TENGO MAS." },
            buildInteractive("Selecciona una opcion:", [{ id: "receta_no_more", title: "No tengo mas" }])
          ]
        };
      }
      session.data.items = 0;
      move(session, STEP.ITEM_INPUT);
      return { actions: [{ type: "text", text: "Envia el primer producto (texto, foto o PDF)." }] };
    }

    case STEP.RECETA_UPLOAD:
      if (input.hasMedia) {
        session.data.recipes = Number(session.data.recipes || 0) + 1;
        return {
          actions: [
            { type: "text", text: "Receta recibida. Si tenes mas, segui enviando. Si no, NO TENGO MAS." },
            buildInteractive("Selecciona una opcion:", [{ id: "receta_no_more", title: "No tengo mas" }])
          ]
        };
      }
      if (isNoMore(input)) {
        if (!session.data.recipes) return fallback(session, "Primero envia al menos una receta.");
        move(session, STEP.CREDENTIAL_UPLOAD);
        return { actions: [{ type: "text", text: "Ahora envia la foto del frente de la credencial." }] };
      }
      return fallback(session, "Envia receta o toca NO TENGO MAS.");

    case STEP.CREDENTIAL_UPLOAD:
      if (!input.hasMedia) return fallback(session, "Necesito la foto/PDF de la credencial.");
      move(session, STEP.ITEM_DECISION);
      return { actions: [itemDecisionButtons()] };

    case STEP.ITEM_INPUT:
      if (!input.hasMedia && !input.text) return fallback(session, "Envia producto por texto, foto o PDF.");
      session.data.items = Number(session.data.items || 0) + 1;
      move(session, STEP.ITEM_DECISION);
      return { actions: [{ type: "text", text: "Producto agregado." }, itemDecisionButtons()] };

    case STEP.ITEM_DECISION: {
      const d = parseItemDecision(input);
      if (!d) return fallback(session, "Elegi Pedido completo, Agregar producto o Cancelar.", "Selecciona una opcion:", itemDecisionButtons());
      if (d === "cancel") {
        resetSession(session);
        return { actions: [{ type: "text", text: "Pedido cancelado." }, ...mainMenu(profile)] };
      }
      if (d === "add") {
        move(session, STEP.ITEM_INPUT);
        return { actions: [{ type: "text", text: "Perfecto, envia el siguiente producto." }] };
      }
      saveLastOrder(profile, session.data);
      move(session, STEP.AGENT_CONTINUE);
      return {
        actions: [
          { type: "text", text: "Gracias, un momento por favor. Enseguida continuamos con tu pedido." },
          { type: "text", text: `Hola, te comunicaste con envios de ${config.businessDisplayName}. Deseas continuar?` }
        ]
      };
    }

    case STEP.AGENT_CONTINUE: {
      const yn = parseYesNo(input);
      if (!yn) return fallback(session, "Responde SI o NO.");
      if (yn === "no") {
        resetSession(session);
        return { actions: [{ type: "text", text: "Dejamos el pedido en pausa. Escribi MENU para retomarlo." }] };
      }
      move(session, STEP.AGENT_ADD_MORE);
      return { actions: [{ type: "text", text: quoteSummary(session.data) }, { type: "text", text: "Queres agregar algo mas?" }] };
    }

    case STEP.AGENT_ADD_MORE: {
      const yn = parseYesNo(input);
      if (!yn) return fallback(session, "Responde SI para agregar o NO para pagar.");
      if (yn === "yes") {
        move(session, STEP.ITEM_INPUT);
        return { actions: [{ type: "text", text: "Envia el producto adicional." }] };
      }
      move(session, STEP.PAYMENT_PROOF);
      return {
        actions: [
          { type: "text", text: `Link de pago: ${config.paymentLinkUrl}` },
          { type: "text", text: "Aguardo comprobante de pago (imagen o PDF)." }
        ]
      };
    }

    case STEP.PAYMENT_PROOF:
      if (!input.hasMedia) return fallback(session, "Adjunta imagen o PDF del comprobante.");
      move(session, STEP.SURVEY);
      return {
        actions: [
          { type: "text", text: "Gracias, tu pedido saldra a partir de las 11 hs. Entrega estimada: 12 a 15 hs." },
          { type: "text", text: "PEDIDO EN PREPARACION" },
          { type: "text", text: "Tu opinion es importante. Del 1 al 10, como fue nuestra atencion?" }
        ]
      };

    case STEP.SURVEY: {
      const r = parseRating(input.normalized);
      if (!r) return fallback(session, "Necesito un numero del 1 al 10.");
      resetSession(session);
      return { actions: [{ type: "text", text: `Gracias por tu puntuacion ${r}/10.` }, ...mainMenu(profile, true)] };
    }

    default:
      move(session, STEP.MENU);
      return { actions: mainMenu(profile) };
  }
}

function mainMenu(profile, withIntro = false) {
  const actions = [];
  if (withIntro) {
    actions.push({ type: "text", text: "Por favor selecciona una opcion." });
  } else if (!profile.welcomed) {
    const name = profile.firstName ? `${profile.firstName}, ` : "";
    actions.push({ type: "text", text: `Hola ${name}te damos la bienvenida al sistema de pedidos de ${config.businessDisplayName}.` });
    profile.welcomed = true;
  }
  actions.push(menuButtons());
  return actions;
}

function menuButtons() {
  return buildInteractive("Selecciona una opcion:", [
    { id: "menu_make_order", title: "Hacer pedido" },
    { id: "menu_web", title: "Web/MercadoLibre" },
    { id: "menu_support", title: "Consultas/Reclamos" }
  ]);
}

function modeButtons() {
  return buildInteractive("Modalidad:", [
    { id: "order_mode_delivery", title: "Envios" },
    { id: "order_mode_pickup", title: "Retiro tienda" }
  ]);
}

function zoneButtons() {
  return buildInteractive("Selecciona zona:", [
    { id: "zone_norte", title: "Zona Norte" },
    { id: "zone_caba", title: "CABA" },
    { id: "zone_pilar", title: "Pilar" }
  ]);
}

function addressButtons() {
  return buildInteractive("Direccion:", [
    { id: "addr_yes_saved", title: "Si misma dir" },
    { id: "addr_other", title: "Otra direccion" }
  ]);
}

function orderTypeButtons() {
  return buildInteractive("Selecciona tipo:", [
    { id: "type_particular", title: "Particular" },
    { id: "type_obra_social", title: "Obra social" }
  ]);
}

function returningButtons() {
  return buildInteractive("Selecciona una opcion:", [
    { id: "return_continue", title: "Continuar" },
    { id: "return_new", title: "Nuevo pedido" }
  ]);
}

function itemDecisionButtons() {
  return buildInteractive("Selecciona una opcion:", [
    { id: "items_done", title: "Pedido completo" },
    { id: "items_add", title: "Agregar producto" },
    { id: "items_cancel", title: "Cancelar" }
  ]);
}

function returningPrompt(profile) {
  const name = profile.firstName ? `${profile.firstName}, ` : "";
  const last = profile.lastOrder || {};
  const lines = [
    `Hola ${name}te doy la bienvenida al sistema de pedidos de ${config.businessDisplayName}.`,
    "",
    "Tu ultimo pedido fue procesado con estos datos:",
    `Modalidad: ${last.mode || "No informada"}`
  ];
  if (last.address) lines.push(`Direccion: ${last.address}`);
  if (last.branch) lines.push(`Sucursal: ${last.branch}`);
  lines.push("", "Continuamos con estos datos?");
  return [{ type: "text", text: lines.join("\n") }, returningButtons()];
}

function continueSummary(last) {
  const lines = ["Perfecto, seguimos con datos guardados:", `- Modalidad: ${last.mode || "No informada"}`];
  if (last.address) lines.push(`- Direccion: ${last.address}`);
  if (last.branch) lines.push(`- Sucursal: ${last.branch}`);
  return lines.join("\n");
}

function quoteSummary(data) {
  const items = Number(data.items || 0);
  const products = 42000 + items * 7500;
  const shipping = data.mode === "ENVIO" ? 5000 : 0;
  const total = products + shipping;
  return [
    "Resumen preliminar:",
    `- Tipo: ${data.orderType || "No informado"}`,
    `- Items: ${items}`,
    `- Subtotal productos: $${products}`,
    `- Servicio entrega/empaque: $${shipping}`,
    `- Total preliminar: $${total}`
  ].join("\n");
}

function fallback(session, shortText, helpText, helpInteractive) {
  session.fallback = (session.fallback || 0) + 1;
  if (session.fallback === 1) return { actions: [{ type: "text", text: `No te entendi bien. ${shortText}` }] };
  if (session.fallback === 2) {
    const actions = [{ type: "text", text: helpText || shortText }];
    if (helpInteractive) actions.push(helpInteractive);
    return { actions };
  }
  session.state = S.AGENT;
  session.step = null;
  session.fallback = 0;
  return { actions: [{ type: "text", text: "Te paso con asesor humano para evitar demoras. Escribi MENU para volver al bot." }] };
}

function saveLastOrder(profile, data) {
  profile.lastOrder = {
    mode: data.mode || "",
    zone: data.zone || "",
    address: data.address || "",
    branch: data.branch || "",
    orderType: data.orderType || "",
    updatedAt: new Date().toISOString()
  };
}

function hydrateFromLastOrder(session, last) {
  session.data = {
    mode: last.mode || "",
    zone: last.zone || "",
    address: last.address || "",
    branch: last.branch || "",
    orderType: "",
    recipes: 0,
    items: 0
  };
}

function getProfile(contactId, contactName) {
  const existing = profiles.get(contactId);
  if (existing) {
    if (contactName) existing.firstName = firstName(contactName);
    return existing;
  }
  const profile = { firstName: firstName(contactName), welcomed: false, lastOrder: null };
  profiles.set(contactId, profile);
  return profile;
}

function parseMenu(input) {
  if (input.buttonId === "menu_make_order" || input.normalized.includes("pedido")) return "make_order";
  if (input.buttonId === "menu_web" || input.normalized.includes("web") || input.normalized.includes("mercadolibre")) return "web";
  if (input.buttonId === "menu_support" || input.normalized.includes("consulta") || input.normalized.includes("reclamo")) return "support";
  return null;
}

function parseReturning(input) {
  if (input.buttonId === "return_continue" || input.normalized === "continuar") return "continue";
  if (input.buttonId === "return_new" || input.normalized.includes("nuevo")) return "new";
  return null;
}

function parseMode(input) {
  if (input.buttonId === "order_mode_delivery" || input.normalized.includes("envio")) return "ENVIO";
  if (input.buttonId === "order_mode_pickup" || input.normalized.includes("retiro")) return "RETIRO POR TIENDA";
  return null;
}

function parseZone(input) {
  if (input.buttonId === "zone_norte" || input.normalized.includes("norte")) return "ZONA NORTE";
  if (input.buttonId === "zone_caba" || input.normalized.includes("caba")) return "CABA";
  if (input.buttonId === "zone_pilar" || input.normalized.includes("pilar")) return "PILAR";
  return null;
}

function parseAddressChoice(input) {
  if (input.buttonId === "addr_yes_saved" || input.normalized.includes("misma dir") || input.normalized === "si") return "saved";
  if (input.buttonId === "addr_other" || input.normalized.includes("otra direccion")) return "other";
  return null;
}

function parseBranch(input) {
  if (input.buttonId === "pickup_san_isidro" || input.normalized.includes("san isidro")) return "San Isidro";
  if (input.buttonId === "pickup_martinez" || input.normalized.includes("martinez")) return "Martinez";
  if (input.buttonId === "pickup_caba" || input.normalized.includes("caba")) return "CABA";
  return null;
}

function parseType(input) {
  if (input.buttonId === "type_particular" || input.normalized.includes("particular")) return "PARTICULAR";
  if (input.buttonId === "type_obra_social" || input.normalized.includes("obra social") || input.normalized.includes("prepaga")) return "OBRA SOCIAL/PREPAGA";
  return null;
}

function parseItemDecision(input) {
  if (input.buttonId === "items_done" || input.normalized.includes("pedido completo")) return "done";
  if (input.buttonId === "items_add" || input.normalized.includes("agregar")) return "add";
  if (input.buttonId === "items_cancel" || input.normalized.includes("cancelar")) return "cancel";
  return null;
}

function parseYesNo(input) {
  if (["si", "s", "ok", "dale", "continuar"].includes(input.normalized)) return "yes";
  if (["no", "pausar", "despues"].includes(input.normalized)) return "no";
  return null;
}

function parseRating(normalized) {
  const m = String(normalized || "").match(/\d{1,2}/);
  if (!m) return null;
  const v = Number(m[0]);
  return Number.isInteger(v) && v >= 1 && v <= 10 ? v : null;
}

function isNoMore(input) {
  return input.buttonId === "receta_no_more" || input.normalized === "no tengo mas";
}

function buildInput(inboundText, inboundMessage) {
  const buttonId = inboundMessage?.interactive?.button_reply?.id || inboundMessage?.button?.payload || "";
  const textFromMessage =
    inboundMessage?.text?.body ||
    inboundMessage?.button?.text ||
    inboundMessage?.interactive?.button_reply?.title ||
    inboundMessage?.interactive?.list_reply?.title ||
    inboundMessage?.document?.caption ||
    inboundMessage?.image?.caption ||
    "";
  const text = trim(inboundText || textFromMessage || "", 400);
  const normalized = normalize(text);
  const messageType = inboundMessage?.type || (text ? "text" : "unknown");
  const hasMedia = messageType === "image" || messageType === "document";
  return { text, normalized, buttonId, hasMedia };
}

function recoverFromInput(session, input) {
  const buttonId = input.buttonId || "";

  if (buttonId.startsWith("menu_")) {
    session.state = S.ORDER;
    move(session, STEP.MENU);
    return true;
  }

  if (buttonId.startsWith("order_mode_")) {
    session.state = S.ORDER;
    move(session, STEP.MODE);
    return true;
  }

  if (buttonId.startsWith("zone_")) {
    session.state = S.ORDER;
    session.data.mode = "ENVIO";
    move(session, STEP.ZONE);
    return true;
  }

  if (buttonId.startsWith("addr_")) {
    session.state = S.ORDER;
    session.data.mode = "ENVIO";
    move(session, STEP.ADDRESS_DECISION);
    return true;
  }

  if (buttonId.startsWith("pickup_")) {
    session.state = S.ORDER;
    session.data.mode = "RETIRO POR TIENDA";
    move(session, STEP.PICKUP_BRANCH);
    return true;
  }

  if (buttonId.startsWith("type_")) {
    session.state = S.ORDER;
    move(session, STEP.ORDER_TYPE);
    return true;
  }

  if (buttonId === "receta_no_more") {
    session.state = S.ORDER;
    move(session, STEP.RECETA_UPLOAD);
    return true;
  }

  if (buttonId.startsWith("items_")) {
    session.state = S.ORDER;
    move(session, STEP.ITEM_DECISION);
    return true;
  }

  if (looksLikeAddress(input.text)) {
    session.state = S.ORDER;
    session.data.mode = "ENVIO";
    move(session, STEP.ADDRESS_INPUT);
    return true;
  }

  return false;
}

function buildInteractive(text, buttons) {
  return { type: "interactive", text, buttons };
}

function move(session, step) {
  session.step = step;
  session.fallback = 0;
}

function resetSession(session) {
  session.state = S.IDLE;
  session.step = null;
  session.data = {};
  session.fallback = 0;
}

function getSession(contactId) {
  const s = sessions.get(contactId);
  if (s) return s;
  const fresh = { state: S.IDLE, step: null, data: {}, fallback: 0, updatedAt: Date.now() };
  sessions.set(contactId, fresh);
  trimSessions();
  return fresh;
}

function touchSession(contactId, session) {
  session.updatedAt = Date.now();
  sessions.set(contactId, session);
}

function buildStateKey(contactId) {
  return `${KV_STATE_PREFIX}${contactId}`;
}

async function hydrateState(contactId) {
  if (!KV_ENABLED || sessions.has(contactId)) {
    return;
  }

  const payload = await kvGetJson(buildStateKey(contactId));
  if (!payload || typeof payload !== "object") {
    return;
  }

  if (payload.session && typeof payload.session === "object") {
    sessions.set(contactId, payload.session);
  }

  if (payload.profile && typeof payload.profile === "object") {
    profiles.set(contactId, payload.profile);
  }
}

async function persistState(contactId, session, profile) {
  if (!KV_ENABLED) {
    return;
  }

  const payload = { session, profile };
  const ttlSeconds = Math.ceil(SESSION_TTL_MS / 1000);
  await kvSetJson(buildStateKey(contactId), payload, ttlSeconds);
}

async function kvGetJson(key) {
  try {
    const response = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data?.result === null || data?.result === undefined) {
      return null;
    }

    if (typeof data.result === "string") {
      return JSON.parse(data.result);
    }

    return typeof data.result === "object" ? data.result : null;
  } catch (error) {
    console.warn("KV read failed, using in-memory state:", error.message);
    return null;
  }
}

async function kvSetJson(key, value, ttlSeconds) {
  try {
    const encodedValue = encodeURIComponent(JSON.stringify(value));
    await fetch(`${KV_REST_API_URL}/setex/${encodeURIComponent(key)}/${ttlSeconds}/${encodedValue}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`
      },
      cache: "no-store"
    });
  } catch (error) {
    console.warn("KV write failed, state remains in-memory:", error.message);
  }
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

function trimSessions() {
  if (sessions.size <= MAX_SESSIONS) return;
  let remove = sessions.size - MAX_SESSIONS;
  for (const id of sessions.keys()) {
    sessions.delete(id);
    remove -= 1;
    if (remove <= 0) break;
  }
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function trim(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function firstName(name) {
  const clean = trim(name || "", 80);
  if (!clean) return "";
  return (clean.split(" ")[0] || "").replace(/[^A-Za-z0-9'-]/g, "");
}

function looksLikeAddress(text) {
  const raw = String(text || "").trim();
  if (raw.length < 10) {
    return false;
  }
  const hasDigit = /\d/.test(raw);
  const hasCommaOrSpace = raw.includes(",") || raw.includes(" ");
  return hasDigit && hasCommaOrSpace;
}

function isGreeting(normalized) {
  return ["hola", "buenas", "buen dia", "buenas tardes", "buenas noches", "hello"].includes(normalized);
}

function isCancel(normalized) {
  return ["cancelar", "cancel", "salir"].includes(normalized);
}

function isMenu(normalized) {
  return ["menu", "inicio", "opciones", "volver"].includes(normalized);
}

function isHuman(normalized) {
  return normalized.includes("asesor") || normalized.includes("agente") || normalized.includes("humano");
}

function resetSessions() {
  sessions.clear();
  profiles.clear();
}

module.exports = {
  nextBotReply,
  _private: {
    resetSessions,
    normalize,
    parseMenu,
    parseMode,
    parseZone,
    parseItemDecision
  }
};
