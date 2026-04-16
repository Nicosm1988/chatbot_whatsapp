"use strict";

function normalizeAdvisorText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isAdvisorClosureText(value) {
  const text = normalizeAdvisorText(value);
  if (!text) {
    return false;
  }

  const hasClosureWord = /\b(finalizad[oa]s?|concluid[oa]s?|cerrad[oa]s?|terminad[oa]s?)\b/.test(text);
  if (!hasClosureWord) {
    return false;
  }

  return (
    /\b(operacion|pedido|compra|caso|gestion|atencion)\b/.test(text) ||
    /\bdamos por\b/.test(text) ||
    /\bqueda\b/.test(text)
  );
}

function buildAdvisorClosureFarewell() {
  return "Muchas gracias por confiar en Farmacia Delko. Fue un gusto acompa\u00f1arte. Cuando necesites algo, escribinos de nuevo por este medio; vamos a estar encantados de ayudarte. Te esperamos pronto.";
}

module.exports = {
  normalizeAdvisorText,
  isAdvisorClosureText,
  buildAdvisorClosureFarewell
};
