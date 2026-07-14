const INACTIVITY_PROMPT_TAG = "inactivity_prompt_sent";
const INACTIVITY_PROMPT_MINUTES = 15;

function buildInactivityPromptAction() {
  return {
    type: "interactive",
    text: "¿Seguís ahí? ¿Querés que continuemos?",
    buttons: [
      { id: "inactivity_continue_yes", title: "Sí" },
      { id: "inactivity_continue_no", title: "No" }
    ]
  };
}

function buildInactivityCloseAction() {
  return {
    type: "text",
    text: "Muchas gracias. Vamos a cerrar esta conversacion por ahora. Si necesitas retomar, escribinos de nuevo y seguimos por aca."
  };
}

function buildSnapshot(conversation) {
  if (!conversation?.currentState && !conversation?.currentStep) {
    return null;
  }
  return {
    state: conversation?.currentState || null,
    step: conversation?.currentStep || null
  };
}

function buildInactivityCloseMeta(conversation) {
  const snapshot = buildSnapshot(conversation);
  return {
    before: snapshot,
    after: snapshot,
    transition: {
      from: snapshot?.step || snapshot?.state || "inactivity_prompt",
      routeKey: "auto_close_inactivity",
      to: "conversation_closed"
    },
    closed: true,
    handedToHuman: false,
    sessionData: {}
  };
}

function stripInactivityPromptTag(tags) {
  return (Array.isArray(tags) ? tags : []).filter(tag => tag !== INACTIVITY_PROMPT_TAG);
}

function getMinutesInactive(conversation, nowMs = Date.now()) {
  const lastEventTime = new Date(conversation?.lastEventAt || 0).getTime();
  if (!Number.isFinite(lastEventTime)) {
    return 0;
  }
  return (nowMs - lastEventTime) / 60000;
}

async function processInactivityConversations({
  listConversations,
  dispatchAction,
  recordOutboundMessage,
  addConversationTag,
  recordFlowTransition,
  rememberPromptActions = async () => {},
  onDispatchError = () => {},
  nowMs = Date.now()
}) {
  const conversations = await listConversations({ limit: 100, status: "open" });
  let promptedCount = 0;
  let closedCount = 0;

  for (const conversation of conversations) {
    const minutesInactive = getMinutesInactive(conversation, nowMs);
    if (minutesInactive < INACTIVITY_PROMPT_MINUTES) {
      continue;
    }

    const hasPromptTag = Array.isArray(conversation?.tags)
      ? conversation.tags.includes(INACTIVITY_PROMPT_TAG)
      : false;

    if (!hasPromptTag) {
      const action = buildInactivityPromptAction();
      try {
        await dispatchAction(conversation.contactId, action);
        await rememberPromptActions(conversation.contactId, action);
        await recordOutboundMessage({
          conversationId: conversation.id,
          action,
          status: "sent"
        });
        await addConversationTag(conversation.id, INACTIVITY_PROMPT_TAG);
        promptedCount += 1;
      } catch (error) {
        onDispatchError(conversation, error);
      }
      continue;
    }

    const action = buildInactivityCloseAction();
    try {
      await dispatchAction(conversation.contactId, action);
      await recordOutboundMessage({
        conversationId: conversation.id,
        action,
        status: "sent"
      });
      await recordFlowTransition({
        conversationId: conversation.id,
        flowMeta: buildInactivityCloseMeta(conversation)
      });
      closedCount += 1;
    } catch (error) {
      onDispatchError(conversation, error);
    }
  }

  return {
    promptedCount,
    closedCount
  };
}

module.exports = {
  INACTIVITY_PROMPT_TAG,
  INACTIVITY_PROMPT_MINUTES,
  buildInactivityPromptAction,
  buildInactivityCloseAction,
  buildInactivityCloseMeta,
  stripInactivityPromptTag,
  getMinutesInactive,
  processInactivityConversations
};
