function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function trimText(value) {
  return String(value || "").trim();
}

function normalizeModeTag(mode) {
  const value = trimText(mode).toUpperCase();
  if (value === "DELIVERY") return "delivery";
  if (value === "MOSTRADOR") return "mostrador";
  return "";
}

function normalizeOrderTypeTag(orderType) {
  const value = trimText(orderType).toUpperCase();
  if (value === "PARTICULAR") return "particular";
  if (value === "OBRA SOCIAL") return "obra_social";
  if (value === "VACUNAS") return "programa_obesidad_y_diabetes";
  if (value === "MOSTRADOR") return "mostrador";
  return "";
}

function formatModeLabel(mode) {
  const tag = normalizeModeTag(mode);
  return tag === "delivery" ? "Delivery" : tag === "mostrador" ? "Mostrador" : "";
}

function formatOrderTypeLabel(orderType) {
  const tag = normalizeOrderTypeTag(orderType);
  if (tag === "particular") return "Particular";
  if (tag === "obra_social") return "Obra social";
  if (tag === "programa_obesidad_y_diabetes") return "Programa obesidad y diabetes";
  if (tag === "mostrador") return "Mostrador";
  return "";
}

function mergeConversationContextTags(existingTags, sessionData) {
  const tags = new Set(normalizeArray(existingTags).map(tag => trimText(tag)).filter(Boolean));
  const mode = trimText(sessionData?.mode);
  const orderType = trimText(sessionData?.orderType);
  const zone = trimText(sessionData?.zone).toLowerCase();

  if (orderType) {
    tags.add(`order_type:${orderType.toLowerCase()}`);
  }
  if (mode) {
    tags.add(`mode:${mode.toLowerCase()}`);
  }
  if (zone) {
    tags.add(`zone:${zone}`);
  }

  const modeTag = normalizeModeTag(mode);
  const orderTypeTag = normalizeOrderTypeTag(orderType);
  if (modeTag) {
    tags.add(modeTag);
  }
  if (orderTypeTag) {
    tags.add(orderTypeTag);
  }

  return Array.from(tags).slice(0, 40);
}

function buildSummaryFromContext(sessionData) {
  const parts = [];
  const modeLabel = formatModeLabel(sessionData?.mode);
  const orderTypeLabel = formatOrderTypeLabel(sessionData?.orderType);
  const zone = trimText(sessionData?.zone);
  const items = Number(sessionData?.items || 0);

  if (modeLabel) {
    parts.push(modeLabel);
  }
  if (orderTypeLabel && orderTypeLabel !== modeLabel) {
    parts.push(orderTypeLabel);
  }
  if (zone) {
    parts.push(`zona ${zone}`);
  }
  if (items > 0) {
    parts.push(`${items} item${items === 1 ? "" : "s"}`);
  }

  return parts.join(" | ");
}

function getClientFacingConversationTags(tags) {
  const ordered = [
    "delivery",
    "mostrador",
    "particular",
    "programa_obesidad_y_diabetes",
    "obra_social",
    "test_run"
  ];
  const tagSet = new Set(normalizeArray(tags).map(tag => trimText(tag)).filter(Boolean));
  return ordered
    .filter(tag => tagSet.has(tag))
    .map(tag => ({
      id: tag,
      label: formatClientFacingTagLabel(tag)
    }));
}

function formatClientFacingTagLabel(tag) {
  const value = trimText(tag);
  if (value === "delivery") return "Delivery";
  if (value === "mostrador") return "Mostrador";
  if (value === "particular") return "Particular";
  if (value === "programa_obesidad_y_diabetes") return "Programa obesidad y diabetes";
  if (value === "obra_social") return "Obra social";
  if (value === "test_run") return "Prueba";
  return "";
}

module.exports = {
  mergeConversationContextTags,
  buildSummaryFromContext,
  getClientFacingConversationTags,
  formatClientFacingTagLabel
};
