const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 20000;

const STATE_IDLE = "idle";
const STATE_STOCK = "stock";
const STATE_RECETA = "receta";
const STATE_TURNOS = "turnos";
const STATE_SUCURSALES = "sucursales";
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
    case STATE_STOCK:
      return handleStockState(session, normalized);
    case STATE_RECETA:
      return handleRecetaState(session, normalized);
    case STATE_TURNOS:
      return handleTurnosState(session, normalized);
    case STATE_SUCURSALES:
      return handleSucursalesState(session, normalized);
    case STATE_AGENT:
      return { actions: [] }; // Muted, waiting for agent
    default:
      session.state = STATE_IDLE;
      return { actions: [getWelcomeMenu()] };
  }
}

function handleIdleState(session, normalized) {
  if (normalized.includes("stock") || normalized.includes("medicamento")) {
    session.state = STATE_STOCK;
    return {
      actions: [
        { type: "text", text: "Para consultar el stock o precio de un medicamento, por favor escribí el nombre del producto exacto o envianos una foto de la caja.\n\nEscribí *CANCELAR* para volver al menú." }
      ]
    };
  } else if (normalized.includes("receta")) {
    session.state = STATE_RECETA;
    return {
      actions: [
        { type: "text", text: "Para validar tu receta, por favor envianos una foto clara donde se vea el diagnóstico, la firma del médico y el sello.\n\nEscribí *CANCELAR* para volver al menú." }
      ]
    };
  } else if (normalized.includes("turno")) {
    session.state = STATE_TURNOS;
    return {
      actions: [
        {
          type: "interactive",
          text: "¿Para qué servicio necesitas un turno?",
          buttons: [
            { id: "btn_vacunacion", title: "💉 Vacunación" },
            { id: "btn_presion", title: "❤️ Toma de Presión" },
            { id: "btn_asesoramiento", title: "👩‍⚕️ Asesoramiento" }
          ]
        }
      ]
    };
  } else if (normalized.includes("sucursal")) {
    return {
      actions: [
        { type: "text", text: "📍 *Sucursales Farmacia Modelo*\n\n- Centro: Av. Siempreviva 123 (Lun a Sáb 8 a 22hs)\n- Norte: Belgrano 456 (Lun a Dom 24hs)\n- Sur: San Martín 789 (Lun a Sáb 9 a 20hs)\n\nEscribí *MENU* para volver al inicio." }
      ]
    };
  } else if (normalized.includes("consulta") || normalized.includes("asesor")) {
    session.state = STATE_AGENT;
    return {
      actions: [
        { type: "text", text: "Para otras consultas, por favor escribinos tu mensaje detallado y un farmacéutico se comunicará a la brevedad. (Escribí *CANCELAR* para volver)" }
      ]
    };
  }

  return {
    actions: [
      getWelcomeMenu()
    ]
  };
}

function handleStockState(session, normalized) {
  // Capture the text or image that the user sends.
  session.state = STATE_AGENT;
  return {
    actions: [
      { type: "text", text: "¡Gracias! Hemos recibido tu consulta de stock. Un asesor revisará el sistema y te contestará por este medio a la brevedad." }
    ]
  };
}

function handleRecetaState(session, normalized) {
  // Capture photo of the recipe
  session.state = STATE_AGENT;
  return {
    actions: [
      { type: "text", text: "¡Receta recibida! Un farmacéutico la validará y te confirmará los pasos a seguir." }
    ]
  };
}

function handleTurnosState(session, normalized) {
  session.state = STATE_AGENT;
  return {
    actions: [
      { type: "text", text: "¡Perfecto! Un operador se pondrá en contacto enseguida para coordinar el horario del turno con vos." }
    ]
  };
}

function handleSucursalesState(session, normalized) {
  session.state = STATE_IDLE;
  return {
    actions: [getWelcomeMenu()]
  };
}

function getWelcomeMenu() {
  return {
    type: "interactive",
    text: "¡Hola! Bienvenido a *Farmacias Modelo*. ¿En qué te podemos ayudar hoy?\n\nPor favor seleccioná una opción:",
    buttons: [
      { id: "btn_stock", title: "📦 Consultar Stock" },
      { id: "btn_receta", title: "📝 Enviar Receta" },
      { id: "btn_turnos", title: "📅 Sacar un Turno" }
    ]
    // WhatsApp only supports up to 3 buttons. For the 4th (Sucursales), you'd normally use a List Message, but we'll keep it simple for now or advise the user.
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
