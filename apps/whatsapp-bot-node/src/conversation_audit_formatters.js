function truncateText(value, max = 600) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function summarizeInboundMessage(message, inboundText) {
  const type = String(message?.type || (inboundText ? "text" : "unknown"));
  const buttonId = String(
    message?.interactive?.button_reply?.id ||
      message?.button?.payload ||
      message?.interactive?.list_reply?.id ||
      ""
  );
  const text =
    inboundText ||
    message?.text?.body ||
    message?.button?.text ||
    message?.interactive?.button_reply?.title ||
    message?.interactive?.list_reply?.title ||
    message?.document?.caption ||
    message?.image?.caption ||
    "";

  return {
    type,
    text: truncateText(text),
    buttonId,
    hasMedia: type === "image" || type === "document"
  };
}

function summarizeButton(button) {
  return {
    id: String(button?.id || ""),
    title: truncateText(button?.title || "", 80)
  };
}

function summarizeSection(section) {
  return {
    title: truncateText(section?.title || "", 80),
    rows: normalizeArray(section?.rows).map(row => ({
      id: String(row?.id || ""),
      title: truncateText(row?.title || "", 80),
      ...(row?.description ? { description: truncateText(row.description, 120) } : {})
    }))
  };
}

function summarizeOutboundAction(action) {
  const type = String(action?.type || "unknown");
  if (type === "text") {
    return {
      type,
      text: truncateText(action?.text || "")
    };
  }
  if (type === "interactive") {
    const interactiveType = String(action?.interactiveType || "").trim();
    const summary = {
      type,
      text: truncateText(action?.text || "")
    };

    if (interactiveType) {
      summary.interactiveType = interactiveType;
    }

    if (interactiveType === "list") {
      summary.buttonText = truncateText(action?.buttonText || "", 40);
      summary.sections = normalizeArray(action?.sections).map(summarizeSection);
      return summary;
    }

    summary.buttons = normalizeArray(action?.buttons).map(summarizeButton);
    return summary;
  }
  if (type === "image") {
    return {
      type,
      url: String(action?.url || ""),
      caption: truncateText(action?.caption || "", 200)
    };
  }
  return {
    type,
    raw: truncateText(JSON.stringify(action || {}), 400)
  };
}

module.exports = {
  summarizeInboundMessage,
  summarizeOutboundAction,
  truncateText,
  normalizeArray
};
