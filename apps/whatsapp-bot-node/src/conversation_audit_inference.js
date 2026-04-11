const { mergeConversationContextTags, buildSummaryFromContext } = require("./conversation_audit_tags");
const { normalizeArray } = require("./conversation_audit_formatters");

function trimText(value) {
  return String(value || "").trim();
}

function hasObjectValues(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function mergeTruthySessionData(target, source) {
  const next = target && typeof target === "object" ? { ...target } : {};
  const safeSource = source && typeof source === "object" ? source : {};

  for (const [key, rawValue] of Object.entries(safeSource)) {
    if (typeof rawValue === "string") {
      if (trimText(rawValue)) {
        next[key] = rawValue;
      }
      continue;
    }
    if (typeof rawValue === "number") {
      if (Number.isFinite(rawValue) && rawValue > 0) {
        next[key] = rawValue;
      }
      continue;
    }
    if (typeof rawValue === "boolean") {
      if (rawValue) {
        next[key] = rawValue;
      }
      continue;
    }
    if (Array.isArray(rawValue)) {
      if (rawValue.length > 0) {
        next[key] = rawValue.slice();
      }
      continue;
    }
    if (hasObjectValues(rawValue)) {
      next[key] = { ...(next[key] && typeof next[key] === "object" ? next[key] : {}), ...rawValue };
    }
  }

  return next;
}

function inferSessionDataFromRouteKey(routeKey, sessionData) {
  const next = mergeTruthySessionData({}, sessionData);
  const key = trimText(routeKey).toLowerCase();

  if (key === "menu_delivery" && !trimText(next.mode)) {
    next.mode = "DELIVERY";
  }
  if (key === "menu_counter") {
    if (!trimText(next.mode)) next.mode = "MOSTRADOR";
    if (!trimText(next.orderType)) next.orderType = "MOSTRADOR";
  }
  if (key === "service_particular" && !trimText(next.orderType)) {
    next.orderType = "PARTICULAR";
  }
  if (key === "service_treatment" && !trimText(next.orderType)) {
    next.orderType = "VACUNAS";
  }
  if (key === "service_obra_social" && !trimText(next.orderType)) {
    next.orderType = "OBRA SOCIAL";
  }

  return next;
}

function inferContextFromEvents(events, baseContext = {}) {
  let context = mergeTruthySessionData({}, baseContext);

  for (const event of normalizeArray(events)) {
    if (String(event?.type || "") !== "flow_transition") {
      continue;
    }
    const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
    const routeKey = payload?.transition?.routeKey || "";
    const sessionData = inferSessionDataFromRouteKey(routeKey, payload?.sessionData);
    context = mergeTruthySessionData(context, sessionData);
  }

  return context;
}

function inferConversationPresentation(conversation, events) {
  const safeConversation = conversation && typeof conversation === "object" ? { ...conversation } : {};
  const inferredContext = inferContextFromEvents(events, safeConversation.context || {});
  const inferredTags = mergeConversationContextTags(safeConversation.tags || [], inferredContext);
  const inferredSummary = buildSummaryFromContext(inferredContext);

  return {
    ...safeConversation,
    context: inferredContext,
    tags: inferredTags,
    summary: trimText(inferredSummary || safeConversation.summary || "")
  };
}

module.exports = {
  mergeTruthySessionData,
  inferSessionDataFromRouteKey,
  inferContextFromEvents,
  inferConversationPresentation
};
