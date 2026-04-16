function indexToChoiceToken(index) {
  let value = Number(index);
  if (!Number.isInteger(value) || value < 0) {
    return "";
  }

  let token = "";
  do {
    token = String.fromCharCode(65 + (value % 26)) + token;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return token;
}

function normalizeChoiceLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractChoiceToken(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return "";
  }

  const compact = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

  const patterns = [
    /^([A-Z]{1,3})[\)\].:\-]?$/,
    /^(?:LETRA|OPCION)\s+([A-Z]{1,3})$/,
    /^RESPONDO CON\s+([A-Z]{1,3})$/,
    /^ELIJO\s+([A-Z]{1,3})$/
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

function combineChoiceLabel(title, description = "") {
  const safeTitle = String(title || "").trim();
  const safeDescription = String(description || "").trim();
  if (!safeDescription) {
    return safeTitle;
  }

  const separator = /^[A-Z\u00C1\u00C9\u00CD\u00D3\u00DA\u00DC\u00D1\u00BF]/u.test(safeDescription) && !/[.!?]$/.test(safeTitle)
    ? ". "
    : " ";
  return `${safeTitle}${separator}${safeDescription}`.trim();
}

module.exports = {
  indexToChoiceToken,
  normalizeChoiceLabel,
  extractChoiceToken,
  combineChoiceLabel
};
