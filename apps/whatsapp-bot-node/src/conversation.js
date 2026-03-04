const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 20000;

const STATE_IDLE = "idle";
const STATE_ORDER = "order_type";
const STATE_DELIVERY_INFO = "delivery_info";
const STATE_PICKUP_INFO = "pickup_info";
const STATE_AGENT = "agent";

const sessions = new Map();

const IMAGE_PROMO_URL = "https://i.imgur.com/vHqB3qB.jpeg"; // Mocking the URL, the user can change it later or we can extract it if we had the actual image link.

async function nextBotReply({ contactId, inboundText }) {
  if (!contactId) {
    throw new Error("contactId is required");
  }

  cleanupExpiredSessions();
  const session = getSession(contactId);
  const normalized = normalizeInput(inboundText || "");

  // Global cancel
  if (normalized === "cancelar" || normalized === "salir") {
    session.state = STATE_IDLE;
    touchSession(contactId, session);
    return {
      actions: [
        { type: "text", text: "Pedido anulado correctamente." },
        getWelcomeMenu()
      ]
    };
  }

  // Update timestamp
  touchSession(contactId, session);

  // State Machine
  switch (session.state) {
    case STATE_IDLE:
      return handleIdleState(session, normalized);
    case STATE_ORDER:
      return handleOrderState(session, normalized);
    case STATE_DELIVERY_INFO:
      return handleInfoCapture(session, normalized, "envío");
    case STATE_PICKUP_INFO:
      return handleInfoCapture(session, normalized, "retiro");
    case STATE_AGENT:
      return { actions: [] }; // Muted, waiting for agent
    default:
      session.state = STATE_IDLE;
      return { actions: [getWelcomeMenu()] };
  }
}

function handleIdleState(session, normalized) {
  if (normalized.includes("hacer pedido")) {
    session.state = STATE_ORDER;
    return {
      actions: [
        getOrderTypeMenu()
      ]
    };
  } else if (normalized.includes("web") || normalized.includes("mercadolibre")) {
    return {
      actions: [
        { type: "text", text: "Podés encontrar nuestros productos en www.selmadigital.com.ar o en nuestra tienda oficial de MercadoLibre.\n\nEscribí MENDU para volver al inicio." }
      ]
    };
  } else if (normalized.includes("consultas") || normalized.includes("reclamos")) {
    session.state = STATE_AGENT;
    return {
      actions: [
        { type: "text", text: "Para consultas, por favor escribinos tu mensaje detallado y un representante se comunicará a la brevedad. (Escribí CANCELAR para volver)" }
      ]
    };
  }

  // Default fallback for IDLE
  return {
    actions: [
      getWelcomeMenu()
    ]
  };
}

function handleOrderState(session, normalized) {
  if (normalized.includes("envio")) {
    session.state = STATE_DELIVERY_INFO;
    return {
      actions: [
        {
          type: "image",
          url: "https://i.imgur.com/Kbdp8A8.png", // Placeholder image or provide a valid one
          caption: `COSTO DEL ENVIO: $ 5000\nRecordá que nuestro horario atención es:\nLunes a Viernes de 9:00 a 19 hs.\nSábados de 9 a 18:30hs y feriados con servicio reducido.\nTe invitamos a visitarnos en www.selmadigital.com.ar\n\nPara continuar con tu pedido por única vez te pedimos que nos informes EN UN SÓLO MENSAJE estos datos:\n\nNombre Completo:\nDNI:\nEmail:\nDomicilio Completo:\nEntre Calles:\nCódigo Postal:`
        }
      ]
    };
  } else if (normalized.includes("retiro")) {
    session.state = STATE_PICKUP_INFO;
    return {
      actions: [
        { type: "text", text: "Para continuar con tu pedido para RETIRO POR TIENDA, por favor indicanos EN UN SÓLO MENSAJE:\n\nNombre Completo:\nDNI:\nSucursal de retiro:" }
      ]
    };
  }

  // Not recognized, send menu again
  return {
    actions: [
      { type: "text", text: "Opción no válida." },
      getOrderTypeMenu()
    ]
  };
}

function handleInfoCapture(session, normalized, type) {
  // We assume the user wrote their data here.
  // We transition to an agent handoff transparently or acknowledge.
  session.state = STATE_AGENT;
  return {
    actions: [
      { type: "text", text: `¡Gracias! Hemos recibido tus datos para el ${type}. Un operador de Farmacia Delko se contactará con vos por este medio para confirmar el stock y el pago.\n\n(Tu chat ha sido derivado a un operador).` }
    ]
  };
}

function getWelcomeMenu() {
  return {
    type: "interactive",
    text: "Hola!, bienvenidos al sistema de pedidos de *Farmacia Delko*.\n\nPor favor seleccioná la opción que corresponda",
    buttons: [
      { id: "btn_pedido", title: "🏪 HACER PEDIDO" },
      { id: "btn_web", title: "💻 WEB / MERCADOLIBRE" },
      { id: "btn_consulta", title: "😶 CONSULTAS/RECLAMOS" }
    ]
  };
}

function getOrderTypeMenu() {
  return {
    type: "interactive",
    text: "Por favor seleccioná una opción o escribí la palabra *CANCELAR* para anular el pedido.",
    buttons: [
      { id: "btn_envios", title: "🚚 ENVIOS" },
      { id: "btn_retiro", title: "🏪 RETIRO POR TIENDA" }
    ]
  };
}


function getSession(contactId) {
  const existing = sessions.get(contactId);
  if (existing) {
    return existing;
  }

  const fresh = {
    state: STATE_IDLE,
    updatedAt: Date.now()
  };

  sessions.set(contactId, fresh);
  trimSessions();

  return fresh;
}

function touchSession(contactId, session) {
  session.updatedAt = Date.now();
  sessions.set(contactId, session);
}

function cleanupExpiredSessions() {
  const now = Date.now();

  for (const [contactId, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(contactId);
    }
  }
}

function trimSessions() {
  if (sessions.size <= MAX_SESSIONS) {
    return;
  }

  const amountToDelete = sessions.size - MAX_SESSIONS;
  let removed = 0;

  for (const contactId of sessions.keys()) {
    sessions.delete(contactId);
    removed += 1;
    if (removed >= amountToDelete) {
      break;
    }
  }
}

function normalizeInput(input) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resetSessions() {
  sessions.clear();
}

module.exports = {
  nextBotReply,
  _private: {
    resetSessions,
    normalizeInput
  }
};
