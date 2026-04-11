const { getClientFacingConversationTags } = require("./conversation_audit_tags");

function nowIso() {
  return new Date().toISOString();
}

function trimText(value) {
  return String(value || "").trim();
}

function statusLabel(status) {
  const value = trimText(status).toLowerCase();
  if (value === "closed") return "Cerrado";
  if (value === "agent_pending") return "Con asesor";
  return "Abierto";
}

function countTag(conversations, tagId) {
  return (Array.isArray(conversations) ? conversations : []).filter(conversation =>
    Array.isArray(conversation.tagIds) && conversation.tagIds.includes(tagId)
  ).length;
}

function buildFilterGroups(conversations) {
  const safe = Array.isArray(conversations) ? conversations : [];
  return [
    {
      id: "mode",
      label: "Modalidad",
      options: [
        { id: "all", label: "Todo", tags: [], count: safe.length },
        { id: "delivery", label: "Delivery", tags: ["delivery"], count: countTag(safe, "delivery") },
        { id: "mostrador", label: "Mostrador", tags: ["mostrador"], count: countTag(safe, "mostrador") }
      ]
    },
    {
      id: "category",
      label: "Categoria",
      options: [
        { id: "all", label: "Todas", tags: [], count: safe.length },
        { id: "particular", label: "Particular", tags: ["particular"], count: countTag(safe, "particular") },
        {
          id: "programa_obesidad_y_diabetes",
          label: "Programa obesidad y diabetes",
          tags: ["programa_obesidad_y_diabetes"],
          count: countTag(safe, "programa_obesidad_y_diabetes")
        },
        { id: "obra_social", label: "Obra social", tags: ["obra_social"], count: countTag(safe, "obra_social") }
      ]
    },
    {
      id: "misc",
      label: "Vista",
      options: [
        { id: "all", label: "Todo", tags: [], count: safe.length },
        { id: "test_run", label: "Pruebas", tags: ["test_run"], count: countTag(safe, "test_run") }
      ]
    }
  ];
}

function buildCompanionConversation(conversation) {
  const safe = conversation && typeof conversation === "object" ? conversation : {};
  const tags = getClientFacingConversationTags(safe.tags || []);
  return {
    id: trimText(safe.id),
    contactId: trimText(safe.contactId),
    contactName: trimText(safe.contactName),
    displayName: trimText(safe.contactName || safe.contactId || "Cliente"),
    status: trimText(safe.status || "open"),
    statusLabel: statusLabel(safe.status),
    summary: trimText(safe.summary || "Sin resumen todavia"),
    previewText: trimText(safe.previewText || ""),
    previewSide: trimText(safe.previewSide || ""),
    currentStep: trimText(safe.currentStep),
    lastEventAt: trimText(safe.lastEventAt) || null,
    tags,
    tagIds: tags.map(tag => tag.id)
  };
}

function buildCompanionPayload({ conversations, summary }) {
  const safeConversations = Array.isArray(conversations)
    ? conversations.map(buildCompanionConversation)
    : [];
  const safeSummary = summary && typeof summary === "object" ? summary : {};

  return {
    generatedAt: nowIso(),
    summary: {
      total: Number(safeSummary.total || safeConversations.length || 0),
      open: Number(safeSummary.open || 0),
      agentPending: Number(safeSummary.agentPending || 0),
      closed: Number(safeSummary.closed || 0),
      testRuns: Number(safeSummary.testRuns || 0),
      lastEventAt: trimText(safeSummary.lastEventAt) || null
    },
    filterGroups: buildFilterGroups(safeConversations),
    conversations: safeConversations
  };
}

module.exports = {
  buildCompanionConversation,
  buildCompanionPayload,
  statusLabel
};
