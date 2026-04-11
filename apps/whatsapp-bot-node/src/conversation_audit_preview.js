const { normalizeArray, truncateText } = require("./conversation_audit_formatters");

function trimText(value) {
  return String(value || "").trim();
}

function collapsePreview(text) {
  return truncateText(
    String(text || "")
      .replace(/\s+/g, " ")
      .trim(),
    110
  );
}

function buildFlowNote(payload) {
  const safe = payload && typeof payload === "object" ? payload : {};
  const transition = safe.transition && typeof safe.transition === "object" ? safe.transition : {};

  if (safe.handedToHuman) {
    return "Sigue con un asesor";
  }
  if (safe.closed && trimText(transition.routeKey) === "auto_close_inactivity") {
    return "Se cerró por falta de respuesta";
  }
  if (safe.closed) {
    return "Conversación cerrada";
  }
  return "";
}

function buildInboundPreview(payload) {
  const inbound = payload?.inbound && typeof payload.inbound === "object" ? payload.inbound : {};
  if (inbound.hasMedia) {
    return inbound.type === "image" ? "Foto enviada" : "Archivo enviado";
  }
  return collapsePreview(inbound.text || "Mensaje recibido");
}

function buildOutboundPreview(payload) {
  if (trimText(payload?.status).toLowerCase() === "failed") {
    return "";
  }

  const action = payload?.action && typeof payload.action === "object" ? payload.action : {};

  if (action.type === "image") {
    return collapsePreview(action.caption || "Imagen enviada");
  }

  if (trimText(action.text)) {
    return collapsePreview(action.text);
  }

  if (action.interactiveType === "list") {
    const firstRow = normalizeArray(action.sections)
      .flatMap(section => normalizeArray(section?.rows))
      .find(row => trimText(row?.title));
    if (firstRow) {
      return collapsePreview(`Opciones: ${firstRow.title}`);
    }
  }

  const firstButton = normalizeArray(action.buttons).find(button => trimText(button?.title));
  if (firstButton) {
    return collapsePreview(`Opciones: ${firstButton.title}`);
  }

  return "Mensaje enviado";
}

function inferConversationPreview(events) {
  const ordered = normalizeArray(events).slice().sort((a, b) => Number(a?.sequence || 0) - Number(b?.sequence || 0));

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const event = ordered[index];
    const type = trimText(event?.type);
    const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};

    if (type === "outbound_message") {
      const text = buildOutboundPreview(payload);
      if (text) {
        return {
          previewText: text,
          previewSide: "out",
          previewTimestamp: event.timestamp || null
        };
      }
    }

    if (type === "inbound_message") {
      const text = buildInboundPreview(payload);
      if (text) {
        return {
          previewText: text,
          previewSide: "in",
          previewTimestamp: event.timestamp || null
        };
      }
    }

    if (type === "flow_transition") {
      const note = buildFlowNote(payload);
      if (note) {
        return {
          previewText: note,
          previewSide: "note",
          previewTimestamp: event.timestamp || null
        };
      }
    }
  }

  return {
    previewText: "",
    previewSide: "",
    previewTimestamp: null
  };
}

function applyConversationPreview(conversation, events) {
  const preview = inferConversationPreview(events);
  return {
    ...(conversation && typeof conversation === "object" ? conversation : {}),
    ...preview
  };
}

module.exports = {
  buildFlowNote,
  buildInboundPreview,
  buildOutboundPreview,
  inferConversationPreview,
  applyConversationPreview
};
