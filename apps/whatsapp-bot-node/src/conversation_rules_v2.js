const { config, isVercelRuntime } = require("./config");
const { combineChoiceLabel, extractChoiceToken, indexToChoiceToken, normalizeChoiceLabel } = require("./choice_format");
const { getChatbotRuntimeConfig } = require("./workflow_store");
const { createFlowEngine } = require("./flow_engine");
const {
  getLabs,
  getLabById,
  getBrandById,
  getBrandsByLab,
  getProductById,
  getProductsByBrand,
  getReferencePricing,
  getPricingScenarios,
  getProductCoverageNote,
  findLabByText,
  findBrandByText,
  findProductByText,
  suggestProductByText
} = require("./product_discount_catalog");
const { lookupProductAvailability, searchProductOptions } = require("./pharmacy_system_lookup");

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 20000;
const PARTICULAR_OPTIONS_PER_PAGE = 5;
const KV_REST_API_URL = String(process.env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
const KV_REST_API_TOKEN = String(process.env.KV_REST_API_TOKEN || "").trim();
const KV_STATE_PREFIX = String(process.env.STATE_STORE_PREFIX || "wa:state:").trim();
const FAST_LOCAL_STATE_SYNC = !isVercelRuntime && config.whatsappTransport === "web";
const LOCAL_WEB_KV_STATE_ENABLED =
  String(process.env.WHATSAPP_WEB_USE_KV_STATE || "").trim().toLowerCase() === "true";
const KV_ENABLED = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN) && (!FAST_LOCAL_STATE_SYNC || LOCAL_WEB_KV_STATE_ENABLED);
const LOCAL_STATE_HYDRATE_GRACE_MS = Math.max(0, Number(process.env.LOCAL_STATE_HYDRATE_GRACE_MS || (FAST_LOCAL_STATE_SYNC ? 3000 : 0)));
const KV_REQUEST_TIMEOUT_MS = Math.max(250, Number(process.env.KV_REQUEST_TIMEOUT_MS || (FAST_LOCAL_STATE_SYNC ? 1200 : 3500)));
const KV_REMOTE_BACKOFF_MS = Math.max(
  10000,
  Number(process.env.KV_REMOTE_BACKOFF_MS || (FAST_LOCAL_STATE_SYNC ? 300000 : 30000))
);
const DUPLICATE_INBOUND_WINDOW_MS = Math.max(250, Number(process.env.DUPLICATE_INBOUND_WINDOW_MS || 2500));
const COARSE_DUPLICATE_INBOUND_WINDOW_MS = Math.max(
  300,
  Math.min(DUPLICATE_INBOUND_WINDOW_MS, Number(process.env.COARSE_DUPLICATE_INBOUND_WINDOW_MS || 900))
);
const AGENT_AUTO_REPLY_COOLDOWN_MS = Math.max(30000, Number(process.env.AGENT_AUTO_REPLY_COOLDOWN_MS || 300000));

const S = {
  IDLE: "idle",
  ORDER: "order",
  AGENT: "agent"
};

const STEP = {
  MENU: "menu",
  SERVICE_TYPE: "service_type",
  PARTICULAR_SEARCH_MODE: "particular_search_mode",
  RECETA_UPLOAD: "receta_upload",
  PARTICULAR_INPUT: "particular_input",
  CART_INPUT: "cart_input",
  ITEM_INPUT: "item_input",
  RECETARIO: "recetario",
  SUMMARY: "summary",
  DELIVERY_SAVED: "delivery_saved",
  DELIVERY_DETAILS: "delivery_details",
  DELIVERY_FIRST_NAME: "delivery_first_name",
  DELIVERY_LAST_NAME: "delivery_last_name",
  DELIVERY_EMAIL: "delivery_email",
  DELIVERY_ADDRESS: "delivery_address",
  DELIVERY_CROSS_STREETS: "delivery_cross_streets",
  DELIVERY_NEIGHBORHOOD: "delivery_neighborhood"
};

const sessions = new Map();
const profiles = new Map();
const recentInboundFingerprints = new Map();
let kvRemoteBackoffUntil = 0;
const PRODUCT_SEARCH_MODE = {
  NAME: "product_name",
  DRUG: "drug"
};
const arsFormatter = new Intl.NumberFormat("es-AR", {
  style: "decimal",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function buildSessionContactCandidates(contactId) {
  const raw = String(contactId || "").trim();
  const bare = raw.replace(/@(c\.us|lid)$/i, "");
  if (!bare) {
    return [];
  }

  return [...new Set([raw, bare, `${bare}@lid`, `${bare}@c.us`].filter(Boolean))];
}

function isStateRemoteBackoffActive() {
  return FAST_LOCAL_STATE_SYNC && kvRemoteBackoffUntil > Date.now();
}

function markStateRemoteBackoff() {
  if (!FAST_LOCAL_STATE_SYNC) {
    return;
  }
  kvRemoteBackoffUntil = Date.now() + KV_REMOTE_BACKOFF_MS;
}

async function nextBotReply({ contactId, contactName, inboundText, inboundMessage }) {
  if (!contactId) {
    throw new Error("contactId is required");
  }

  await hydrateState(contactId);
  cleanupExpiredSessions();
  const runtime = await getChatbotRuntimeConfig();
  const flowEngine = createFlowEngine(runtime.workflow);
  const session = getSession(contactId);
  const input = buildInput(inboundText, inboundMessage);
  if (!isPendingCheckoutAdvisorHold(session) && (isMenu(input.normalized) || isRestartCommand(input) || isGreeting(input.normalized))) {
    await resetContactState(contactId, { preserveProfile: true });
  }

  const profile = getProfile(contactId, contactName);
  const beforeSnapshot = buildSessionSnapshot(session);
  applyStoredPromptChoice(session, input);
  let result;

  if (isPendingCheckoutAdvisorHold(session)) {
    result = session.data?.manualAdvisorIntervened
      ? { actions: [] }
      : {
          actions: [
            {
              type: "text",
              text: "Te pedimos paciencia, por favor, en breve un asesor se va a comunicar por este medio para terminar la compra."
            }
          ]
        };
  } else if (input.buttonId === "inactivity_continue_no") {
    resetSession(session);
    result = {
      actions: [{ type: "text", text: "Muchas gracias por contactarnos. Cuando lo necesites, escribinos de nuevo." }],
      meta: { closed: true }
    };
  } else if (input.buttonId === "inactivity_continue_yes") {
    session.fallback = 0;
      result = {
        actions: [
          { type: "text", text: "Perfecto, seguimos donde habíamos quedado." },
          ...repeatCurrentPrompt(session, profile, runtime)
        ]
      };
  } else if (isCancel(input.normalized)) {
    resetSession(session);
    result = { actions: [{ type: "text", text: "Pedido cancelado." }, ...resumeMenuActions(runtime)] };
  } else if (isMenu(input.normalized)) {
    resetSession(session);
    profile.welcomed = true;
    result = startFlow(session, profile, runtime, flowEngine);
  } else if (isRestartCommand(input)) {
    resetSession(session);
    profile.welcomed = false;
    result = startFlow(session, profile, runtime, flowEngine);
  } else if (isHomeCommand(input)) {
    result = handleHomeCommand(session, runtime, flowEngine);
  } else if (isBackCommand(input)) {
    result = handleBackCommand(session, runtime, flowEngine);
  } else if (isHuman(input.normalized)) {
    session.state = S.AGENT;
    session.step = null;
    session.fallback = 0;
    result = { actions: [{ type: "text", text: "Te derivamos con un asesor. Si querés volver al bot, escribí MENU." }] };
  } else if (session.state === S.AGENT) {
    result = session.data?.manualAdvisorIntervened
      ? { actions: [] }
      : shouldSendAgentWaitingNotice(session)
        ? { actions: [{ type: "text", text: buildAgentWaitingNoticeText(session) }] }
        : { actions: [] };
  } else if (session.state === S.IDLE) {
    result = await continueFromIdleInput(session, profile, input, runtime, flowEngine);
  } else {
    result = await handleOrder(session, profile, input, runtime, flowEngine);
  }

  const afterSnapshot = buildSessionSnapshot(session);
  const sanitizedActions = sanitizeActions(Array.isArray(result?.actions) ? result.actions : []);
  rememberPromptChoices(session, sanitizedActions, { clear: afterSnapshot.state !== S.ORDER || !afterSnapshot.step });
  const baseMeta = {
    before: beforeSnapshot,
    after: afterSnapshot,
    transition: session.lastTransition || null,
    closed: beforeSnapshot.state !== S.IDLE && afterSnapshot.state === S.IDLE,
    handedToHuman: Boolean(result?.meta?.handedToHuman || afterSnapshot.state === S.AGENT || session.data?.waitingAdvisor),
    sessionData: snapshotSessionData(session.data)
  };
  session.lastTransition = null;

  touchSession(contactId, session);
  await persistState(contactId, session, profile);

  return {
    actions: sanitizedActions,
    meta: {
      ...baseMeta,
      ...(result?.meta || {})
    }
  };
}

function startFlow(session, profile, runtime, flowEngine) {
  session.data = {};
  session.state = S.ORDER;
  move(session, resolveStep(flowEngine, STEP.MENU, STEP.MENU));
  return { actions: mainMenu(profile, runtime) };
}

async function continueFromIdleInput(session, profile, input, runtime, flowEngine) {
  if (!input.normalized || isGreeting(input.normalized)) {
    return startFlow(session, profile, runtime, flowEngine);
  }

  if (recoverFromInput(session, input) || parseModeChoice(input)) {
    session.state = S.ORDER;
    if (!session.step) {
      move(session, STEP.MENU);
    }
    return handleOrder(session, profile, input, runtime, flowEngine);
  }

  return startFlow(session, profile, runtime, flowEngine);
}

async function handleOrder(session, profile, input, runtime, flowEngine) {
  if (isProductWizardInput(input)) {
    move(session, STEP.ITEM_INPUT);
  }

  const handlers = buildOrderHandlers(session, profile, input, runtime, flowEngine);
  const currentStep = resolveStep(flowEngine, session.step || STEP.MENU, STEP.MENU);
  if (session.step !== currentStep) {
    move(session, currentStep);
  }

  const result = await flowEngine.executeNode({
    nodeId: currentStep,
    handlers,
    context: { session, profile, input, runtime }
  });

  return { actions: result.actions || [] };
}

function buildOrderHandlers(session, profile, input, runtime, flowEngine) {
  return {
    [STEP.MENU]: () => executeOrderStep(STEP.MENU, session, profile, input, runtime, flowEngine),
    [STEP.SERVICE_TYPE]: () => executeOrderStep(STEP.SERVICE_TYPE, session, profile, input, runtime, flowEngine),
    [STEP.PARTICULAR_SEARCH_MODE]: () =>
      executeOrderStep(STEP.PARTICULAR_SEARCH_MODE, session, profile, input, runtime, flowEngine),
    [STEP.RECETA_UPLOAD]: () => executeOrderStep(STEP.RECETA_UPLOAD, session, profile, input, runtime, flowEngine),
    [STEP.PARTICULAR_INPUT]: () => executeOrderStep(STEP.PARTICULAR_INPUT, session, profile, input, runtime, flowEngine),
    [STEP.CART_INPUT]: () => executeOrderStep(STEP.CART_INPUT, session, profile, input, runtime, flowEngine),
    [STEP.ITEM_INPUT]: () => executeOrderStep(STEP.ITEM_INPUT, session, profile, input, runtime, flowEngine),
    [STEP.RECETARIO]: () => executeOrderStep(STEP.RECETARIO, session, profile, input, runtime, flowEngine),
    [STEP.SUMMARY]: () => executeOrderStep(STEP.SUMMARY, session, profile, input, runtime, flowEngine),
    [STEP.DELIVERY_SAVED]: () => executeOrderStep(STEP.DELIVERY_SAVED, session, profile, input, runtime, flowEngine),
    [STEP.DELIVERY_DETAILS]: () => executeOrderStep(STEP.DELIVERY_DETAILS, session, profile, input, runtime, flowEngine),
    [STEP.DELIVERY_FIRST_NAME]: () => executeOrderStep(STEP.DELIVERY_FIRST_NAME, session, profile, input, runtime, flowEngine),
    [STEP.DELIVERY_LAST_NAME]: () => executeOrderStep(STEP.DELIVERY_LAST_NAME, session, profile, input, runtime, flowEngine),
    [STEP.DELIVERY_EMAIL]: () => executeOrderStep(STEP.DELIVERY_EMAIL, session, profile, input, runtime, flowEngine),
    [STEP.DELIVERY_ADDRESS]: () => executeOrderStep(STEP.DELIVERY_ADDRESS, session, profile, input, runtime, flowEngine),
    [STEP.DELIVERY_CROSS_STREETS]: () => executeOrderStep(STEP.DELIVERY_CROSS_STREETS, session, profile, input, runtime, flowEngine),
    [STEP.DELIVERY_NEIGHBORHOOD]: () => executeOrderStep(STEP.DELIVERY_NEIGHBORHOOD, session, profile, input, runtime, flowEngine),
    __default: () => ({ actions: resumeMenuActions(runtime) })
  };
}

async function executeOrderStep(step, session, profile, input, runtime, flowEngine) {
  switch (step) {
    case STEP.MENU: {
      if (!input.normalized || isGreeting(input.normalized)) {
        return { actions: mainMenu(profile, runtime) };
      }

      const mode = parseModeChoice(input);
      if (!mode) {
        return fallback(
          session,
          "Elegí Delivery o Mostrador.",
          nodeText(runtime, "menu", "¿Cómo querés continuar?"),
          menuButtons(runtime)
        );
      }

      initializeOrder(session, mode);
      if (mode === "MOSTRADOR") {
        session.data.orderType = "MOSTRADOR";
        move(session, resolveStep(flowEngine, STEP.RECETA_UPLOAD, STEP.RECETA_UPLOAD));
        session.lastTransition = {
          from: STEP.MENU,
          routeKey: "menu_counter_direct",
          to: String(session.step || STEP.RECETA_UPLOAD)
        };
        return { actions: buildRecipeUploadActions(session, runtime) };
      }

      moveByRoute(session, flowEngine, STEP.MENU, "menu_delivery", STEP.SERVICE_TYPE);
      return { actions: buildServiceTypeActions(mode, runtime) };
    }

    case STEP.SERVICE_TYPE: {
      const choice = parseServiceTypeChoice(input);
      if (!choice) {
        return fallback(
          session,
          "Elegí Particular, Programa de sobrepeso y diabetes u Obra social.",
          nodeText(runtime, "service_type", "Elegí una opción."),
          serviceTypeInteractive(runtime)
        );
      }

      session.data.orderType = choice.label;
      clearSelectionData(session);

      if (choice.kind === "obra_social") {
        moveByRoute(session, flowEngine, STEP.SERVICE_TYPE, "service_obra_social", STEP.RECETA_UPLOAD);
        return { actions: buildRecipeUploadActions(session, runtime) };
      }

      if (choice.kind === "particular") {
        session.lastTransition = {
          from: STEP.SERVICE_TYPE,
          routeKey: "service_particular",
          to: S.AGENT
        };
        clearRecentProductHistoryOffer(session);
        return handoffToAdvisor(session, {
          reason: "particular_advisor_handoff",
          routeKey: "service_particular",
          text: "Particular.\nEn breve un asesor se va a comunicar por este medio para ayudarte con tu pedido."
        });
      }

      resetProductWizard(session);
      moveByRoute(session, flowEngine, STEP.SERVICE_TYPE, "service_treatment", STEP.ITEM_INPUT);
      return {
        actions: buildProductWizardStartActions(
          runtime,
          "Elegí el laboratorio."
        )
      };
    }

    case STEP.PARTICULAR_SEARCH_MODE: {
      if (hasRecentProductHistoryOffer(session)) {
        const recentChoice = parseRecentProductHistoryChoice(input, profile);
        if (!recentChoice) {
          return fallback(
            session,
            "Elegí una opción con la letra.",
            buildRecentProductHistoryPrompt(profile),
            buildRecentProductHistoryActions(profile)
          );
        }

        clearRecentProductHistoryOffer(session);

        if (recentChoice.kind === "pick") {
          return lookupProductAndContinue({
            session,
            flowEngine,
            sourceStep: STEP.PARTICULAR_INPUT,
            productQuery: recentChoice.item.productTitle,
            productId: recentChoice.item.productId,
            selectedProduct: {
              title: recentChoice.item.productTitle,
              productId: recentChoice.item.productId,
              code: recentChoice.item.productCode,
              drugTitle: recentChoice.item.drugTitle,
              drugCode: recentChoice.item.drugCode,
              publicPrice: recentChoice.item.publicPrice,
              source: recentChoice.item.source
            }
          });
        }

        return {
          actions: buildParticularSearchModeActions()
        };
      }

      const searchMode = parseParticularSearchModeChoice(input);
      if (!searchMode) {
        return fallback(
          session,
          "Elegí si querés buscar por droga o por nombre.",
          buildParticularSearchModePrompt(),
          buildParticularSearchModeActions()
        );
      }

      setProductSearchMode(session, searchMode);
      move(session, STEP.PARTICULAR_INPUT);
      return {
        actions: buildFreeTextProductActions(STEP.PARTICULAR_INPUT, session, runtime)
      };
    }

    case STEP.RECETA_UPLOAD:
      if (!input.hasMedia) {
        const recipePrompt = "Para seguir necesito la receta en foto o PDF. Enviámela por acá.";
        return fallback(
          session,
          recipePrompt,
          nodeText(runtime, "receta_upload", "Enviá tu receta."),
          buildRecipeUploadNavigation(recipePrompt),
          { interactiveOnly: true }
        );
      }

      session.data.recipes = Number(session.data.recipes || 0) + 1;
      session.state = S.AGENT;
      session.step = null;
      session.fallback = 0;
      return {
        actions: [
          {
            type: "text",
            text:
              session.data.mode === "MOSTRADOR"
                ? "Recibimos tu receta. En breve te atenderá mostrador."
                : "Muchas gracias. En breve un asesor continuará con tu pedido."
          }
        ]
      };

    case STEP.PARTICULAR_INPUT:
    case STEP.CART_INPUT:
      return handleFreeTextProductStep(step, session, input, runtime, flowEngine);

    case STEP.ITEM_INPUT:
      return handleProductWizardStep(session, input, runtime, flowEngine);

    case STEP.RECETARIO: {
      const finalRecetario = parseRecetarioChoice(input);
      if (!finalRecetario) {
        return fallback(
          session,
          "Elegí una opción.",
          buildRecetarioPromptText(),
          buildRecetarioActions()
        );
      }

      session.data.recetarioAdhered = finalRecetario === "yes";
      return proceedToCheckout({ session, profile });

      const recetario = parseRecetarioChoice(input);
      if (!recetario) {
        return fallback(
          session,
          "Respondé Sí o No.",
          buildRecetarioPromptText(session.data.lookup || {}),
          buildRecetarioActions(session.data.lookup || {})
        );
      }

      session.data.recetarioAdhered = recetario === "yes";
      const productId = String(session.data.lookup?.productId || "");
      session.data.referencePricing = productId ? getReferencePricing(productId, session.data.recetarioAdhered) : null;
      prepareCurrentItemDraft(session, { originStep: STEP.RECETARIO });
      move(session, STEP.SUMMARY);
      return { actions: buildSummaryActions(session.data) };

      session.data.currentSummary = buildSummaryPayload(session.data);
      moveByRoute(session, flowEngine, STEP.RECETARIO, "recetario_done", STEP.SUMMARY);
      return { actions: buildSummaryActions(session.data) };
    }

    case STEP.SUMMARY: {
      const finalDecision = parseSummaryChoice(input);
      const canAddMoreFromSummary = allowsSummaryAddMore(session.data);
      const invalidAddMoreSelection = finalDecision === "add_more" && !canAddMoreFromSummary;

      if (finalDecision === "add_more" && canAddMoreFromSummary) {
        commitCurrentItemDraft(session);
        clearLookupData(session);
        move(session, STEP.CART_INPUT);
        return {
          actions: [buildCartInputNavigation("Perfecto. Escribime el otro producto que quer�s sumar.")]
        };
      }

      if (finalDecision === "finish") {
        commitCurrentItemDraft(session);
        move(session, STEP.RECETARIO);
        return { actions: buildRecetarioActions() };
      }

      if (!finalDecision || invalidAddMoreSelection) {
        return fallback(
          session,
          canAddMoreFromSummary
            ? "Elegí si querés agregar algo más o terminar la compra."
            : "Elegí si querés terminar la compra o volver al menú anterior.",
          buildOperationalSummaryText(session.data),
          buildSummaryActions(session.data)
        );
      }

      if (finalDecision === "human") {
        session.state = S.AGENT;
        session.step = null;
        session.fallback = 0;
        return { actions: [{ type: "text", text: "Perfecto. Te derivamos con un asesor para continuar." }] };
      }

      if (finalDecision === "menu") {
        resetSession(session);
        return { actions: resumeMenuActions(runtime) };
      }

      const decision = parseSummaryChoice(input);
      if (decision === "add_more") {
        commitCurrentItemDraft(session);
        clearLookupData(session);
        move(session, STEP.CART_INPUT);
        return {
          actions: [buildCartInputNavigation("Perfecto. Escribime el otro producto que querés sumar.")]
        };
      }

      if (decision === "finish") {
        commitCurrentItemDraft(session);
        return proceedToCheckout({ session, profile });
      }

      const noStock = session.data.lookup?.available === false;
      if (!decision) {
        return fallback(
          session,
          noStock ? "Elegí una opción para seguir." : "Elegí una opción para seguir.",
          buildOperationalSummaryText(session.data),
          buildSummaryActions(session.data)
        );
      }

      if (decision === "human") {
        session.state = S.AGENT;
        session.step = null;
        session.fallback = 0;
        return { actions: [{ type: "text", text: "Perfecto. Te derivamos con un asesor para continuar." }] };
      }

      if (decision === "menu") {
        resetSession(session);
        return { actions: resumeMenuActions(runtime) };
      }

      if (noStock) {
        return fallback(
          session,
          "Ese producto no tiene stock confirmado. Elegí una opción para seguir.",
          buildOperationalSummaryText(session.data),
          buildSummaryActions(session.data)
        );
      }

      storeConfirmedItem(session);
      saveLastOrder(profile, session.data);
      session.state = S.AGENT;
      session.step = null;
      session.fallback = 0;
      return {
        actions: [
          {
            type: "text",
            text: buildFinalConfirmationText(session.data)
          }
        ]
      };
    }

    case STEP.DELIVERY_SAVED: {
      const choice = parseSavedDeliveryChoice(input);
      if (!choice) {
        return fallback(
          session,
          "Elegí si querés usar esa dirección o cargar otra.",
          buildSavedDeliveryPrompt(profile),
          buildSavedDeliveryActions(profile)
        );
      }

      if (choice === "use_saved") {
        applySavedDeliveryToSession(session, profile);
        return finalizeCheckout(session, profile);
      }

      startDeliveryDraft(session, profile?.delivery || null);
      move(session, STEP.DELIVERY_ADDRESS);
      return {
        actions: buildDeliveryDetailsActions(STEP.DELIVERY_ADDRESS)
      };
    }

    case STEP.DELIVERY_DETAILS:
    case STEP.DELIVERY_FIRST_NAME:
    case STEP.DELIVERY_LAST_NAME:
    case STEP.DELIVERY_EMAIL:
    case STEP.DELIVERY_ADDRESS:
    case STEP.DELIVERY_CROSS_STREETS:
    case STEP.DELIVERY_NEIGHBORHOOD:
      return handleDeliveryDetailsStep(session, profile, input);

    default:
      move(session, resolveStep(flowEngine, STEP.MENU, STEP.MENU));
      return { actions: resumeMenuActions(runtime) };
  }
}

function mainMenu(profile, runtime, withIntro = false) {
  const actions = [];
  const greeting = `Hola${profile.firstName ? ` ${profile.firstName}` : ""}, somos ${config.businessDisplayName}.`;

  if (withIntro) {
    actions.push(menuButtons(runtime));
  } else if (!profile.welcomed) {
    actions.push({ type: "text", text: greeting });
    profile.welcomed = true;
  }

  actions.push(menuButtons(runtime));
  return actions;
}

function resumeMenuActions(runtime) {
  return [menuButtons(runtime)];
}

function menuButtons(runtime) {
  return buildChoiceAction(nodeText(runtime, "menu", "¿Cómo querés continuar?"), [
    { id: "mode_delivery", title: "Delivery" },
    { id: "mode_counter", title: "Mostrador" }
  ]);
}

function buildServiceTypeActions(mode, runtime) {
  const prompt = mode === "DELIVERY" ? nodeText(runtime, "service_type", "Elegí una opción.") : nodeText(runtime, "service_type", "Elegí una opción.");
  return buildPromptActions(prompt, serviceTypeOptions(), [buildBackButton()]);
}

function serviceTypeOptions() {
  return [
    { id: "service_particular", title: "Particular" },
    { id: "service_treatment", title: "Programa de sobrepeso y diabetes" },
    { id: "service_obra_social", title: "Obra Social" }
  ];
}

function serviceTypeInteractive(runtime) {
  return buildInteractiveGroups(nodeText(runtime, "service_type", "Elegí una opción."), serviceTypeOptions(), [buildBackButton()]);
}

function buildParticularSearchModePrompt() {
  return "¿Cómo querés buscar?";
}

function buildParticularSearchModeActions() {
  return [
    buildChoiceAction(buildParticularSearchModePrompt(), [
      { id: "particular_search_drug", title: "Buscar por droga" },
      { id: "particular_search_name", title: "Buscar por nombre" },
      buildBackButton()
    ])
  ];
}

function parseParticularSearchModeChoice(input) {
  if (input.buttonId === "particular_search_drug") {
    return PRODUCT_SEARCH_MODE.DRUG;
  }
  if (input.buttonId === "particular_search_name") {
    return PRODUCT_SEARCH_MODE.NAME;
  }

  if (normalize(input.text) === "buscar por droga" || normalize(input.text) === "droga") {
    return PRODUCT_SEARCH_MODE.DRUG;
  }
  if (
    normalize(input.text) === "buscar por nombre"
    || normalize(input.text) === "nombre"
    || normalize(input.text) === "producto"
  ) {
    return PRODUCT_SEARCH_MODE.NAME;
  }

  return "";
}

function recetarioButtons() {
  return [
    { id: "recetario_yes", title: "Sí" },
    { id: "recetario_no", title: "No" },
    buildBackButton()
  ];
}

function emptyProductWizard() {
  return {
    stage: "lab",
    labId: "",
    brandId: "",
    productId: ""
  };
}

function ensureProductWizard(session) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  if (!session.data.productWizard || typeof session.data.productWizard !== "object") {
    session.data.productWizard = emptyProductWizard();
  }
  return session.data.productWizard;
}

function resetProductWizard(session) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  session.data.productWizard = emptyProductWizard();
}

function clearProductWizard(session) {
  if (session.data && typeof session.data === "object") {
    delete session.data.productWizard;
  }
}

function buildProductWizardStartActions(_runtime, introText) {
  return buildPromptActions(introText || buildProductLabHelpText(), productLabButtons(), [buildBackButton()]);
}

function getProductSearchMode(session) {
  return session?.data?.productSearchMode === PRODUCT_SEARCH_MODE.DRUG
    ? PRODUCT_SEARCH_MODE.DRUG
    : PRODUCT_SEARCH_MODE.NAME;
}

function setProductSearchMode(session, mode) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }

  session.data.productSearchMode = mode === PRODUCT_SEARCH_MODE.DRUG ? PRODUCT_SEARCH_MODE.DRUG : PRODUCT_SEARCH_MODE.NAME;
}

function getRecentProductHistory(profile) {
  const detailedItems = Array.isArray(profile?.lastOrder?.itemsDetailed) ? profile.lastOrder.itemsDetailed : [];
  const fallbackItems = Array.isArray(profile?.lastOrder?.items) ? profile.lastOrder.items : [];
  const seen = new Set();
  const normalizedItems = [];

  for (const item of detailedItems) {
    const title = trim(item?.productTitle || item?.title || "", 120);
    if (!title) {
      continue;
    }

    const key = `${String(item?.productCode || "").trim()}::${normalize(title)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedItems.push({
      productTitle: title,
      productId: String(item?.productId || ""),
      productCode: String(item?.productCode || ""),
      drugTitle: String(item?.drugTitle || ""),
      drugCode: String(item?.drugCode || ""),
      publicPrice: Number.isFinite(Number(item?.publicPrice)) ? Number(item.publicPrice) : null,
      source: String(item?.source || "")
    });
  }

  if (normalizedItems.length > 0) {
    return normalizedItems.slice(0, 5);
  }

  for (const item of fallbackItems) {
    const title = trim(item || "", 120);
    if (!title) {
      continue;
    }

    const key = normalize(title);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedItems.push({
      productTitle: title,
      productId: "",
      productCode: "",
      drugTitle: "",
      drugCode: "",
      publicPrice: null,
      source: ""
    });
  }

  return normalizedItems.slice(0, 5);
}

function hasRecentProductHistory(profile) {
  return getRecentProductHistory(profile).length > 0;
}

function enableRecentProductHistoryOffer(session) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  session.data.showRecentProductHistory = true;
}

function clearRecentProductHistoryOffer(session) {
  if (session?.data && typeof session.data === "object") {
    delete session.data.showRecentProductHistory;
  }
}

function hasRecentProductHistoryOffer(session) {
  return Boolean(session?.data?.showRecentProductHistory);
}

function buildRecentProductHistoryPrompt(profile) {
  const addressLine = trim(profile?.delivery?.addressLine || "", 120);
  const addressSuffix = addressLine ? `Tambien tengo guardada tu direccion en ${addressLine}.` : "";
  return [
    "Tengo guardados productos de tu ultimo pedido.",
    "Si queres, elegi uno para pedirlo de nuevo o busca otro distinto.",
    addressSuffix
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildRecentProductHistoryDescription(item) {
  if (Number.isFinite(Number(item?.publicPrice))) {
    return trim(`Ultimo precio: ${formatCurrency(Number(item.publicPrice))}`, 72);
  }
  return "Recompra rapida";
}

function buildRecentProductHistoryActions(profile) {
  const items = getRecentProductHistory(profile);
  const productRows = items.map((item, index) => ({
    id: `recent_product_pick_${index}`,
    title: trim(item.productTitle || "Producto", 24),
    description: buildRecentProductHistoryDescription(item)
  }));

  return [
    {
      type: "interactive",
      interactiveType: "list",
      text: buildRecentProductHistoryPrompt(profile),
      buttonText: "Ver opciones",
      sections: [
        { title: "Ultimos productos", rows: productRows },
        {
          title: "Acciones",
          rows: [
            {
              id: "recent_product_search_new",
              title: "Buscar otro producto",
              description: "Por droga o por nombre"
            },
            buildBackButton(),
            buildHomeButton()
          ]
        }
      ]
    }
  ];
}

function parseRecentProductHistoryChoice(input, profile) {
  if (input.buttonId === "recent_product_search_new" || normalize(input.text) === "buscar otro producto") {
    return { kind: "search_new" };
  }

  if (String(input.buttonId || "").startsWith("recent_product_pick_")) {
    const optionIndex = Number(String(input.buttonId).replace("recent_product_pick_", ""));
    const items = getRecentProductHistory(profile);
    const item = Number.isInteger(optionIndex) ? items[optionIndex] : null;
    return item ? { kind: "pick", item } : null;
  }

  return null;
}

function buildFreeTextProductPrompt(step, searchMode, runtime) {
  if (step === STEP.CART_INPUT) {
    return searchMode === PRODUCT_SEARCH_MODE.DRUG
      ? "Escribime la droga del otro producto que quer�s sumar."
      : "Escribime el otro producto que quer�s sumar.";
  }

  if (searchMode === PRODUCT_SEARCH_MODE.DRUG) {
    return "Escribime la droga que quer�s buscar. Por ejemplo: tirzepatida o ibuprofeno.";
  }

  return "Escribime el nombre del producto que quer�s buscar.";
}

function buildFreeTextRewritePrompt(step, searchMode) {
  if (step === STEP.CART_INPUT) {
    return searchMode === PRODUCT_SEARCH_MODE.DRUG
      ? "Perfecto. Escribime la droga del otro producto que quer�s sumar."
      : "Perfecto. Escribime el otro producto que quer�s sumar.";
  }

  return searchMode === PRODUCT_SEARCH_MODE.DRUG
    ? "Perfecto. Escribime la droga otra vez."
    : "Perfecto. Escribime el nombre del producto otra vez.";
}

function buildFreeTextProductActions(step, session, runtime, promptText = "") {
  const searchMode = getProductSearchMode(session);
  return [buildProductTextNavigation(step, promptText || buildFreeTextProductPrompt(step, searchMode, runtime))];
}

async function handleFreeTextProductStep(step, session, input, runtime, flowEngine) {
  setActiveProductInputStep(session, step);
  const searchMode = getProductSearchMode(session);
  const basePrompt = buildFreeTextProductPrompt(step, searchMode, runtime);
  const rewritePrompt = buildFreeTextRewritePrompt(step, searchMode);
  const suggestionRewritePrompt =
    step === STEP.CART_INPUT
      ? "Perfecto. Escribime de nuevo el producto que quer�s sumar."
      : "Perfecto. Escribime el nombre del producto otra vez.";

  if (input.buttonId === "particular_option_rewrite") {
    clearPendingParticularOptions(session);
    return {
      actions: [buildProductTextNavigation(step, rewritePrompt)]
    };
  }

  if (input.buttonId === "particular_option_human") {
    clearPendingParticularOptions(session);
    session.state = S.AGENT;
    session.step = null;
    session.fallback = 0;
    return {
      actions: [{ type: "text", text: "Perfecto. Te derivamos con un asesor para revisar ese producto." }]
    };
  }

  if (hasPendingParticularOptions(session)) {
    const pendingSelection = resolvePendingParticularOptionSelection(session, input);
    if (pendingSelection?.kind === "pick") {
      clearPendingParticularOptions(session);
      return lookupProductAndContinue({
        session,
        flowEngine,
        sourceStep: step,
        productQuery: pendingSelection.option.title,
        productId: pendingSelection.option.productId,
        selectedProduct: pendingSelection.option
      });
    }
    if (pendingSelection?.kind === "more" || pendingSelection?.kind === "prev") {
      session.data.pendingParticularOptions.page = pendingSelection.page;
      return {
        actions: buildParticularOptionsActions(session)
      };
    }
    if (pendingSelection?.kind === "rewrite") {
      clearPendingParticularOptions(session);
      return {
        actions: [buildProductTextNavigation(step, rewritePrompt)]
      };
    }
    if (pendingSelection?.kind === "human") {
      clearPendingParticularOptions(session);
      session.state = S.AGENT;
      session.step = null;
      session.fallback = 0;
      return {
        actions: [{ type: "text", text: "Perfecto. Te derivamos con un asesor para revisar ese producto." }]
      };
    }

    if (!input.buttonId && input.text && input.text.length >= 3) {
      clearPendingParticularOptions(session);
    } else {
      return fallback(
        session,
        `Eleg� una opci�n de la lista o escribime ${searchMode === PRODUCT_SEARCH_MODE.DRUG ? "la droga" : "el producto"} otra vez.`,
        buildParticularOptionsPrompt(session),
        buildParticularOptionsActions(session)
      );
    }
  }

  if (searchMode !== PRODUCT_SEARCH_MODE.DRUG && hasPendingParticularSuggestion(session)) {
    const pendingDecision = parseParticularSuggestionChoice(input);
    if (pendingDecision === "confirm") {
      return continuePendingParticularSuggestion({ session, flowEngine, sourceStep: step });
    }
    if (pendingDecision === "rewrite") {
      clearPendingParticularSuggestion(session);
      return {
        actions: [buildProductTextNavigation(step, suggestionRewritePrompt)]
      };
    }
    if (!input.buttonId && input.text && input.text.length >= 3) {
      clearPendingParticularSuggestion(session);
    } else {
      return fallback(
        session,
        "Respondeme s�, no o volv� a escribir.",
        buildParticularSuggestionPrompt(session),
        buildParticularSuggestionActions(session)
      );
    }
  }

  if (input.hasMedia) {
    return fallback(
      session,
      `Decinos por escrito ${searchMode === PRODUCT_SEARCH_MODE.DRUG ? "qu� droga" : "qu� producto"} necesit�s.`,
      basePrompt,
      buildProductTextNavigation(step, basePrompt)
    );
  }

  if (!input.text || input.text.length < 3) {
    return fallback(
      session,
      `Decime ${searchMode === PRODUCT_SEARCH_MODE.DRUG ? "qu� droga" : "qu� producto"} necesit�s.`,
      basePrompt,
      buildProductTextNavigation(step, basePrompt)
    );
  }

  const options = await searchProductOptions({ query: input.text, mode: searchMode });
  if (options.length > 0) {
    storePendingParticularOptions(session, {
      query: input.text,
      mode: searchMode,
      options
    });
    return {
      actions: buildParticularOptionsActions(session)
    };
  }

  if (searchMode === PRODUCT_SEARCH_MODE.DRUG) {
    return {
      actions: [buildParticularNoResultsAction(input.text, searchMode)]
    };
  }

  const directProduct = findProductByText(input.text);
  const suggestedProduct = directProduct ? null : suggestProductByText(input.text);

  if (suggestedProduct) {
    storePendingParticularSuggestion(session, {
      productId: suggestedProduct.id,
      title: suggestedProduct.title,
      productQuery: suggestedProduct.title
    });
    return {
      actions: buildParticularSuggestionActions(session)
    };
  }

  return {
    actions: [buildParticularNoResultsAction(input.text, searchMode)]
  };
}
async function handleProductWizardStep(session, input, runtime, flowEngine) {
  if (input.hasMedia) {
    return fallback(
      session,
      "Por ahora elegi el producto con los botones para seguir el documento oficial.",
      buildCurrentWizardPrompt(session, runtime).find(action => action.type === "text")?.text,
      buildCurrentWizardInteractive(session)
    );
  }

  const wizard = ensureProductWizard(session);
  const directProduct = /\d/.test(String(input.text || "")) ? findProductByText(input.text, wizard.brandId || "") : null;
  if (directProduct) {
    wizard.labId = directProduct.labId;
    wizard.brandId = directProduct.brandId;
    wizard.productId = directProduct.id;
    wizard.stage = "variant";
    return lookupProductAndContinue({
      session,
      flowEngine,
      sourceStep: STEP.ITEM_INPUT,
      productId: directProduct.id,
      productQuery: directProduct.title
    });
  }

  switch (wizard.stage) {
    case "lab": {
      const labId = parseProductLabChoice(input);
      if (!labId) {
        return fallback(session, "Elegí un laboratorio de la lista.", buildProductLabHelpText(), buildCurrentWizardInteractive(session));
      }

      wizard.labId = labId;
      wizard.brandId = "";
      wizard.productId = "";
      wizard.stage = "brand";
      return { actions: buildProductBrandActions(labId) };
    }

    case "brand": {
      if (input.buttonId === "item_brand_change_lab") {
        resetProductWizard(session);
        return { actions: buildProductWizardStartActions(runtime, "Perfecto. Volvamos a elegir el laboratorio.") };
      }

      const brandId = parseProductBrandChoice(input, wizard.labId);
      if (!brandId) {
        return fallback(
          session,
          "Elegí una marca de la lista.",
          buildProductBrandHelpText(wizard.labId),
          buildCurrentWizardInteractive(session)
        );
      }

      wizard.brandId = brandId;
      wizard.productId = "";
      wizard.stage = "variant";
      return { actions: buildProductVariantActions(brandId) };
    }

    case "variant": {
      if (input.buttonId === "item_variant_change_brand") {
        wizard.stage = "brand";
        wizard.productId = "";
        return { actions: buildProductBrandActions(wizard.labId) };
      }

      if (input.buttonId.startsWith("item_variant_more_")) {
        return { actions: buildProductVariantActions(wizard.brandId) };
      }

      if (input.buttonId === "item_variant_restart") {
        return { actions: buildProductVariantActions(wizard.brandId) };
      }

      const productId = parseProductVariantChoice(input, wizard.brandId);
      if (!productId) {
        return fallback(
          session,
          "Elegí una presentación de la lista.",
          buildProductVariantHelpText(wizard.brandId),
          buildCurrentWizardInteractive(session)
        );
      }

      wizard.productId = productId;
      return lookupProductAndContinue({
        session,
        flowEngine,
        sourceStep: STEP.ITEM_INPUT,
        productId,
        productQuery: getProductById(productId)?.title || ""
      });
    }

    default:
      resetProductWizard(session);
      return { actions: buildProductWizardStartActions(runtime) };
  }
}

async function lookupProductAndContinue({ session, flowEngine, sourceStep, productQuery, productId = "", selectedProduct = null }) {
  const lookup = await lookupProductAvailability({ query: productQuery, productId, selectedProduct });
  if (sourceStep === STEP.PARTICULAR_INPUT && shouldConfirmLookupBySimilarity(productQuery, lookup)) {
    storePendingParticularSuggestion(session, {
      productId: lookup.productId,
      title: lookup.title,
      productQuery: lookup.title,
      lookup
    });
    return {
      actions: buildParticularSuggestionActions(session)
    };
  }

  return continueAfterLookup({ session, flowEngine, sourceStep, lookup, productQuery });
}

function continueAfterLookup({ session, flowEngine, sourceStep, lookup, productQuery }) {
  storeLookup(session, lookup, productQuery);
  session.data.lookupSourceStep = sourceStep;

  if (!lookup.found) {
    return {
      actions: [
        buildNavigationAction(
          "No pude confirmar ese producto en este momento. Tocá Volver al menú anterior para intentarlo de nuevo o escribinos para revisarlo con un asesor."
        )
      ]
    };
  }

  prepareCurrentItemDraft(session, { originStep: sourceStep, includeRecetario: false });
  moveByRoute(session, flowEngine, sourceStep, "lookup_ready", STEP.SUMMARY);
  return {
    actions: buildSummaryActions(session.data)
  };
}

function shouldConfirmLookupBySimilarity(productQuery, lookup) {
  const query = normalize(String(productQuery || ""));
  const title = normalize(String(lookup?.title || ""));
  if (!lookup?.found || !query || !title) {
    return false;
  }

  if (title === query || title.includes(query)) {
    const queryTokens = tokenizeQuery(query);
    if (queryTokens.length >= 2 || queryTokens.some(token => /\d/.test(token))) {
      return false;
    }
  }

  const compactQuery = compactQueryText(query);
  const compactTitle = compactQueryText(title);
  if (!compactQuery || !compactTitle) {
    return false;
  }

  const queryTokens = tokenizeQuery(query);
  const titleTokens = tokenizeQuery(title);
  const matchedTokens = queryTokens.filter(token => titleTokens.includes(token)).length;
  const similarity = similarityRatio(compactQuery, compactTitle);

  if (matchedTokens === queryTokens.length && queryTokens.length >= 2) {
    return false;
  }

  return similarity >= 0.52;
}

function storeLookup(session, lookup, productQuery) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }

  session.data.lastProductQuery = trim(productQuery || lookup?.title || "", 180);
  session.data.lookup = {
    found: Boolean(lookup?.found),
    productId: String(lookup?.productId || ""),
    productCode: String(lookup?.productCode || ""),
    title: String(lookup?.title || ""),
    labTitle: String(lookup?.labTitle || ""),
    brandTitle: String(lookup?.brandTitle || ""),
    drugTitle: String(lookup?.drugTitle || ""),
    drugCode: String(lookup?.drugCode || ""),
    available: typeof lookup?.available === "boolean" ? lookup.available : null,
    publicPrice: Number.isFinite(Number(lookup?.publicPrice)) ? Number(lookup.publicPrice) : null,
    source: String(lookup?.source || ""),
    note: String(lookup?.note || ""),
    alternatives: Array.isArray(lookup?.alternatives)
      ? lookup.alternatives.map(option => ({
        title: String(option?.title || ""),
        publicPrice: Number.isFinite(Number(option?.publicPrice)) ? Number(option.publicPrice) : null,
        productCode: String(option?.productCode || ""),
        drugTitle: String(option?.drugTitle || "")
      }))
      : []
  };
  session.data.referencePricing = null;
  session.data.recetarioAdhered = null;
}

function hasPendingParticularSuggestion(session) {
  return Boolean(session?.data?.pendingParticularSuggestion?.title);
}

function storePendingParticularSuggestion(session, suggestion) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  session.data.pendingParticularSuggestion = {
    productId: String(suggestion?.productId || ""),
    title: String(suggestion?.title || ""),
    productQuery: String(suggestion?.productQuery || suggestion?.title || ""),
    lookup: suggestion?.lookup || null
  };
}

function clearPendingParticularSuggestion(session) {
  if (session?.data && typeof session.data === "object") {
    delete session.data.pendingParticularSuggestion;
  }
}

function hasPendingParticularOptions(session) {
  return Array.isArray(session?.data?.pendingParticularOptions?.options) && session.data.pendingParticularOptions.options.length > 0;
}

function storePendingParticularOptions(session, payload) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }

  const options = Array.isArray(payload?.options)
    ? payload.options
        .filter(option => option && option.title)
        .map(option => ({
          code: String(option.code || ""),
          title: trim(option.title || "", 120),
          productId: String(option.productId || ""),
          labTitle: trim(option.labTitle || "", 60),
          brandTitle: trim(option.brandTitle || "", 60),
          drugTitle: trim(option.drugTitle || "", 60),
          publicPrice: Number.isFinite(Number(option.publicPrice)) ? Number(option.publicPrice) : null,
          source: String(option.source || "")
        }))
    : [];

  session.data.pendingParticularOptions = {
    query: trim(payload?.query || "", 120),
    mode: payload?.mode === PRODUCT_SEARCH_MODE.DRUG ? PRODUCT_SEARCH_MODE.DRUG : PRODUCT_SEARCH_MODE.NAME,
    page: 0,
    options
  };
}

function clearPendingParticularOptions(session) {
  if (session?.data && typeof session.data === "object") {
    delete session.data.pendingParticularOptions;
  }
}

function resolvePendingParticularOptionSelection(session, input) {
  const pending = session?.data?.pendingParticularOptions;
  if (!pending || !Array.isArray(pending.options)) {
    return null;
  }

  if (input.buttonId === "particular_option_more") {
    return {
      kind: "more",
      page: Math.min(getParticularOptionsTotalPages(session) - 1, Number(pending.page || 0) + 1)
    };
  }

  if (input.buttonId === "particular_option_prev") {
    return {
      kind: "prev",
      page: Math.max(0, Number(pending.page || 0) - 1)
    };
  }

  if (input.buttonId === "particular_option_rewrite") {
    return { kind: "rewrite" };
  }

  if (input.buttonId === "particular_option_human") {
    return { kind: "human" };
  }

  if (String(input.buttonId || "").startsWith("particular_option_pick_")) {
    const optionIndex = Number(String(input.buttonId).replace("particular_option_pick_", ""));
    const option = Number.isInteger(optionIndex) ? pending.options[optionIndex] : null;
    return option ? { kind: "pick", option } : null;
  }

  return null;
}

function continuePendingParticularSuggestion({ session, flowEngine, sourceStep }) {
  const pending = session?.data?.pendingParticularSuggestion || null;
  clearPendingParticularSuggestion(session);
  if (!pending) {
    return {
      actions: [buildParticularInputNavigation("Escribime de nuevo el producto que queres buscar.")]
    };
  }

  if (pending.lookup) {
    return continueAfterLookup({
      session,
      flowEngine,
      sourceStep,
      lookup: pending.lookup,
      productQuery: pending.productQuery
    });
  }

  return lookupProductAndContinue({
    session,
    flowEngine,
    sourceStep,
    productQuery: pending.productQuery,
    productId: pending.productId
  });
}

function setActiveProductInputStep(session, step) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  session.data.productInputStep = step === STEP.CART_INPUT ? STEP.CART_INPUT : STEP.PARTICULAR_INPUT;
}

function clearSelectionData(session) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  session.data.items = 0;
  session.data.itemsList = [];
  delete session.data.productSearchMode;
  clearLookupData(session);
}

function clearLookupData(session) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  delete session.data.lookup;
  delete session.data.referencePricing;
  delete session.data.currentSummary;
  delete session.data.lastProductQuery;
  delete session.data.recetarioAdhered;
  clearPendingParticularSuggestion(session);
  clearPendingParticularOptions(session);
  clearProductWizard(session);
}

function initializeOrder(session, mode) {
  session.state = S.ORDER;
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  session.data.mode = mode;
  session.data.orderType = "";
  session.data.recipes = 0;
  clearSelectionData(session);
}

function buildProductLabHelpText() {
  return "Elegí el laboratorio.";
}

function productLabButtons() {
  return getLabs().map(lab => ({
    id: `item_lab_${lab.id}`,
    title: lab.title
  }));
}

function buildProductBrandHelpText(labId) {
  const lab = getLabById(labId);
  return `Elegí la marca de ${lab?.title || "ese laboratorio"}.`;
}

function buildProductBrandActions(labId) {
  return buildPromptActions(buildProductBrandHelpText(labId), productBrandButtons(labId), [buildBackButton()]);
}

function productBrandButtons(labId) {
  return getBrandsByLab(labId).map(brand => ({
    id: `item_brand_${brand.id}`,
    title: toButtonTitle(brand.title)
  }));
}

function buildProductVariantHelpText(brandId) {
  const brand = getBrandById(brandId);
  return `${brand?.title || "Producto"}: elegí una presentación.`;
}

function buildProductVariantActions(brandId) {
  return buildPromptActions(buildProductVariantHelpText(brandId), productVariantButtons(brandId), [buildBackButton()]);
}

function productVariantButtons(brandId) {
  return getProductsByBrand(brandId).map(product => ({
    id: `item_variant_${product.id}`,
    title: toButtonTitle(product.shortTitle || product.title)
  }));
}

function buildLookupDetailsText(lookup) {
  const lines = [`Producto: ${lookup.title || "No informado"}`];

  if (lookup.labTitle || lookup.brandTitle) {
    lines.push(`Laboratorio / marca: ${[lookup.labTitle, lookup.brandTitle].filter(Boolean).join(" / ")}`);
  }

  lines.push(`Stock: ${formatStockStatus(lookup.available)}.`);

  if (lookup.publicPrice !== null) {
    lines.push(
      `${lookup.source === "api" ? "Precio" : "Precio de referencia"}: ${formatCurrency(lookup.publicPrice)}.`
    );
  } else {
    lines.push("Precio: pendiente.");
  }

  if (lookup.note) {
    lines.push(lookup.note);
  }

  const pricingLines = buildPricingLines(lookup, { includeRecetario: true });
  if (pricingLines.length > 0) {
    lines.push("Precios con descuentos en Delko 1:");
    lines.push(...pricingLines);
  }

  const coverageNote = getProductCoverageNote(String(lookup.productId || ""));
  if (coverageNote) {
    lines.push(`Nota: ${coverageNote}`);
  }

  return lines.join("\n");
}

function buildRecetarioPromptText(lookup) {
  return `${buildLookupDetailsText(lookup)}\n�Est�s adherido al Recetario Solidario?`;
}

function prepareCurrentItemDraft(session, options = {}) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }

  session.data.currentItemDraft = buildCurrentItemDraft(session.data, options);
  session.data.currentSummary = buildSummaryPayload(session.data);
}

function buildCurrentItemDraft(data, options = {}) {
  const lookup = data?.lookup || {};
  const recetarioValue = data?.recetarioAdhered;
  const includeRecetario = recetarioValue !== false;
  const pricingScenarios = getPricingScenarios(String(lookup.productId || ""), Number(lookup.publicPrice), { includeRecetario });
  return {
    productId: String(lookup.productId || ""),
    productTitle: String(lookup.title || ""),
    labTitle: String(lookup.labTitle || ""),
    brandTitle: String(lookup.brandTitle || ""),
    stockStatus: formatStockStatus(lookup.available),
    available: typeof lookup.available === "boolean" ? lookup.available : null,
    publicPrice: Number.isFinite(Number(lookup.publicPrice)) ? Number(lookup.publicPrice) : null,
    publicPriceLabel: lookup.source === "api" ? "Precio" : "Precio documental de referencia",
    recetario: typeof recetarioValue === "boolean" ? (recetarioValue ? "Sí" : "No") : "No informado",
    recetarioAdhered: typeof recetarioValue === "boolean" ? recetarioValue : null,
    pricingScenarios,
    pricingLines: pricingScenarios.map(formatPricingScenarioLine),
    coverageNote: getProductCoverageNote(String(lookup.productId || "")),
    source: String(lookup.source || ""),
    note: String(lookup.note || ""),
    originStep: String(options.originStep || data?.lookupSourceStep || "")
  };
}

function commitCurrentItemDraft(session) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }

  const draft = session.data.currentItemDraft;
  if (!draft || !draft.productTitle) {
    return;
  }

  const itemsList = Array.isArray(session.data.itemsList) ? session.data.itemsList : [];
  itemsList.push({ ...draft });
  session.data.itemsList = itemsList;
  session.data.items = itemsList.length;
  delete session.data.currentItemDraft;
  delete session.data.currentSummary;
}

function proceedToCheckout({ session, profile }) {
  if (session.data?.mode === "DELIVERY") {
    if (hasSavedDeliveryProfile(profile)) {
      move(session, STEP.DELIVERY_SAVED);
      return {
        actions: buildSavedDeliveryActions(profile)
      };
    }

    startDeliveryDraft(session, null);
    move(session, STEP.DELIVERY_DETAILS);
    return {
      actions: buildDeliveryDetailsActions(STEP.DELIVERY_DETAILS)
    };
  }

  return finalizeCheckout(session, profile);
}

function hasSavedDeliveryProfile(profile) {
  return Boolean(
    profile?.delivery &&
      typeof profile.delivery === "object" &&
      String(profile.delivery.addressLine || "").trim() &&
      String(profile.delivery.firstName || "").trim()
  );
}

function startDeliveryDraft(session, seed) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }

  session.data.deliveryDraft = {
    firstName: trim(seed?.firstName || "", 80),
    lastName: trim(seed?.lastName || "", 80),
    email: trim(seed?.email || "", 120),
    addressLine: trim(seed?.addressLine || "", 160),
    crossStreets: trim(seed?.crossStreets || "", 160),
    neighborhood: trim(seed?.neighborhood || "", 120)
  };
}

function applySavedDeliveryToSession(session, profile) {
  startDeliveryDraft(session, profile?.delivery || null);
}

function buildSavedDeliveryPrompt(profile) {
  const delivery = profile?.delivery || {};
  const addressParts = [
    trim(delivery.addressLine || "", 120),
    trim(delivery.crossStreets || "", 120) ? `Entre ${trim(delivery.crossStreets || "", 120)}` : "",
    trim(delivery.neighborhood || "", 120)
  ].filter(Boolean);

  return [
    "Tengo guardada esta dirección para delivery:",
    ...addressParts.map(part => `- ${part}`),
    "¿Querés volver a mandar ahí o preferís otra dirección?"
  ].join("\n");
}

function buildSavedDeliveryActions(profile) {
  return [
    buildChoiceAction(buildSavedDeliveryPrompt(profile), [
      { id: "delivery_saved_yes", title: "Usar esta dirección" },
      { id: "delivery_saved_new", title: "Otra dirección" },
      buildBackButton()
    ])
  ];
}

function parseSavedDeliveryChoice(input) {
  if (input.buttonId === "delivery_saved_yes" || input.normalized.includes("usar esta")) {
    return "use_saved";
  }
  if (input.buttonId === "delivery_saved_new" || input.normalized.includes("otra direccion") || input.normalized.includes("otra dirección")) {
    return "new_address";
  }
  return null;
}

function buildDeliveryFieldNavigation(step) {
  return buildNavigationAction(getDeliveryFieldPrompt(step));
}

function getDeliveryFieldPrompt(step) {
  switch (step) {
    case STEP.DELIVERY_FIRST_NAME:
      return "Pasame el nombre de quien recibe el pedido.";
    case STEP.DELIVERY_LAST_NAME:
      return "Ahora pasame el apellido.";
    case STEP.DELIVERY_EMAIL:
      return "Pasame un mail de contacto.";
    case STEP.DELIVERY_ADDRESS:
      return "Pasame la dirección de entrega.";
    case STEP.DELIVERY_CROSS_STREETS:
      return "Decime entre qué calles es.";
    case STEP.DELIVERY_NEIGHBORHOOD:
      return "Decime el barrio.";
    default:
      return "Pasame los datos para el delivery.";
  }
}

function handleDeliveryFieldStep(step, session, profile, input) {
  if (input.hasMedia || !input.text || !String(input.text || "").trim()) {
    return fallback(
      session,
      "Necesito ese dato por escrito para el delivery.",
      getDeliveryFieldPrompt(step),
      buildDeliveryFieldNavigation(step)
    );
  }

  const parsedValue = parseDeliveryFieldValue(step, input.text);
  if (!parsedValue.ok) {
    return fallback(
      session,
      parsedValue.message,
      getDeliveryFieldPrompt(step),
      buildDeliveryFieldNavigation(step)
    );
  }

  if (!session.data?.deliveryDraft) {
    startDeliveryDraft(session, null);
  }

  session.data.deliveryDraft[parsedValue.field] = parsedValue.value;
  const nextStep = getNextDeliveryStep(step);
  if (nextStep) {
    move(session, nextStep);
    return {
      actions: [buildDeliveryFieldNavigation(nextStep)]
    };
  }

  profile.delivery = {
    ...session.data.deliveryDraft,
    updatedAt: new Date().toISOString()
  };
  return finalizeCheckout(session, profile);
}

function parseDeliveryFieldValue(step, rawValue) {
  const value = trim(rawValue || "", 160);
  switch (step) {
    case STEP.DELIVERY_FIRST_NAME:
      return value.length >= 2
        ? { ok: true, field: "firstName", value }
        : { ok: false, message: "Pasame un nombre válido." };
    case STEP.DELIVERY_LAST_NAME:
      return value.length >= 2
        ? { ok: true, field: "lastName", value }
        : { ok: false, message: "Pasame un apellido válido." };
    case STEP.DELIVERY_EMAIL:
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? { ok: true, field: "email", value }
        : { ok: false, message: "Pasame un mail válido." };
    case STEP.DELIVERY_ADDRESS:
      return value.length >= 5
        ? { ok: true, field: "addressLine", value }
        : { ok: false, message: "Pasame una dirección más completa." };
    case STEP.DELIVERY_CROSS_STREETS:
      return value.length >= 4
        ? { ok: true, field: "crossStreets", value }
        : { ok: false, message: "Decime entre qué calles es." };
    case STEP.DELIVERY_NEIGHBORHOOD:
      return value.length >= 2
        ? { ok: true, field: "neighborhood", value }
        : { ok: false, message: "Pasame el barrio." };
    default:
      return { ok: false, message: "Necesito ese dato por escrito." };
  }
}

function getNextDeliveryStep(step) {
  switch (step) {
    case STEP.DELIVERY_FIRST_NAME:
      return STEP.DELIVERY_LAST_NAME;
    case STEP.DELIVERY_LAST_NAME:
      return STEP.DELIVERY_EMAIL;
    case STEP.DELIVERY_EMAIL:
      return STEP.DELIVERY_ADDRESS;
    case STEP.DELIVERY_ADDRESS:
      return STEP.DELIVERY_CROSS_STREETS;
    case STEP.DELIVERY_CROSS_STREETS:
      return STEP.DELIVERY_NEIGHBORHOOD;
    default:
      return null;
  }
}

function finalizeCheckout(session, profile) {
  const finalText = buildFinalCheckoutText(session.data);
  const finalSessionData = {
    ...snapshotSessionData(session.data),
    waitingAdvisor: true,
    advisorHandoffReason: "checkout_final_summary",
    manualAdvisorIntervened: false,
    finalized: false
  };

  if (session.data?.mode === "DELIVERY" && session.data?.deliveryDraft) {
    profile.delivery = {
      ...session.data.deliveryDraft,
      updatedAt: new Date().toISOString()
    };
  }

  saveLastOrder(profile, session.data);
  resetSession(session);
  session.data.waitingAdvisor = true;
  session.data.advisorHandoffReason = "checkout_final_summary";
  session.data.manualAdvisorIntervened = false;
  session.data.finalized = false;
  return {
    actions: [
      {
        type: "text",
        text: finalText
      }
    ],
    meta: {
      closed: true,
      handedToHuman: true,
      routeKey: "checkout_completed",
      sessionData: finalSessionData
    }
  };
}

function handoffToAdvisor(session, { reason = "manual_advisor", routeKey = "advisor_handoff", text = "" } = {}) {
  const finalSessionData = {
    ...snapshotSessionData(session.data),
    waitingAdvisor: true,
    advisorHandoffReason: String(reason || "manual_advisor"),
    manualAdvisorIntervened: false,
    finalized: false
  };

  session.state = S.AGENT;
  session.step = null;
  session.fallback = 0;
  session.data.waitingAdvisor = true;
  session.data.advisorHandoffReason = finalSessionData.advisorHandoffReason;
  session.data.manualAdvisorIntervened = false;
  session.data.finalized = false;

  return {
    actions: text
      ? [
          {
            type: "text",
            text
          }
        ]
      : [],
    meta: {
      handedToHuman: true,
      routeKey,
      sessionData: finalSessionData
    }
  };
}

function buildFinalCheckoutText(data) {
  const items = Array.isArray(data?.itemsList) ? data.itemsList : [];
  const totals = buildCartTotals(items);
  const lines = ["Resumen final:"];

  for (const item of items) {
    const itemLine = Number.isFinite(Number(item?.publicPrice))
      ? `${item.productTitle}: ${formatCurrency(item.publicPrice)}`
      : `${item.productTitle}: pendiente`;
    const stockSuffix = item?.stockStatus && item.stockStatus !== "disponible" ? ` (${item.stockStatus})` : "";
    lines.push(`- ${itemLine}${stockSuffix}`);
  }

  if (Number.isFinite(totals.listTotal)) {
    lines.push(`Total lista Delko 1: ${formatCurrency(totals.listTotal)}`);
  }

  if (totals.scenarioLines.length > 0) {
    lines.push("Totales con descuentos:");
    lines.push(...totals.scenarioLines);
  }

  lines.push(`Formas de pago: ${buildPaymentFormsText(items)}`);

  if (data?.mode === "DELIVERY" && data?.deliveryDraft) {
    lines.push("Delivery:");
    lines.push(`- ${[data.deliveryDraft.firstName, data.deliveryDraft.lastName].filter(Boolean).join(" ")}`);
    lines.push(`- ${data.deliveryDraft.addressLine}`);
    lines.push(`- Entre calles: ${data.deliveryDraft.crossStreets}`);
    lines.push(`- Barrio: ${data.deliveryDraft.neighborhood}`);
    lines.push(`- Mail: ${data.deliveryDraft.email}`);
  }

  lines.push("En breve un asesor se va a comunicar por este medio para terminar la compra.");
  return lines.join("\n");
}

function buildCartTotals(items) {
  const safeItems = Array.isArray(items) ? items : [];
  const scenarioMap = new Map();
  let listTotal = 0;

  for (const item of safeItems) {
    const publicPrice = Number(item?.publicPrice);
    if (Number.isFinite(publicPrice)) {
      listTotal += publicPrice;
    }

    for (const scenario of Array.isArray(item?.pricingScenarios) ? item.pricingScenarios : []) {
      const entry = scenarioMap.get(scenario.id) || {
        id: scenario.id,
        label: scenario.label,
        minTotal: 0,
        maxTotal: 0,
        range: false
      };

      if (Number.isFinite(Number(scenario.finalPrice))) {
        entry.minTotal += Number(scenario.finalPrice);
        entry.maxTotal += Number(scenario.finalPrice);
      } else if (Number.isFinite(Number(scenario.minPrice)) && Number.isFinite(Number(scenario.maxPrice))) {
        entry.minTotal += Number(scenario.minPrice);
        entry.maxTotal += Number(scenario.maxPrice);
        entry.range = true;
      }

      scenarioMap.set(scenario.id, entry);
    }
  }

  const scenarioLines = Array.from(scenarioMap.values())
    .sort((left, right) => left.label.localeCompare(right.label, "es"))
    .map(formatCartScenarioLine);

  return { listTotal, scenarioLines };
}

function formatCartScenarioLine(scenario) {
  if (scenario.range) {
    return `- ${scenario.label}: entre ${formatCurrency(scenario.minTotal)} y ${formatCurrency(scenario.maxTotal)}`;
  }
  return `- ${scenario.label}: ${formatCurrency(scenario.maxTotal)}`;
}

function buildPaymentFormsText(items) {
  const labels = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    for (const scenario of Array.isArray(item?.pricingScenarios) ? item.pricingScenarios : []) {
      const label = normalize(String(scenario?.label || ""));
      if (label.includes("ef/transf")) {
        labels.add("efectivo / transferencia");
      }
      if (label.includes("debito")) {
        labels.add("débito");
      }
      if (label.includes("credito")) {
        labels.add("crédito");
      }
    }
  }

  return labels.size > 0 ? Array.from(labels).join(", ") : "a coordinar con el asesor";
}

function buildSummaryPayload(data) {
  const lookup = data.lookup || {};
  const recetarioValue = data.recetarioAdhered;
  const includeRecetario = recetarioValue !== false;
  return {
    mode: String(data.mode || ""),
    orderType: String(data.orderType || ""),
    productTitle: String(lookup.title || ""),
    productId: String(lookup.productId || ""),
    stockStatus: formatStockStatus(lookup.available),
    publicPrice: lookup.publicPrice,
    publicPriceLabel: lookup.source === "api" ? "Precio" : "Precio documental de referencia",
    recetario: typeof recetarioValue === "boolean" ? (recetarioValue ? "S�" : "No") : "No informado",
    referencePricing: data.referencePricing || null,
    pricingLines: buildPricingLines(lookup, { includeRecetario }),
    coverageNote: getProductCoverageNote(String(lookup.productId || ""))
  };
}

function buildSummaryActions(data) {
  data.currentSummary = buildSummaryPayload(data);
  return [buildChoiceAction(buildOperationalSummaryText(data), summaryButtons(data))];
}

function buildRecetarioActions(lookup) {
  return [buildChoiceAction(buildRecetarioPromptText(lookup), recetarioButtons())];
}

function buildSummaryText(data) {
  return buildOperationalSummaryText(data);
  /*
  const summary = data.currentSummary || buildSummaryPayload(data);
  const lines = [
    "Resumen:",
    `- Modalidad: ${summary.mode || "No informada"}`,
    `- Tipo: ${summary.orderType || "No informado"}`,
    `- Producto: ${summary.productTitle || "No informado"}`,
    `- Stock: ${summary.stockStatus}`
  ];

  if (summary.publicPrice !== null) {
    lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
  } else {
    lines.push(`- ${summary.publicPriceLabel}: pendiente`);
  }

  if (data.lookup?.available !== false) {
    lines.push(`- Recetario Solidario: ${summary.recetario}`);
  }

  if (Array.isArray(summary.pricingLines) && summary.pricingLines.length > 0) {
    lines.push("Precios con descuentos en Delko 1:");
    lines.push(`- Condici�n: ${summary.referencePricing.label}`);
  } else if (summary.referencePricing) {
    lines.push("- Valor de ejemplo: no disponible.");
  }

  if (data.lookup?.source !== "api") {
    lines.push("- Referencia documental por indisponibilidad momentanea del sistema.");
  }

  return lines.join("\n");
  */
}

function buildOperationalSummaryText(data) {
  const summary = data.currentSummary || buildSummaryPayload(data);
  const lines = [
    "Resumen:",
    `- Modalidad: ${summary.mode || "No informada"}`,
    `- Tipo: ${summary.orderType || "No informado"}`,
    `- Producto: ${summary.productTitle || "No informado"}`,
    `- Stock: ${summary.stockStatus}`
  ];

  if (summary.publicPrice !== null) {
    lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
  } else {
    lines.push(`- ${summary.publicPriceLabel}: pendiente`);
  }

  if (data.lookup?.available !== false) {
    lines.push(`- Recetario Solidario: ${summary.recetario}`);
  }

  if (Array.isArray(summary.pricingLines) && summary.pricingLines.length > 0) {
    lines.push("Precios con descuentos en Delko 1:");
    lines.push(...summary.pricingLines);
  } else if (summary.referencePricing) {
    lines.push(`Precio estimado con descuento: ${formatCurrency(summary.referencePricing.finalPrice)}.`);
    lines.push(`Condicion: ${summary.referencePricing.label}.`);
  }

  if (data.lookup?.source !== "api") {
    lines.push("- Referencia documental por indisponibilidad momentanea del sistema.");
  }

  if (summary.coverageNote) {
    lines.push(`- Nota: ${summary.coverageNote}`);
  }

  return lines.join("\n");
}

function summaryButtons(data) {
  const noStock = data.lookup?.available === false;
  return noStock
    ? [buildBackButton()]
    : [
        { id: "summary_confirm", title: "Confirmar" },
        buildBackButton()
      ];
}

function buildFinalConfirmationText(data) {
  const modeLine = data.mode === "MOSTRADOR" ? "para retiro en mostrador" : "para entrega coordinada por nuestro equipo";
  const productTitle = data.lookup?.title || "el producto solicitado";

  return [
    `Perfecto. Registramos tu solicitud de ${productTitle} ${modeLine}.`,
    "Un asesor va a continuar por este medio para confirmar la operaci�n."
  ].join("\n");
}

function storeConfirmedItem(session) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }

  const lookup = session.data.lookup || {};
  const referencePricing = session.data.referencePricing || null;
  session.data.itemsList = [
    {
      productId: String(lookup.productId || ""),
      productTitle: String(lookup.title || ""),
      planTitle: session.data.recetarioAdhered ? "Recetario Solidario" : "Sin Recetario Solidario",
      paymentLabel: referencePricing?.label || "",
      publicPrice: lookup.publicPrice,
      finalReferencePrice: referencePricing?.finalPrice || null
    }
  ];
  session.data.items = 1;
}

function formatStockStatus(available) {
  if (available === true) {
    return "disponible";
  }
  if (available === false) {
    return "sin stock";
  }
  return "A pedido";
}

function buildPricingLines(lookup, options = {}) {
  const scenarios = getPricingScenarios(String(lookup?.productId || ""), Number(lookup?.publicPrice), options);
  return scenarios.map(formatPricingScenarioLine);
}

function formatPricingScenarioLine(scenario) {
  if (Number.isFinite(Number(scenario?.finalPrice))) {
    return `${scenario.label}: ${formatCurrency(Number(scenario.finalPrice))}`;
  }

  const minPrice = Number(scenario?.minPrice);
  const maxPrice = Number(scenario?.maxPrice);
  if (Number.isFinite(minPrice) && Number.isFinite(maxPrice)) {
    return `${scenario.label}: entre ${formatCurrency(minPrice)} y ${formatCurrency(maxPrice)} (${scenario.rangeNote || "variable"})`;
  }

  return String(scenario?.label || "");
}

function repeatCurrentPrompt(session, profile, runtime) {
  switch (session.step) {
    case STEP.MENU:
      return resumeMenuActions(runtime);
    case STEP.SERVICE_TYPE:
      return buildServiceTypeActions(session.data?.mode || "DELIVERY", runtime);
    case STEP.RECETA_UPLOAD:
      return buildRecipeUploadActions(session, runtime);
    case STEP.PARTICULAR_INPUT:
      return buildParticularInputActions(runtime);
    case STEP.ITEM_INPUT:
      return buildCurrentWizardPrompt(session, runtime);
    case STEP.RECETARIO:
      return buildRecetarioActions(session.data.lookup || {});
    case STEP.SUMMARY:
      return buildSummaryActions(session.data);
    default:
      return resumeMenuActions(runtime);
  }
}

function buildCurrentWizardPrompt(session, runtime) {
  const wizard = ensureProductWizard(session);
  switch (wizard.stage) {
    case "brand":
      return buildProductBrandActions(wizard.labId);
    case "variant":
      return buildProductVariantActions(wizard.brandId);
    case "lab":
    default:
      return buildProductWizardStartActions(runtime);
  }
}

function buildCurrentWizardInteractive(session) {
  const wizard = ensureProductWizard(session);
  switch (wizard.stage) {
    case "brand":
      return buildInteractiveGroups(buildProductBrandHelpText(wizard.labId), productBrandButtons(wizard.labId), [buildBackButton()]);
    case "variant":
      return buildInteractiveGroups(buildProductVariantHelpText(wizard.brandId), productVariantButtons(wizard.brandId), [buildBackButton()]);
    case "lab":
    default:
      return buildInteractiveGroups(buildProductLabHelpText(), productLabButtons(), [buildBackButton()]);
  }
}

function fallback(session, shortText, helpText, helpInteractive, options = {}) {
  session.fallback = (session.fallback || 0) + 1;
  const interactiveActions = Array.isArray(helpInteractive) ? helpInteractive.filter(Boolean) : (helpInteractive ? [helpInteractive] : []);
  if (session.fallback <= 2) {
    if (options.interactiveOnly && interactiveActions.length > 0) {
      return { actions: interactiveActions };
    }
    const actions = [{ type: "text", text: buildFallbackReply(shortText, interactiveActions) }];
    if (interactiveActions.length > 0) {
      actions.push(...interactiveActions);
      return { actions };
    }
    return { actions: [{ type: "text", text: helpText || buildFallbackReply(shortText, interactiveActions) }] };
  }
  session.state = S.AGENT;
  session.step = null;
  session.fallback = 0;
  return { actions: [{ type: "text", text: "Te paso con un asesor para evitar demoras. Si querés volver al bot, escribí MENU." }] };
}

function saveLastOrder(profile, data) {
  profile.lastOrder = {
    mode: data.mode || "",
    orderType: data.orderType || "",
    items: Array.isArray(data.itemsList) ? data.itemsList.map(item => item.productTitle).filter(Boolean) : [],
    updatedAt: new Date().toISOString()
  };
}

function getProfile(contactId, contactName) {
  const existing = profiles.get(contactId);
  if (existing) {
    if (contactName) {
      existing.firstName = firstName(contactName);
    }
    return existing;
  }
  const profile = { firstName: firstName(contactName), welcomed: false, lastOrder: null };
  profiles.set(contactId, profile);
  return profile;
}

function parseModeChoice(input) {
  if (input.buttonId === "mode_delivery" || input.normalized.includes("delivery")) {
    return "DELIVERY";
  }
  if (input.buttonId === "mode_counter" || input.normalized.includes("mostrador")) {
    return "MOSTRADOR";
  }
  return null;
}

function parseServiceTypeChoice(input) {
  if (input.buttonId === "service_particular" || input.normalized.includes("particular")) {
    return { kind: "particular", label: "PARTICULAR" };
  }
  if (
    input.buttonId === "service_vaccines" ||
    input.buttonId === "service_treatment" ||
    input.normalized.includes("vacunas") ||
    input.normalized.includes("vacuna") ||
    input.normalized.includes("obesidad") ||
    input.normalized.includes("diabetes") ||
    input.normalized.includes("programa") ||
    input.normalized.includes("diabetes tipo 2") ||
    input.normalized.includes("tratamiento")
  ) {
    return { kind: "treatment", label: "VACUNAS" };
  }
  if (input.buttonId === "service_obra_social" || input.normalized.includes("obra social")) {
    return { kind: "obra_social", label: "OBRA SOCIAL" };
  }
  return null;
}

function parseRecetarioChoice(input) {
  if (input.buttonId === "recetario_yes" || ["si", "s?", "s"].includes(input.normalized)) {
    return "yes";
  }
  if (input.buttonId === "recetario_no" || input.normalized === "no") {
    return "no";
  }
  return null;
}

function parseSummaryChoice(input) {
  if (input.buttonId === "summary_confirm" || input.normalized.includes("confirm")) {
    return "confirm";
  }
  if (input.buttonId === "summary_human" || input.normalized.includes("asesor")) {
    return "human";
  }
  if (input.buttonId === "summary_menu" || isMenu(input.normalized)) {
    return "menu";
  }
  return null;
}

function parseParticularSuggestionChoice(input) {
  if (input.buttonId === "particular_suggest_yes" || ["si", "s?", "s"].includes(input.normalized)) {
    return "confirm";
  }
  if (
    input.buttonId === "particular_suggest_no" ||
    input.buttonId === "particular_suggest_rewrite" ||
    input.normalized === "no"
  ) {
    return "rewrite";
  }
  return null;
}

function parseProductLabChoice(input) {
  if (input.buttonId.startsWith("item_lab_")) {
    return input.buttonId.replace("item_lab_", "");
  }
  return findLabByText(input.text)?.id || null;
}

function parseProductBrandChoice(input, labId) {
  if (input.buttonId.startsWith("item_brand_")) {
    return input.buttonId.replace("item_brand_", "");
  }
  return findBrandByText(input.text, labId)?.id || null;
}

function parseProductVariantChoice(input, brandId) {
  if (
    input.buttonId.startsWith("item_variant_") &&
    !input.buttonId.startsWith("item_variant_more_") &&
    input.buttonId !== "item_variant_restart" &&
    input.buttonId !== "item_variant_change_brand"
  ) {
    return input.buttonId.replace("item_variant_", "");
  }
  return findProductByText(input.text, brandId)?.id || null;
}

function buildInput(inboundText, inboundMessage) {
  const buttonId =
    inboundMessage?.interactive?.button_reply?.id ||
    inboundMessage?.interactive?.list_reply?.id ||
    inboundMessage?.button?.payload ||
    "";
  const textFromMessage =
    inboundMessage?.text?.body ||
    inboundMessage?.button?.text ||
    inboundMessage?.interactive?.button_reply?.title ||
    inboundMessage?.interactive?.list_reply?.title ||
    inboundMessage?.document?.caption ||
    inboundMessage?.image?.caption ||
    "";
  const text = String(inboundText || textFromMessage || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 400);
  const normalized = normalize(text);
  const messageType = inboundMessage?.type || (text ? "text" : "unknown");
  const hasMedia = messageType === "image" || messageType === "document";
  return { text, normalized, buttonId, hasMedia };
}

function extractPromptChoices(actions) {
  const collected = [];
  let index = 0;

  for (const action of Array.isArray(actions) ? actions : []) {
    if (action?.type !== "interactive") {
      continue;
    }

    const rows = action?.interactiveType === "list"
      ? (Array.isArray(action.sections) ? action.sections.flatMap(section => Array.isArray(section?.rows) ? section.rows : []) : [])
      : (Array.isArray(action.buttons) ? action.buttons : []);

    for (const row of rows) {
      const id = String(row?.id || "").trim();
      const title = String(row?.title || "").trim();
      const description = String(row?.description || "").trim();
      if (!id || !title) {
        continue;
      }

      const combinedLabel = combineChoiceLabel(title, description);
      collected.push({
        token: indexToChoiceToken(index),
        id,
        title,
        description,
        combinedLabel,
        normalizedTitle: normalizeChoiceLabel(title),
        normalizedCombinedLabel: normalizeChoiceLabel(combinedLabel)
      });
      index += 1;
    }
  }

  return collected;
}

function rememberPromptChoices(session, actions, options = {}) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }

  const choices = extractPromptChoices(actions);
  if (options.clear || choices.length === 0) {
    delete session.data.promptChoices;
    return;
  }

  session.data.promptChoices = choices;
}

function applyStoredPromptChoice(session, input) {
  if (!session?.data || input?.buttonId) {
    return input;
  }

  const choices = Array.isArray(session.data.promptChoices) ? session.data.promptChoices : [];
  if (!choices.length) {
    return input;
  }

  const token = extractChoiceToken(input.text);
  let matched = token ? choices.find(choice => choice.token === token) : null;

  if (!matched) {
    const normalized = normalizeChoiceLabel(input.text);
    matched = choices.find(choice => choice.normalizedTitle === normalized || choice.normalizedCombinedLabel === normalized) || null;
  }

  if (!matched) {
    return input;
  }

  input.buttonId = matched.id;
  input.text = matched.combinedLabel || matched.title || input.text;
  input.normalized = normalizeChoiceLabel(input.text);
  return input;
}

function buildSessionSnapshot(session) {
  return {
    state: session?.state || S.IDLE,
    step: session?.step || null
  };
}

function isProductWizardInput(input) {
  const buttonId = String(input?.buttonId || "");
  return buttonId.startsWith("item_lab_") || buttonId.startsWith("item_brand_") || buttonId.startsWith("item_variant_");
}

function snapshotSessionData(data) {
  const input = data && typeof data === "object" ? data : {};
  const itemsList = Array.isArray(input.itemsList) ? input.itemsList : [];
  const deliveryDraft = input.deliveryDraft && typeof input.deliveryDraft === "object" ? input.deliveryDraft : {};
  return {
    mode: String(input.mode || ""),
    zone: String(deliveryDraft.neighborhood || ""),
    address: String(deliveryDraft.addressLine || ""),
    branch: "Delko 1",
    orderType: String(input.orderType || ""),
    recipes: Number(input.recipes || 0),
    items: Number(input.items || itemsList.length || 0),
    waitingAdvisor: Boolean(input.waitingAdvisor),
    advisorHandoffReason: String(input.advisorHandoffReason || ""),
    manualAdvisorIntervened: Boolean(input.manualAdvisorIntervened),
    finalized: Boolean(input.finalized),
    automationMode: String(input.automationMode || ""),
    initialWelcomeSent: Boolean(input.initialWelcomeSent)
  };
}

function recoverFromInput(session, input) {
  const buttonId = input.buttonId || "";

  if (buttonId.startsWith("mode_")) {
    session.state = S.ORDER;
    move(session, STEP.MENU);
    return true;
  }

  if (buttonId.startsWith("service_")) {
    session.state = S.ORDER;
    move(session, STEP.SERVICE_TYPE);
    return true;
  }

  if (buttonId.startsWith("item_lab_") || buttonId.startsWith("item_brand_") || buttonId.startsWith("item_variant_")) {
    session.state = S.ORDER;
    move(session, STEP.ITEM_INPUT);
    return true;
  }

  if (buttonId.startsWith("recetario_")) {
    session.state = S.ORDER;
    move(session, STEP.RECETARIO);
    return true;
  }

  if (buttonId.startsWith("summary_")) {
    session.state = S.ORDER;
    move(session, STEP.SUMMARY);
    return true;
  }

  if (buttonId.startsWith("particular_suggest_")) {
    session.state = S.ORDER;
    move(session, STEP.PARTICULAR_INPUT);
    return true;
  }

  if (buttonId.startsWith("particular_option_")) {
    session.state = S.ORDER;
    move(session, STEP.PARTICULAR_INPUT);
    return true;
  }

  return false;
}

function nodeText(runtime, nodeId, fallbackText) {
  const message = String(runtime?.nodeMessages?.[nodeId] || "").trim();
  return normalizeUiCopy(message || fallbackText);
}

function buildPromptActions(promptText, buttons, extraButtons = []) {
  return buildInteractiveGroups(promptText, buttons, extraButtons);
}

function buildInteractiveGroups(text, buttons, extraButtons = []) {
  const choices = [
    ...(Array.isArray(buttons) ? buttons.filter(Boolean) : []),
    ...(Array.isArray(extraButtons) ? extraButtons.filter(Boolean) : [])
  ];
  return choices.length ? [buildChoiceAction(text, choices)] : [];
}

function buildBackButton() {
  return { id: "nav_back", title: "Volver al menú anterior" };
}

function buildHomeButton() {
  return { id: "nav_home", title: "Volver al inicio" };
}

function buildRestartButton() {
  return {
    id: "nav_restart",
    title: "Comenzar nuevamente",
    description: "desde el inicio"
  };
}

function shouldAddHomeChoice(buttons) {
  const ids = (Array.isArray(buttons) ? buttons : [])
    .map(button => String(button?.id || "").trim())
    .filter(Boolean);

  if (!ids.length || ids.includes("nav_home")) {
    return false;
  }

  const nonNavigationIds = ids.filter(id => id !== "nav_back");
  if (nonNavigationIds.length === 0) {
    return true;
  }

  const isMainMenu = nonNavigationIds.every(id => id === "mode_delivery" || id === "mode_counter");
  if (isMainMenu) {
    return false;
  }
  return true;
}

function shouldAddRestartChoice(buttons) {
  return false;
}

function withContextualNavigation(buttons) {
  const resolved = Array.isArray(buttons) ? buttons.filter(Boolean) : [];
  if (shouldAddHomeChoice(resolved)) {
    resolved.push(buildHomeButton());
  }
  if (shouldAddRestartChoice(resolved)) {
    resolved.push(buildRestartButton());
  }
  return resolved;
}

function buildNavigationAction(promptText = "Si querés volver, elegí una opción.") {
  return buildChoiceAction(promptText, [buildBackButton()]);
}

function flattenInteractiveRows(actions) {
  return (Array.isArray(actions) ? actions : []).flatMap(action => {
    if (action?.type !== "interactive") {
      return [];
    }

    if (action.interactiveType === "list") {
      return (Array.isArray(action.sections) ? action.sections : []).flatMap(section =>
        Array.isArray(section?.rows) ? section.rows : []
      );
    }

    return Array.isArray(action.buttons) ? action.buttons : [];
  });
}

function shouldExplainLetterChoice(helpInteractive) {
  const rows = flattenInteractiveRows(Array.isArray(helpInteractive) ? helpInteractive : [helpInteractive]);
  const selectableRows = rows.filter(row => {
    const id = String(row?.id || "").trim();
    return id && id !== "nav_back" && id !== "nav_home" && id !== "nav_restart";
  });
  return selectableRows.length > 0;
}

function buildFallbackReply(shortText, helpInteractive) {
  const baseText = String(shortText || "").trim() || "No pude entender esa respuesta.";
  if (!shouldExplainLetterChoice(helpInteractive)) {
    return baseText;
  }
  return `${baseText}\n\n*Respondé con la letra de la opción.*`;
}

function buildParticularInputActions(runtime, session = null) {
  const prompt = nodeText(
    runtime,
    "particular_input",
    buildFreeTextProductPrompt(STEP.PARTICULAR_INPUT, getProductSearchMode(session), runtime)
  );
  return buildFreeTextProductActions(STEP.PARTICULAR_INPUT, session || {}, runtime, prompt);
}

function buildParticularInputNavigation(promptText = "¿Qué necesitás?") {
  return buildNavigationAction(promptText);
}

function buildCartInputActions(promptText = "", session = null, runtime = null) {
  const resolvedPrompt = promptText || buildFreeTextProductPrompt(STEP.CART_INPUT, getProductSearchMode(session), runtime);
  return buildFreeTextProductActions(STEP.CART_INPUT, session || {}, runtime, resolvedPrompt);
}

function buildCartInputNavigation(promptText = "¿Qué querés agregar?") {
  return buildNavigationAction(promptText);
}

function buildProductTextNavigation(step, promptText) {
  return step === STEP.CART_INPUT ? buildCartInputNavigation(promptText) : buildParticularInputNavigation(promptText);
}

function buildParticularOptionsPrompt(session) {
  const pending = session?.data?.pendingParticularOptions || {};
  const totalPages = getParticularOptionsTotalPages(session);
  const currentPage = Math.max(0, Number(pending.page || 0)) + 1;
  const query = String(pending.query || "").trim();
  const searchMode = pending.mode === PRODUCT_SEARCH_MODE.DRUG ? PRODUCT_SEARCH_MODE.DRUG : PRODUCT_SEARCH_MODE.NAME;
  const suffix = totalPages > 1 ? ` Página ${currentPage} de ${totalPages}.` : "";
  if (query) {
    return searchMode === PRODUCT_SEARCH_MODE.DRUG
      ? `Encontré estos productos para la droga "${query}". Elegí el correcto.${suffix}`
      : `Encontré estas opciones para "${query}". Elegí la correcta.${suffix}`;
  }

  return searchMode === PRODUCT_SEARCH_MODE.DRUG
    ? `Encontré estos productos por droga. Elegí el correcto.${suffix}`
    : `Encontré estas opciones. Elegí la correcta.${suffix}`;
}

function buildParticularOptionsActions(session) {
  return [buildParticularOptionsList(session)];
}

function buildParticularOptionsList(session) {
  const pending = session?.data?.pendingParticularOptions || {};
  const options = Array.isArray(pending.options) ? pending.options : [];
  const page = Math.max(0, Number(pending.page || 0));
  const start = page * PARTICULAR_OPTIONS_PER_PAGE;
  const visibleOptions = options.slice(start, start + PARTICULAR_OPTIONS_PER_PAGE);

  const productRows = visibleOptions.map((option, offset) => ({
    id: `particular_option_pick_${start + offset}`,
    title: trim(option.title || "Producto", 24),
    description: buildParticularOptionDescription(option)
  }));

  const utilityRows = [];
  if (page > 0) {
    utilityRows.push({ id: "particular_option_prev", title: "Ver anteriores" });
  }
  if (start + PARTICULAR_OPTIONS_PER_PAGE < options.length) {
    utilityRows.push({ id: "particular_option_more", title: "Ver más opciones" });
  }
  utilityRows.push({ id: "particular_option_rewrite", title: "Volver a escribir" });
  utilityRows.push({
    id: "particular_option_human",
    title: "Contactar asesor",
    description: "El producto no está"
  });
  utilityRows.push(buildBackButton());
  utilityRows.push(buildHomeButton());

  return {
    type: "interactive",
    interactiveType: "list",
    text: buildParticularOptionsPrompt(session),
    buttonText: "Elegir producto",
    sections: [
      { title: "Productos", rows: productRows },
      { title: "Ayuda", rows: utilityRows }
    ]
  };
}

function buildParticularOptionDescription(option) {
  const parts = [];
  const drugTitle = trim(option?.drugTitle || "", 32);
  if (drugTitle && normalize(drugTitle) && !normalize(option?.title || "").includes(normalize(drugTitle))) {
    parts.push(`Droga: ${drugTitle}`);
  }
  if (Number.isFinite(Number(option?.publicPrice))) {
    parts.push(formatCurrency(option.publicPrice));
  }
  return trim(parts.join(" - "), 72);
}

function getParticularOptionsTotalPages(session) {
  const total = Array.isArray(session?.data?.pendingParticularOptions?.options)
    ? session.data.pendingParticularOptions.options.length
    : 0;
  return Math.max(1, Math.ceil(total / PARTICULAR_OPTIONS_PER_PAGE));
}

function buildParticularNoResultsAction(query, searchMode = PRODUCT_SEARCH_MODE.NAME) {
  const safeQuery = trim(query || "", 60);
  const text = safeQuery
    ? searchMode === PRODUCT_SEARCH_MODE.DRUG
      ? `No encontré productos claros para la droga "${safeQuery}". Si querés, escribila de otra manera o te derivamos con un asesor.`
      : `No encontré opciones claras para "${safeQuery}". Si querés, escribilo de otra manera o te derivamos con un asesor.`
    : searchMode === PRODUCT_SEARCH_MODE.DRUG
      ? "No encontré productos claros para esa droga. Si querés, escribila de otra manera o te derivamos con un asesor."
      : "No encontré opciones claras. Si querés, escribilo de otra manera o te derivamos con un asesor.";
  return buildChoiceAction(text, [
    { id: "particular_option_rewrite", title: "Volver a escribir" },
    { id: "particular_option_human", title: "Contactar asesor", description: "El producto no está" },
    buildBackButton()
  ]);
}

function buildRecipeUploadActions(_session, runtime) {
  return [buildRecipeUploadNavigation(nodeText(runtime, "receta_upload", "Enviá tu receta."))];
}

function buildRecipeUploadNavigation(promptText = "Enviá tu receta.") {
  return buildNavigationAction(promptText);
}

function buildParticularSuggestionPrompt(session) {
  const title = String(session?.data?.pendingParticularSuggestion?.title || "").trim();
  return title
    ? `¿Quisiste decir ${title}? Confirmalo para seguir o volvelo a escribir.`
    : "¿Quisiste decir este producto? Confirmalo para seguir o volvelo a escribir.";
}

function buildParticularSuggestionActions(session) {
  return [
    buildChoiceAction(buildParticularSuggestionPrompt(session), [
      { id: "particular_suggest_yes", title: "Sí" },
      { id: "particular_suggest_no", title: "No" },
      { id: "particular_suggest_rewrite", title: "Volver a escribir" }
    ])
  ];
}

function resolveStep(flowEngine, preferredStep, fallbackStep) {
  return flowEngine.resolveNode(preferredStep, null) || fallbackStep;
}

function moveByRoute(session, flowEngine, fromStep, routeKey, fallbackStep) {
  const hasExplicitRoute = Array.isArray(flowEngine?.activeEdges)
    ? flowEngine.activeEdges.some(edge => String(edge?.routeKey || "") === String(routeKey || ""))
    : false;
  const nextStep = hasExplicitRoute ? flowEngine.resolveRoute(fromStep, routeKey, fallbackStep) : fallbackStep;
  move(session, nextStep || fallbackStep);
  session.lastTransition = {
    from: String(fromStep || ""),
    routeKey: String(routeKey || ""),
    to: String(session.step || "")
  };
}

function buildInteractive(text, buttons) {
  return { type: "interactive", text, buttons };
}

function buildChoiceAction(text, buttons, buttonText = "Ver opciones") {
  const choices = withContextualNavigation(buttons);
  if (choices.length <= 3) {
    return buildInteractive(text, choices);
  }
  return buildInteractiveList(text, choices, buttonText);
}

function buildInteractiveList(text, buttons, buttonText = "Ver opciones") {
  const rows = buttons
    .filter(Boolean)
    .map(button => ({
      id: String(button.id || ""),
      title: String(button.title || ""),
      ...(button.description ? { description: String(button.description) } : {})
    }));

  const sections = [];
  for (let index = 0; index < rows.length; index += 10) {
    sections.push({
      title: sections.length === 0 ? "Opciones" : "Más opciones",
      rows: rows.slice(index, index + 10)
    });
  }

  return {
    type: "interactive",
    interactiveType: "list",
    text,
    buttonText,
    sections
  };
}

function normalizeUiCopy(text) {
  const value = String(text || "").trim();
  const replacements = new Map([
    ["Elegi como queres continuar.", "¿Cómo querés continuar?"],
    ["Como queres continuar.", "¿Cómo querés continuar?"],
    ["Elegí como querés continuar.", "¿Cómo querés continuar?"],
    ["Elegi una opcion.", "Elegí una opción."],
    ["Envianos tu receta.", "Enviá tu receta."],
    ["Que necesitas?", "¿Qué necesitás?"],
    ["Estas adherido al Recetario Solidario?", "¿Estás adherido al Recetario Solidario?"],
    ["Resumen.", "Revisá el resumen."]
  ]);
  return replacements.get(value) || value;
}

function isHomeCommand(input) {
  return String(input?.buttonId || "") === "nav_home" || ["volver al inicio", "inicio"].includes(String(input?.normalized || ""));
}

function isRestartCommand(input) {
  return String(input?.buttonId || "") === "nav_restart"
    || ["comenzar nuevamente desde el inicio", "comenzar nuevamente", "comenzar de nuevo", "reiniciar", "reinicio"].includes(String(input?.normalized || ""));
}

function handleHomeCommand(session, runtime, flowEngine) {
  clearRecentProductHistoryOffer(session);
  resetSession(session);
  move(session, resolveStep(flowEngine, STEP.MENU, STEP.MENU));
  return { actions: resumeMenuActions(runtime) };
}

function isBackCommand(input) {
  return String(input?.buttonId || "") === "nav_back" || isBack(input?.normalized || "");
}

function handleBackCommand(session, runtime, flowEngine) {
  if (session.state === S.AGENT || session.state === S.IDLE || !session.step) {
    resetSession(session);
    return { actions: resumeMenuActions(runtime) };
  }

  switch (session.step) {
    case STEP.MENU:
      resetSession(session);
      return { actions: resumeMenuActions(runtime) };
    case STEP.SERVICE_TYPE:
      move(session, resolveStep(flowEngine, STEP.MENU, STEP.MENU));
      return { actions: resumeMenuActions(runtime) };
    case STEP.RECETA_UPLOAD:
      if (session.data?.mode === "MOSTRADOR") {
        move(session, resolveStep(flowEngine, STEP.MENU, STEP.MENU));
        return { actions: resumeMenuActions(runtime) };
      }
      move(session, resolveStep(flowEngine, STEP.SERVICE_TYPE, STEP.SERVICE_TYPE));
      return { actions: buildServiceTypeActions(session.data?.mode || "DELIVERY", runtime) };
    case STEP.PARTICULAR_INPUT:
      move(session, resolveStep(flowEngine, STEP.SERVICE_TYPE, STEP.SERVICE_TYPE));
      return { actions: buildServiceTypeActions(session.data?.mode || "DELIVERY", runtime) };
    case STEP.ITEM_INPUT:
      return { actions: goBackInProductWizard(session, runtime, flowEngine) };
    case STEP.RECETARIO:
      return { actions: goBackFromRecetario(session, runtime, flowEngine) };
    case STEP.SUMMARY:
      return { actions: goBackFromSummary(session, runtime, flowEngine) };
    default:
      resetSession(session);
      return { actions: resumeMenuActions(runtime) };
  }
}

function goBackInProductWizard(session, runtime, flowEngine) {
  const wizard = ensureProductWizard(session);

  if (wizard.stage === "variant" && wizard.labId) {
    wizard.stage = "brand";
    wizard.productId = "";
    move(session, resolveStep(flowEngine, STEP.ITEM_INPUT, STEP.ITEM_INPUT));
    return buildProductBrandActions(wizard.labId);
  }

  if (wizard.stage === "brand") {
    resetProductWizard(session);
    move(session, resolveStep(flowEngine, STEP.ITEM_INPUT, STEP.ITEM_INPUT));
    return buildProductWizardStartActions(runtime);
  }

  move(session, resolveStep(flowEngine, STEP.SERVICE_TYPE, STEP.SERVICE_TYPE));
  return buildServiceTypeActions(session.data?.mode || "DELIVERY", runtime);
}

function goBackFromRecetario(session, runtime, flowEngine) {
  delete session.data.currentSummary;
  delete session.data.referencePricing;
  delete session.data.recetarioAdhered;

  if (session.data?.orderType === "PARTICULAR") {
    clearLookupData(session);
    move(session, resolveStep(flowEngine, STEP.PARTICULAR_INPUT, STEP.PARTICULAR_INPUT));
    return buildParticularInputActions(runtime);
  }

  restoreProductWizardFromLookup(session);
  move(session, resolveStep(flowEngine, STEP.ITEM_INPUT, STEP.ITEM_INPUT));
  return buildCurrentWizardPrompt(session, runtime);
}

function goBackFromSummary(session, runtime, flowEngine) {
  delete session.data.currentSummary;

  if (session.data?.lookup?.available === false || session.data?.recetarioAdhered === null || session.data?.recetarioAdhered === undefined) {
    return goBackFromRecetario(session, runtime, flowEngine);
  }

  move(session, resolveStep(flowEngine, STEP.RECETARIO, STEP.RECETARIO));
  return buildRecetarioActions(session.data.lookup || {});
}

function restoreProductWizardFromLookup(session) {
  const product = getProductById(String(session.data?.lookup?.productId || ""));
  if (!product) {
    resetProductWizard(session);
    return;
  }

  session.data.productWizard = {
    stage: "variant",
    labId: product.labId,
    brandId: product.brandId,
    productId: product.id
  };
}

function move(session, step) {
  session.step = step;
  session.lastTransition = null;
  session.fallback = 0;
}

function resetSession(session) {
  session.state = S.IDLE;
  session.step = null;
  session.lastTransition = null;
  session.data = {};
  session.fallback = 0;
}

function shouldSendAgentWaitingNotice(session, timestamp = Date.now()) {
  if (!session?.data || typeof session.data !== "object") {
    session.data = {};
  }

  const safeTimestamp = Number(timestamp || 0) > 0 ? Number(timestamp) : Date.now();
  const previous = Number(session.data.agentWaitingNoticeAt || 0);
  if (previous > 0 && safeTimestamp - previous < AGENT_AUTO_REPLY_COOLDOWN_MS) {
    return false;
  }

  session.data.agentWaitingNoticeAt = safeTimestamp;
  return true;
}

function buildAgentWaitingNoticeText(session) {
  if (isPendingCheckoutAdvisorHold(session)) {
    return "Te pedimos paciencia, por favor, en breve un asesor se va a comunicar por este medio para terminar la compra.";
  }

  return "Tu caso está en revisión por nuestro equipo. Si querés volver al bot, escribí MENU.";
}

function isPendingCheckoutAdvisorHold(session) {
  const handoffReason = String(session?.data?.advisorHandoffReason || "").trim().toLowerCase();
  return Boolean(session?.data?.waitingAdvisor) && handoffReason === "checkout_final_summary";
}

function getSession(contactId) {
  const s = sessions.get(contactId);
  if (s) {
    if (!Object.prototype.hasOwnProperty.call(s, "lastTransition")) {
      s.lastTransition = null;
    }
    return s;
  }
  const fresh = { state: S.IDLE, step: null, lastTransition: null, data: {}, fallback: 0, updatedAt: Date.now() };
  sessions.set(contactId, fresh);
  trimSessions();
  return fresh;
}

function touchSession(contactId, session) {
  session.updatedAt = Date.now();
  sessions.set(contactId, session);
}

function buildStateKey(contactId) {
  return `${KV_STATE_PREFIX}${contactId}`;
}

async function hydrateState(contactId) {
  if (!KV_ENABLED || isStateRemoteBackoffActive()) {
    return;
  }

  const payload = await kvGetJson(buildStateKey(contactId));
  if (!payload || typeof payload !== "object") {
    return;
  }

  const remoteSession = payload.session && typeof payload.session === "object" ? payload.session : null;
  const localSession = sessions.get(contactId) || null;
  const remoteUpdatedAt = Number(remoteSession?.updatedAt || 0);
  const localUpdatedAt = Number(localSession?.updatedAt || 0);
  const localFresh = Boolean(localSession)
    && LOCAL_STATE_HYDRATE_GRACE_MS > 0
    && localUpdatedAt > 0
    && (Date.now() - localUpdatedAt) <= LOCAL_STATE_HYDRATE_GRACE_MS;
  const shouldUseRemoteSession = Boolean(remoteSession) && (!localSession || (!localFresh && remoteUpdatedAt >= localUpdatedAt));

  if (shouldUseRemoteSession) {
    sessions.set(contactId, payload.session);
  }

  if (payload.profile && typeof payload.profile === "object") {
    profiles.set(contactId, payload.profile);
  }
}

async function persistState(contactId, session, profile) {
  if (!KV_ENABLED || isStateRemoteBackoffActive()) {
    return;
  }

  const payload = { session, profile };
  const ttlSeconds = Math.ceil(SESSION_TTL_MS / 1000);
  await kvSetJson(buildStateKey(contactId), payload, ttlSeconds);
}

async function kvGetJson(key) {
  if (isStateRemoteBackoffActive()) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KV_REQUEST_TIMEOUT_MS);
    const response = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`
      },
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data?.result === null || data?.result === undefined) {
      return null;
    }

    if (typeof data.result === "string") {
      return JSON.parse(data.result);
    }

    return typeof data.result === "object" ? data.result : null;
  } catch (error) {
    console.warn("KV read failed, using in-memory state:", error.message);
    markStateRemoteBackoff();
    return null;
  }
}

async function kvSetJson(key, value, ttlSeconds) {
  if (isStateRemoteBackoffActive()) {
    return;
  }

  try {
    const encodedValue = encodeURIComponent(JSON.stringify(value));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KV_REQUEST_TIMEOUT_MS);
    await fetch(`${KV_REST_API_URL}/setex/${encodeURIComponent(key)}/${ttlSeconds}/${encodedValue}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`
      },
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (error) {
    console.warn("KV write failed, state remains in-memory:", error.message);
    markStateRemoteBackoff();
  }
}

async function kvDelete(key) {
  if (!KV_ENABLED || isStateRemoteBackoffActive()) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KV_REQUEST_TIMEOUT_MS);
    await fetch(`${KV_REST_API_URL}/del/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`
      },
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (error) {
    console.warn("KV delete failed, stale remote state may remain:", error.message);
  }
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }

  for (const [key, timestamp] of recentInboundFingerprints.entries()) {
    if (now - Number(timestamp || 0) > DUPLICATE_INBOUND_WINDOW_MS * 4) {
      recentInboundFingerprints.delete(key);
    }
  }
}

function trimSessions() {
  if (sessions.size <= MAX_SESSIONS) {
    return;
  }
  let remove = sessions.size - MAX_SESSIONS;
  for (const id of sessions.keys()) {
    sessions.delete(id);
    remove -= 1;
    if (remove <= 0) {
      break;
    }
  }
}

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) {
    return "Pendiente";
  }
  return `$ ${arsFormatter.format(Number(value))}`;
}

function normalize(value) {
  return normalizeChoiceLabel(value);
}

function tokenizeQuery(value) {
  return normalize(value).match(/\d+(?:[.,]\d+)?|[a-z]+/g) || [];
}

function compactQueryText(value) {
  return tokenizeQuery(value).join("");
}

function levenshteinDistance(left, right) {
  const a = String(left || "");
  const b = String(right || "");

  if (!a) {
    return b.length;
  }
  if (!b) {
    return a.length;
  }

  const rows = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) {
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    rows[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost
      );
    }
  }

  return rows[a.length][b.length];
}

function similarityRatio(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  const maxLength = Math.max(a.length, b.length);
  if (!maxLength) {
    return 0;
  }
  return 1 - levenshteinDistance(a, b) / maxLength;
}

function trim(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function firstName(name) {
  const clean = trim(name || "", 80);
  if (!clean) {
    return "";
  }
  return (clean.split(" ")[0] || "").replace(/[^A-Za-z0-9'-]/g, "");
}

function toButtonTitle(value) {
  return trim(String(value || ""), 20) || "Opción";
}

function isGreeting(normalized) {
  return ["hola", "buenas", "buen d�a", "buen dia", "buenas tardes", "buenas noches", "hello"].includes(normalized);
}

function isCancel(normalized) {
  return ["cancelar", "cancel", "salir"].includes(normalized);
}

function isMenu(normalized) {
  return ["menu", "men�", "inicio", "opciones"].includes(normalized);
}

function isBack(normalized) {
  return ["volver", "volver al menu anterior", "atras", "atr�s", "anterior", "menu anterior"].includes(normalized);
}

function isHuman(normalized) {
  return (
    normalized.includes("asesor") ||
    normalized.includes("asesora") ||
    normalized.includes("agente") ||
    normalized.includes("humano") ||
    normalized.includes("humana")
  );
}

function continueAfterLookup({ session, flowEngine, sourceStep, lookup, productQuery }) {
  storeLookup(session, lookup, productQuery);
  session.data.lookupSourceStep = sourceStep;

  if (!lookup.found) {
    return {
      actions: [
        buildNavigationAction(
          "No pude confirmar ese producto en este momento. Tocá Volver al menú anterior para intentarlo de nuevo o escribinos para revisarlo con un asesor."
        )
      ]
    };
  }

  prepareCurrentItemDraft(session, { originStep: sourceStep, includeRecetario: false });
  move(session, STEP.SUMMARY);
  return {
    actions: buildSummaryActions(session.data)
  };
}

function buildSummaryPayload(data) {
  const draft = data?.currentItemDraft || null;
  if (draft) {
    return {
      mode: String(data.mode || ""),
      orderType: String(data.orderType || ""),
      productTitle: String(draft.productTitle || ""),
      productId: String(draft.productId || ""),
      stockStatus: String(draft.stockStatus || "A pedido"),
      publicPrice: Number.isFinite(Number(draft.publicPrice)) ? Number(draft.publicPrice) : null,
      publicPriceLabel: String(draft.publicPriceLabel || "Precio"),
      recetario: String(draft.recetario || "No informado"),
      referencePricing: data.referencePricing || null,
      pricingLines: Array.isArray(draft.pricingLines) ? draft.pricingLines : [],
      coverageNote: String(draft.coverageNote || ""),
      cartItems: Number((Array.isArray(data.itemsList) ? data.itemsList.length : 0) + 1)
    };
  }

  const cartItems = Array.isArray(data?.itemsList) ? data.itemsList : [];
  const totals = buildCartTotals(cartItems);
  const lastItem = cartItems[cartItems.length - 1] || null;
  return {
    mode: String(data.mode || ""),
    orderType: String(data.orderType || ""),
    productTitle: String(lastItem?.productTitle || ""),
    productId: String(lastItem?.productId || ""),
    stockStatus: String(lastItem?.stockStatus || ""),
    publicPrice: Number.isFinite(Number(totals.listTotal)) ? Number(totals.listTotal) : null,
    publicPriceLabel: "Total lista Delko 1",
    recetario: "",
    referencePricing: null,
    pricingLines: totals.scenarioLines,
    coverageNote: "",
    cartItems: cartItems.length
  };
}

function buildOperationalSummaryText(data) {
  const summary = data.currentSummary || buildSummaryPayload(data);
  const lines = [];
  const hasDraft = Boolean(data?.currentItemDraft?.productTitle);

  if (hasDraft) {
    lines.push("Revisá este producto:");
    lines.push(`- Producto: ${summary.productTitle || "No informado"}`);
    lines.push(`- Stock: ${summary.stockStatus || "A pedido"}`);
    if (summary.publicPrice !== null) {
      lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
    }
    if (summary.recetario) {
      lines.push(`- Recetario Solidario: ${summary.recetario}`);
    }
    if (Array.isArray(summary.pricingLines) && summary.pricingLines.length > 0) {
      lines.push("Precios con descuentos en Delko 1:");
      lines.push(...summary.pricingLines.map(line => `- ${String(line || "").replace(/^- /, "")}`));
    }
    lines.push(`- Productos en el pedido: ${summary.cartItems || 1}`);
    lines.push("¿Querés agregar algo más o terminar la compra?");
    return lines.join("\n");
  }

  lines.push(`Tu pedido tiene ${summary.cartItems || 0} producto(s).`);
  if (summary.publicPrice !== null) {
    lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
  }
  if (Array.isArray(summary.pricingLines) && summary.pricingLines.length > 0) {
    lines.push("Totales con descuentos:");
    lines.push(...summary.pricingLines);
  }
  lines.push("¿Querés agregar algo más o terminar la compra?");
  return lines.join("\n");
}

function summaryButtons(data) {
  const hasCart = Boolean(data?.currentItemDraft?.productTitle) || (Array.isArray(data?.itemsList) && data.itemsList.length > 0);
  if (!hasCart) {
    return [buildBackButton()];
  }

  if (!allowsSummaryAddMore(data)) {
    return [
      { id: "summary_finish", title: "Terminar compra" },
      buildBackButton()
    ];
  }

  return [
    { id: "summary_add_more", title: "Agregar algo más" },
    { id: "summary_finish", title: "Terminar compra" },
    buildBackButton()
  ];
}

function parseSummaryChoice(input) {
  if (input.buttonId === "summary_add_more" || input.normalized.includes("agregar")) {
    return "add_more";
  }
  if (input.buttonId === "summary_finish" || input.normalized.includes("termin")) {
    return "finish";
  }
  if (input.buttonId === "summary_human" || input.normalized.includes("asesor")) {
    return "human";
  }
  if (input.buttonId === "summary_menu" || isMenu(input.normalized)) {
    return "menu";
  }
  return null;
}

function repeatCurrentPrompt(session, profile, runtime) {
  switch (session.step) {
    case STEP.MENU:
      return resumeMenuActions(runtime);
    case STEP.SERVICE_TYPE:
      return buildServiceTypeActions(session.data?.mode || "DELIVERY", runtime);
    case STEP.PARTICULAR_SEARCH_MODE:
      return hasRecentProductHistoryOffer(session)
        ? buildRecentProductHistoryActions(profile)
        : buildParticularSearchModeActions();
    case STEP.RECETA_UPLOAD:
      return buildRecipeUploadActions(session, runtime);
    case STEP.PARTICULAR_INPUT:
      return buildParticularInputActions(runtime, session);
    case STEP.CART_INPUT:
      return buildCartInputActions("", session, runtime);
    case STEP.ITEM_INPUT:
      return buildCurrentWizardPrompt(session, runtime);
    case STEP.RECETARIO:
      return buildRecetarioActions(session.data.lookup || {});
    case STEP.SUMMARY:
      return buildSummaryActions(session.data);
    case STEP.DELIVERY_SAVED:
      return buildSavedDeliveryActions(profile);
    case STEP.DELIVERY_DETAILS:
    case STEP.DELIVERY_FIRST_NAME:
    case STEP.DELIVERY_LAST_NAME:
    case STEP.DELIVERY_EMAIL:
    case STEP.DELIVERY_ADDRESS:
    case STEP.DELIVERY_CROSS_STREETS:
    case STEP.DELIVERY_NEIGHBORHOOD:
      return buildDeliveryDetailsActions(session.step);
    default:
      return resumeMenuActions(runtime);
  }
}

function recoverFromInput(session, input) {
  const buttonId = input.buttonId || "";

  if (buttonId.startsWith("mode_")) {
    session.state = S.ORDER;
    move(session, STEP.MENU);
    return true;
  }

  if (buttonId.startsWith("service_")) {
    session.state = S.ORDER;
    move(session, STEP.SERVICE_TYPE);
    return true;
  }

  if (buttonId.startsWith("particular_search_")) {
    session.state = S.ORDER;
    move(session, STEP.PARTICULAR_SEARCH_MODE);
    return true;
  }

  if (buttonId.startsWith("recent_product_")) {
    session.state = S.ORDER;
    move(session, STEP.PARTICULAR_SEARCH_MODE);
    return true;
  }

  if (buttonId.startsWith("item_lab_") || buttonId.startsWith("item_brand_") || buttonId.startsWith("item_variant_")) {
    session.state = S.ORDER;
    move(session, STEP.ITEM_INPUT);
    return true;
  }

  if (buttonId.startsWith("recetario_")) {
    session.state = S.ORDER;
    move(session, STEP.RECETARIO);
    return true;
  }

  if (buttonId.startsWith("summary_")) {
    session.state = S.ORDER;
    move(session, STEP.SUMMARY);
    return true;
  }

  if (buttonId.startsWith("delivery_saved_")) {
    session.state = S.ORDER;
    move(session, STEP.DELIVERY_SAVED);
    return true;
  }

  if (buttonId.startsWith("particular_suggest_") || buttonId.startsWith("particular_option_")) {
    session.state = S.ORDER;
    move(session, session.data?.productInputStep === STEP.CART_INPUT ? STEP.CART_INPUT : STEP.PARTICULAR_INPUT);
    return true;
  }

  return false;
}

function handleBackCommand(session, runtime, flowEngine) {
  if (session.state === S.AGENT || session.state === S.IDLE || !session.step) {
    resetSession(session);
    return { actions: resumeMenuActions(runtime) };
  }

  switch (session.step) {
    case STEP.MENU:
      resetSession(session);
      return { actions: resumeMenuActions(runtime) };
    case STEP.SERVICE_TYPE:
      move(session, resolveStep(flowEngine, STEP.MENU, STEP.MENU));
      return { actions: resumeMenuActions(runtime) };
    case STEP.PARTICULAR_SEARCH_MODE:
      move(session, resolveStep(flowEngine, STEP.SERVICE_TYPE, STEP.SERVICE_TYPE));
      return { actions: buildServiceTypeActions(session.data?.mode || "DELIVERY", runtime) };
    case STEP.RECETA_UPLOAD:
      if (session.data?.mode === "MOSTRADOR") {
        move(session, resolveStep(flowEngine, STEP.MENU, STEP.MENU));
        return { actions: resumeMenuActions(runtime) };
      }
      move(session, resolveStep(flowEngine, STEP.SERVICE_TYPE, STEP.SERVICE_TYPE));
      return { actions: buildServiceTypeActions(session.data?.mode || "DELIVERY", runtime) };
    case STEP.PARTICULAR_INPUT:
      move(session, STEP.PARTICULAR_SEARCH_MODE);
      return { actions: buildParticularSearchModeActions() };
    case STEP.CART_INPUT:
      move(session, STEP.SUMMARY);
      return { actions: buildSummaryActions(session.data) };
    case STEP.ITEM_INPUT:
      return { actions: goBackInProductWizard(session, runtime, flowEngine) };
    case STEP.RECETARIO:
      return { actions: goBackFromRecetario(session, runtime, flowEngine) };
    case STEP.SUMMARY:
      return { actions: goBackFromSummary(session, runtime, flowEngine) };
    case STEP.DELIVERY_SAVED:
    case STEP.DELIVERY_DETAILS:
    case STEP.DELIVERY_FIRST_NAME:
    case STEP.DELIVERY_LAST_NAME:
    case STEP.DELIVERY_EMAIL:
    case STEP.DELIVERY_ADDRESS:
    case STEP.DELIVERY_CROSS_STREETS:
    case STEP.DELIVERY_NEIGHBORHOOD:
      move(session, STEP.SUMMARY);
      return { actions: buildSummaryActions(session.data) };
    default:
      resetSession(session);
      return { actions: resumeMenuActions(runtime) };
  }
}

function goBackFromRecetario(session, runtime, flowEngine) {
  delete session.data.currentSummary;
  delete session.data.currentItemDraft;
  delete session.data.referencePricing;
  delete session.data.recetarioAdhered;

  const returnStep = session.data?.lookupSourceStep || (session.data?.orderType === "PARTICULAR" ? STEP.PARTICULAR_INPUT : STEP.ITEM_INPUT);
  if (returnStep === STEP.CART_INPUT) {
    clearLookupData(session);
    move(session, STEP.CART_INPUT);
    return buildCartInputActions(buildFreeTextRewritePrompt(STEP.CART_INPUT, getProductSearchMode(session)), session, runtime);
  }

  if (returnStep === STEP.PARTICULAR_INPUT) {
    clearLookupData(session);
    move(session, STEP.PARTICULAR_INPUT);
    return buildParticularInputActions(runtime, session);
  }

  restoreProductWizardFromLookup(session);
  move(session, resolveStep(flowEngine, STEP.ITEM_INPUT, STEP.ITEM_INPUT));
  return buildCurrentWizardPrompt(session, runtime);
}

function goBackFromSummary(session, runtime, flowEngine) {
  delete session.data.currentSummary;
  const origin = session.data?.currentItemDraft?.originStep || "";

  if (origin === STEP.RECETARIO) {
    move(session, STEP.RECETARIO);
    return buildRecetarioActions(session.data.lookup || {});
  }

  delete session.data.currentItemDraft;
  if (origin === STEP.CART_INPUT) {
    clearLookupData(session);
    move(session, STEP.CART_INPUT);
    return buildCartInputActions("Perfecto. Escribime el producto otra vez.");
  }

  if (origin === STEP.PARTICULAR_INPUT) {
    clearLookupData(session);
    move(session, STEP.PARTICULAR_INPUT);
    return buildParticularInputActions(runtime);
  }

  if (origin === STEP.ITEM_INPUT) {
    restoreProductWizardFromLookup(session);
    move(session, resolveStep(flowEngine, STEP.ITEM_INPUT, STEP.ITEM_INPUT));
    return buildCurrentWizardPrompt(session, runtime);
  }

  if (Array.isArray(session.data?.itemsList) && session.data.itemsList.length > 0) {
    move(session, STEP.CART_INPUT);
    return buildCartInputActions("Escribime otro producto si querés seguir sumando.");
  }

  return buildParticularInputActions(runtime);
}

function clearLookupData(session) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  delete session.data.lookup;
  delete session.data.lookupSourceStep;
  delete session.data.referencePricing;
  delete session.data.currentSummary;
  delete session.data.currentItemDraft;
  delete session.data.lastProductQuery;
  delete session.data.recetarioAdhered;
  clearRecentProductHistoryOffer(session);
  clearPendingParticularSuggestion(session);
  clearPendingParticularOptions(session);
  clearProductWizard(session);
}

function clearSelectionData(session) {
  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }
  session.data.items = 0;
  session.data.itemsList = [];
  delete session.data.deliveryDraft;
  clearLookupData(session);
}

function saveLastOrder(profile, data) {
  const items = Array.isArray(data?.itemsList) ? data.itemsList : [];
  profile.lastOrder = {
    mode: data.mode || "",
    orderType: data.orderType || "",
    items: items.map(item => item.productTitle).filter(Boolean),
    itemsDetailed: items.map(item => ({
      productId: String(item?.productId || ""),
      productTitle: String(item?.productTitle || ""),
      productCode: String(item?.productCode || ""),
      drugTitle: String(item?.drugTitle || ""),
      drugCode: String(item?.drugCode || ""),
      stockStatus: String(item?.stockStatus || ""),
      publicPrice: Number.isFinite(Number(item?.publicPrice)) ? Number(item.publicPrice) : null,
      source: String(item?.source || ""),
      note: String(item?.note || ""),
      alternatives: Array.isArray(item?.alternatives)
        ? item.alternatives.map(option => ({
          title: String(option?.title || ""),
          publicPrice: Number.isFinite(Number(option?.publicPrice)) ? Number(option.publicPrice) : null,
          productCode: String(option?.productCode || ""),
          drugTitle: String(option?.drugTitle || "")
        }))
        : []
    })),
    totalList: buildCartTotals(items).listTotal,
    deliveryAddress: data?.deliveryDraft?.addressLine || profile?.delivery?.addressLine || "",
    deliverySummary: data?.deliveryDraft ? {
      firstName: String(data.deliveryDraft.firstName || ""),
      lastName: String(data.deliveryDraft.lastName || ""),
      email: String(data.deliveryDraft.email || ""),
      addressLine: String(data.deliveryDraft.addressLine || ""),
      crossStreets: String(data.deliveryDraft.crossStreets || ""),
      neighborhood: String(data.deliveryDraft.neighborhood || "")
    } : null,
    updatedAt: new Date().toISOString()
  };
}

function getProfile(contactId, contactName) {
  const existing = profiles.get(contactId);
  if (existing) {
    if (contactName) {
      existing.firstName = firstName(contactName);
    }
    if (!Object.prototype.hasOwnProperty.call(existing, "delivery")) {
      existing.delivery = null;
    }
    return existing;
  }
  const profile = { firstName: firstName(contactName), welcomed: false, lastOrder: null, delivery: null };
  profiles.set(contactId, profile);
  return profile;
}

function buildSavedDeliveryPrompt(profile) {
  const delivery = profile?.delivery || {};
  const addressParts = [
    trim(delivery.addressLine || "", 120),
    trim(delivery.crossStreets || "", 120) ? `Entre ${trim(delivery.crossStreets || "", 120)}` : "",
    trim(delivery.neighborhood || "", 120)
  ].filter(Boolean);

  return [
    "Tengo guardada esta dirección para delivery:",
    ...addressParts.map(part => `- ${part}`),
    "¿Querés volver a mandar ahí o preferís cargar otra dirección?"
  ].join("\n");
}

function buildSavedDeliveryActions(profile) {
  return [
    buildChoiceAction(buildSavedDeliveryPrompt(profile), [
      { id: "delivery_saved_yes", title: "Usar esta dirección" },
      { id: "delivery_saved_new", title: "Otra dirección" },
      buildBackButton()
    ])
  ];
}

function buildDeliveryDetailsTemplate() {
  return [
    "Nombre: ...",
    "Apellido: ...",
    "Mail: ...",
    "Dirección: ...",
    "Entre calles: ...",
    "Barrio: ..."
  ].join("\n");
}

function buildDeliveryDetailsPrompt(missingFields = []) {
  const intro = missingFields.length > 0
    ? `Me faltan estos datos: ${missingFields.join(", ")}.`
    : "Pasame todos los datos de delivery en un solo mensaje.";

  return [
    intro,
    "Copi� y complet� este formato:",
    buildDeliveryDetailsTemplate()
  ].join("\n");
}

function buildDeliveryDetailsActions(missingFields = []) {
  return [buildNavigationAction(buildDeliveryDetailsPrompt(missingFields))];
}

function handleDeliveryDetailsStep(session, profile, input) {
  if (input.hasMedia || !input.text || !String(input.text || "").trim()) {
    return {
      actions: buildDeliveryDetailsActions()
    };
  }

  if (!session.data?.deliveryDraft) {
    startDeliveryDraft(session, null);
  }

  const currentDraft = session.data.deliveryDraft || {};
  const parsedDraft = parseDeliveryDetailsBlock(input.text, currentDraft);
  const mergedDraft = {
    firstName: trim(parsedDraft.firstName || currentDraft.firstName || "", 80),
    lastName: trim(parsedDraft.lastName || currentDraft.lastName || "", 80),
    email: trim(parsedDraft.email || currentDraft.email || "", 120),
    addressLine: trim(parsedDraft.addressLine || currentDraft.addressLine || "", 160),
    crossStreets: trim(parsedDraft.crossStreets || currentDraft.crossStreets || "", 160),
    neighborhood: trim(parsedDraft.neighborhood || currentDraft.neighborhood || "", 120)
  };

  const validation = validateDeliveryDraft(mergedDraft);
  session.data.deliveryDraft = mergedDraft;

  if (!validation.ok) {
    return {
      actions: buildDeliveryDetailsActions(validation.missingFields)
    };
  }

  session.data.deliveryDraft = validation.value;
  profile.delivery = {
    ...validation.value,
    updatedAt: new Date().toISOString()
  };
  return finalizeCheckout(session, profile);
}

function parseDeliveryDetailsBlock(rawText, currentDraft = {}) {
  const text = String(rawText || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map(line => trim(line, 180))
    .filter(Boolean);

  const labeledDraft = {};
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      continue;
    }
    const field = resolveDeliveryFieldLabel(match[1]);
    if (!field) {
      continue;
    }
    labeledDraft[field] = trim(match[2] || "", 180);
  }

  if (Object.keys(labeledDraft).length >= 3) {
    return labeledDraft;
  }

  const fieldOrder = ["firstName", "lastName", "email", "addressLine", "crossStreets", "neighborhood"];
  const missingFieldOrder = fieldOrder.filter(field => !trim(currentDraft?.[field] || "", 180));
  const sequentialFields = missingFieldOrder.length > 0 ? missingFieldOrder : fieldOrder;

  if (lines.length > 0 && lines.length <= sequentialFields.length) {
    const sequentialDraft = {};
    for (let index = 0; index < lines.length; index += 1) {
      sequentialDraft[sequentialFields[index]] = lines[index];
    }
    return sequentialDraft;
  }

  return labeledDraft;
}

function resolveDeliveryFieldLabel(rawLabel) {
  const label = normalize(rawLabel);
  if (label === "nombre") return "firstName";
  if (label === "apellido") return "lastName";
  if (label === "mail" || label === "email" || label === "correo") return "email";
  if (label === "direccion" || label === "direccion de entrega") return "addressLine";
  if (label === "entre calles" || label === "calles") return "crossStreets";
  if (label === "barrio") return "neighborhood";
  return "";
}

function validateDeliveryDraft(draft) {
  const missingFields = [];
  const value = {
    firstName: trim(draft?.firstName || "", 80),
    lastName: trim(draft?.lastName || "", 80),
    email: trim(draft?.email || "", 120),
    addressLine: trim(draft?.addressLine || "", 160),
    crossStreets: trim(draft?.crossStreets || "", 160),
    neighborhood: trim(draft?.neighborhood || "", 120)
  };

  if (value.firstName.length < 2) missingFields.push("nombre");
  if (value.lastName.length < 2) missingFields.push("apellido");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) missingFields.push("mail");
  if (value.addressLine.length < 5) missingFields.push("dirección");
  if (value.crossStreets.length < 4) missingFields.push("entre calles");
  if (value.neighborhood.length < 2) missingFields.push("barrio");

  return {
    ok: missingFields.length === 0,
    value,
    missingFields
  };
}

function isDeliveryAddressStep(step) {
  return [STEP.DELIVERY_ADDRESS, STEP.DELIVERY_CROSS_STREETS, STEP.DELIVERY_NEIGHBORHOOD].includes(step);
}

function buildDeliveryContactPrompt(missingFields = []) {
  const intro = missingFields.length > 0
    ? `Me faltan estos datos: ${missingFields.join(", ")}.`
    : "Pasame en un solo mensaje el nombre, el apellido y el mail.";

  return [
    intro,
    "Podés escribirlo como te quede más cómodo."
  ].join("\n");
}

function buildDeliveryAddressPrompt(missingFields = []) {
  const intro = missingFields.length > 0
    ? `Me faltan estos datos: ${missingFields.join(", ")}.`
    : "Ahora pasame en un solo mensaje la dirección, entre calles y barrio.";

  return [
    intro,
    "Podés escribirlo como te quede más cómodo."
  ].join("\n");
}

function buildDeliveryDetailsPrompt(step = STEP.DELIVERY_DETAILS, missingFields = []) {
  return isDeliveryAddressStep(step)
    ? buildDeliveryAddressPrompt(missingFields)
    : buildDeliveryContactPrompt(missingFields);
}

function buildDeliveryDetailsActions(step = STEP.DELIVERY_DETAILS, missingFields = []) {
  return [buildNavigationAction(buildDeliveryDetailsPrompt(step, missingFields))];
}

function handleDeliveryDetailsStep(session, profile, input) {
  const step = isDeliveryAddressStep(session.step) ? STEP.DELIVERY_ADDRESS : STEP.DELIVERY_DETAILS;
  if (input.hasMedia || !input.text || !String(input.text || "").trim()) {
    return {
      actions: buildDeliveryDetailsActions(step)
    };
  }

  if (!session.data?.deliveryDraft) {
    startDeliveryDraft(session, null);
  }

  const currentDraft = session.data.deliveryDraft || {};

  if (step === STEP.DELIVERY_DETAILS) {
    const parsedDraft = parseDeliveryContactBlock(input.text, currentDraft);
    const mergedDraft = {
      ...currentDraft,
      firstName: trim(parsedDraft.firstName || currentDraft.firstName || "", 80),
      lastName: trim(parsedDraft.lastName || currentDraft.lastName || "", 80),
      email: trim(parsedDraft.email || currentDraft.email || "", 120)
    };
    const validation = validateDeliveryContactDraft(mergedDraft);
    session.data.deliveryDraft = {
      ...currentDraft,
      ...mergedDraft
    };

    if (!validation.ok) {
      return {
        actions: buildDeliveryDetailsActions(STEP.DELIVERY_DETAILS, validation.missingFields)
      };
    }

    session.data.deliveryDraft = {
      ...currentDraft,
      ...validation.value
    };
    move(session, STEP.DELIVERY_ADDRESS);
    return {
      actions: buildDeliveryDetailsActions(STEP.DELIVERY_ADDRESS)
    };
  }

  const parsedDraft = parseDeliveryAddressBlock(input.text, currentDraft);
  const mergedDraft = {
    ...currentDraft,
    addressLine: trim(parsedDraft.addressLine || currentDraft.addressLine || "", 160),
    crossStreets: trim(parsedDraft.crossStreets || currentDraft.crossStreets || "", 160),
    neighborhood: trim(parsedDraft.neighborhood || currentDraft.neighborhood || "", 120)
  };
  const validation = validateDeliveryAddressDraft(mergedDraft);
  session.data.deliveryDraft = {
    ...currentDraft,
    ...mergedDraft
  };

  if (!validation.ok) {
    return {
      actions: buildDeliveryDetailsActions(STEP.DELIVERY_ADDRESS, validation.missingFields)
    };
  }

  session.data.deliveryDraft = {
    ...currentDraft,
    ...validation.value
  };
  profile.delivery = {
    ...session.data.deliveryDraft,
    updatedAt: new Date().toISOString()
  };
  return finalizeCheckout(session, profile);
}

function parseDeliveryContactBlock(rawText, currentDraft = {}) {
  const text = String(rawText || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map(line => trim(line, 180))
    .filter(Boolean);

  const labeledDraft = parseLabeledDeliveryFields(lines, ["firstName", "lastName", "email"]);
  if (Object.keys(labeledDraft).length >= 2) {
    return labeledDraft;
  }

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    labeledDraft.email = trim(emailMatch[0], 120);
  }

  const remainingLines = lines
    .map(line => trim(line.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, " "), 180))
    .filter(Boolean);
  const nameSource = remainingLines.join(" ").replace(/\s+/g, " ").trim();

  if (nameSource) {
    const nameParts = nameSource.split(/\s+/).filter(Boolean);
    if (!labeledDraft.firstName && nameParts[0]) {
      labeledDraft.firstName = trim(nameParts[0], 80);
    }
    if (!labeledDraft.lastName && nameParts.length > 1) {
      labeledDraft.lastName = trim(nameParts.slice(1).join(" "), 80);
    }
  }

  if (!labeledDraft.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim(currentDraft?.email || "", 120))) {
    labeledDraft.email = trim(currentDraft.email, 120);
  }

  return labeledDraft;
}

function parseDeliveryAddressBlock(rawText, currentDraft = {}) {
  const text = String(rawText || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map(line => trim(line, 180))
    .filter(Boolean);

  const addressFields = ["addressLine", "crossStreets", "neighborhood"];
  const labeledDraft = parseLabeledDeliveryFields(lines, addressFields);
  if (Object.keys(labeledDraft).length >= 2) {
    return labeledDraft;
  }

  if (lines.length >= 3) {
    return {
      ...labeledDraft,
      addressLine: trim(stripDeliveryFieldPrefix(lines[0]), 160),
      crossStreets: trim(stripLeadingEntre(stripDeliveryFieldPrefix(lines[1])), 160),
      neighborhood: trim(stripDeliveryFieldPrefix(lines.slice(2).join(", ")), 120)
    };
  }

  if (lines.length >= 2) {
    const missingFieldOrder = addressFields.filter(field => !trim(currentDraft?.[field] || "", 180));
    const sequentialFields = missingFieldOrder.length > 0 ? missingFieldOrder : addressFields;
    for (let index = 0; index < Math.min(lines.length, sequentialFields.length); index += 1) {
      const field = sequentialFields[index];
      const rawValue = trim(stripDeliveryFieldPrefix(lines[index]), 180);
      labeledDraft[field] = field === "crossStreets"
        ? trim(stripLeadingEntre(rawValue), 180)
        : rawValue;
    }
    return labeledDraft;
  }

  const inlineDraft = parseInlineAddressText(text);
  const reinterpretedSingleLineDraft = reinterpretSingleLineAddressReply(inlineDraft, currentDraft);
  if (reinterpretedSingleLineDraft) {
    return {
      ...labeledDraft,
      ...reinterpretedSingleLineDraft
    };
  }

  return {
    ...labeledDraft,
    ...inlineDraft
  };
}

function reinterpretSingleLineAddressReply(inlineDraft, currentDraft = {}) {
  const inlineAddressValue = trim(inlineDraft?.addressLine || "", 160);
  if (!inlineAddressValue) {
    return null;
  }

  const hasStructuredInlineData = Boolean(
    trim(inlineDraft?.crossStreets || "", 160) ||
    trim(inlineDraft?.neighborhood || "", 120)
  );
  if (hasStructuredInlineData) {
    return null;
  }

  const missingFields = ["addressLine", "crossStreets", "neighborhood"].filter(
    field => !trim(currentDraft?.[field] || "", 180)
  );
  if (missingFields.length === 0) {
    return null;
  }

  if (missingFields.length === 1) {
    const targetField = missingFields[0];
    return targetField === "crossStreets"
      ? { crossStreets: trim(stripLeadingEntre(inlineAddressValue), 160) }
      : targetField === "neighborhood"
        ? { neighborhood: trim(inlineAddressValue, 120) }
        : { addressLine: trim(inlineAddressValue, 160) };
  }

  if (!trim(currentDraft?.addressLine || "", 160)) {
    return { addressLine: trim(inlineAddressValue, 160) };
  }

  if (!trim(currentDraft?.crossStreets || "", 160) && looksLikeCrossStreets(inlineAddressValue)) {
    return { crossStreets: trim(stripLeadingEntre(inlineAddressValue), 160) };
  }

  if (!trim(currentDraft?.neighborhood || "", 120) && looksLikeNeighborhood(inlineAddressValue)) {
    return { neighborhood: trim(inlineAddressValue, 120) };
  }

  return null;
}

function parseLabeledDeliveryFields(lines, allowedFields = []) {
  const draft = {};
  const allowed = new Set(allowedFields);
  for (const line of Array.isArray(lines) ? lines : []) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      continue;
    }
    const field = resolveDeliveryFieldLabel(match[1]);
    if (!field || (allowed.size > 0 && !allowed.has(field))) {
      continue;
    }
    draft[field] = trim(match[2] || "", 180);
  }
  return draft;
}

function parseInlineAddressText(rawText) {
  const text = trim(String(rawText || ""), 180);
  if (!text) {
    return {};
  }

  const inlineMatch = text.match(/^(.*?)(?:,\s*|\s+)entre\s+([^,]+?)(?:,\s*(.+))?$/i);
  if (inlineMatch) {
    return {
      addressLine: trim(stripDeliveryFieldPrefix(inlineMatch[1] || ""), 160),
      crossStreets: trim(stripLeadingEntre(inlineMatch[2] || ""), 160),
      neighborhood: trim(stripDeliveryFieldPrefix(inlineMatch[3] || ""), 120)
    };
  }

  const segments = text
    .split(/\s*[;,]\s*|\s+-\s+/)
    .map(segment => trim(stripDeliveryFieldPrefix(segment), 180))
    .filter(Boolean);

  if (segments.length >= 3) {
    return {
      addressLine: trim(segments[0], 160),
      crossStreets: trim(stripLeadingEntre(segments[1]), 160),
      neighborhood: trim(segments.slice(2).join(", "), 120)
    };
  }

  if (segments.length === 2) {
    const secondSegment = stripLeadingEntre(segments[1]);
    if (looksLikeCrossStreets(secondSegment)) {
      return {
        addressLine: trim(segments[0], 160),
        crossStreets: trim(secondSegment, 160)
      };
    }
    return {
      addressLine: trim(segments[0], 160),
      neighborhood: trim(segments[1], 120)
    };
  }

  return {
    addressLine: trim(stripDeliveryFieldPrefix(text), 160)
  };
}

function stripLeadingEntre(value) {
  return trim(String(value || "").replace(/^entre\s+/i, ""), 160);
}

function stripDeliveryFieldPrefix(value) {
  return String(value || "").replace(/^(nombre|apellido|mail|email|correo|direccion|direcci�n|entre calles|calles|barrio)\s*:?\s*/i, "");
}

function looksLikeCrossStreets(value) {
  const normalizedValue = normalize(value);
  return normalizedValue.startsWith("entre ") || (normalizedValue.includes(" y ") && normalizedValue.split(/\s+/).length <= 8);
}

function looksLikeNeighborhood(value) {
  const normalizedValue = normalize(value);
  return Boolean(normalizedValue)
    && !/\d/.test(normalizedValue)
    && !looksLikeCrossStreets(value)
    && normalizedValue.split(/\s+/).length <= 4;
}

function validateDeliveryContactDraft(draft) {
  const missingFields = [];
  const value = {
    firstName: trim(draft?.firstName || "", 80),
    lastName: trim(draft?.lastName || "", 80),
    email: trim(draft?.email || "", 120)
  };

  if (value.firstName.length < 2) missingFields.push("nombre");
  if (value.lastName.length < 2) missingFields.push("apellido");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) missingFields.push("mail");

  return {
    ok: missingFields.length === 0,
    value,
    missingFields
  };
}

function validateDeliveryAddressDraft(draft) {
  const missingFields = [];
  const value = {
    addressLine: trim(draft?.addressLine || "", 160),
    crossStreets: trim(draft?.crossStreets || "", 160),
    neighborhood: trim(draft?.neighborhood || "", 120)
  };

  if (value.addressLine.length < 5) missingFields.push("dirección");
  if (value.crossStreets.length < 4) missingFields.push("entre calles");
  if (value.neighborhood.length < 2) missingFields.push("barrio");

  return {
    ok: missingFields.length === 0,
    value,
    missingFields
  };
}

function buildRecetarioPromptText() {
  return "Antes de cerrar el pedido, ¿estás adherido al Recetario Solidario?";
}

function buildCurrentItemDraft(data, options = {}) {
  const lookup = data?.lookup || {};
  const recetarioValue = data?.recetarioAdhered;
  const includeRecetario = options.includeRecetario === true;
  const pricingScenarios = getPricingScenarios(String(lookup.productId || ""), Number(lookup.publicPrice), { includeRecetario });
  return {
    productId: String(lookup.productId || ""),
    productCode: String(lookup.productCode || ""),
    productTitle: String(lookup.title || ""),
    labTitle: String(lookup.labTitle || ""),
    brandTitle: String(lookup.brandTitle || ""),
    drugTitle: String(lookup.drugTitle || ""),
    drugCode: String(lookup.drugCode || ""),
    stockStatus: formatStockStatus(lookup.available),
    available: typeof lookup.available === "boolean" ? lookup.available : null,
    publicPrice: Number.isFinite(Number(lookup.publicPrice)) ? Number(lookup.publicPrice) : null,
    publicPriceLabel: lookup.source === "api" ? "Precio" : "Precio de referencia",
    recetario: includeRecetario && typeof recetarioValue === "boolean" ? (recetarioValue ? "Sí" : "No") : "",
    recetarioAdhered: includeRecetario && typeof recetarioValue === "boolean" ? recetarioValue : null,
    pricingScenarios,
    pricingLines: pricingScenarios.map(formatPricingScenarioLine),
    coverageNote: getProductCoverageNote(String(lookup.productId || "")),
    source: String(lookup.source || ""),
    note: String(lookup.note || ""),
    alternatives: Array.isArray(lookup.alternatives)
      ? lookup.alternatives.map(option => ({
        title: String(option?.title || ""),
        publicPrice: Number.isFinite(Number(option?.publicPrice)) ? Number(option.publicPrice) : null,
        productCode: String(option?.productCode || ""),
        drugTitle: String(option?.drugTitle || "")
      }))
      : [],
    originStep: String(options.originStep || data?.lookupSourceStep || "")
  };
}

function normalizeComparableStockText(value) {
  return normalize(String(value || "").replace(/[.:]+$/g, "").trim());
}

function buildLookupDetailsText(lookup) {
  const lines = [`Producto: ${lookup.title || "No informado"}`];

  if (lookup.labTitle || lookup.brandTitle) {
    lines.push(`Laboratorio / marca: ${[lookup.labTitle, lookup.brandTitle].filter(Boolean).join(" / ")}`);
  }

  const stockStatus = formatStockStatus(lookup.available);
  lines.push(`Stock: ${stockStatus}.`);

  if (lookup.publicPrice !== null) {
    lines.push(
      `${lookup.source === "api" ? "Precio" : "Precio de referencia"}: ${formatCurrency(lookup.publicPrice)}.`
    );
  } else {
    lines.push("Precio: pendiente.");
  }

  const stockDetail = summarizeLookupNote(lookup.note);
  if (stockDetail && normalizeComparableStockText(stockDetail) !== normalizeComparableStockText(stockStatus)) {
    lines.push(stockDetail);
  }

  if (lookup.available === false && Array.isArray(lookup.alternatives) && lookup.alternatives.length > 0) {
    lines.push("Alternativas de la misma droga:");
    lines.push(...lookup.alternatives.slice(0, 3).map(option => `- ${option.title}`));
  }

  const pricingLines = buildPricingLines(lookup, { includeRecetario: true });
  if (pricingLines.length > 0) {
    lines.push("Precios con descuentos en Delko 1:");
    lines.push(...pricingLines);
  }

  const coverageNote = getProductCoverageNote(String(lookup.productId || ""));
  if (coverageNote) {
    lines.push(`Nota: ${coverageNote}`);
  }

  return lines.join("\n");
}

function buildItemCheckoutLines(item, options = {}) {
  const lines = [`- Producto: ${item?.productTitle || "No informado"}`];
  lines.push(`  Stock: ${item?.stockStatus || "A pedido"}`);

  if (Number.isFinite(Number(item?.publicPrice))) {
    lines.push(`  Precio: ${formatCurrency(Number(item.publicPrice))}`);
  } else {
    lines.push("  Precio: pendiente");
  }

  const stockDetail = summarizeLookupNote(item?.note);
  if (stockDetail && normalizeComparableStockText(stockDetail) !== normalizeComparableStockText(item?.stockStatus || "")) {
    lines.push(`  Detalle: ${stockDetail}`);
  }

  const pricingLines = resolveItemPricingScenarios(item, options).map(formatPricingScenarioLine);
  if (pricingLines.length > 0) {
    lines.push("  Opciones de pago:");
    lines.push(...pricingLines.map(line => `  ${line}`));
  }

  if (item?.coverageNote) {
    lines.push(`  Nota: ${item.coverageNote}`);
  }

  if (item?.stockStatus === "sin stock" && Array.isArray(item?.alternatives) && item.alternatives.length > 0) {
    lines.push("  Alternativas de la misma droga:");
    lines.push(...item.alternatives.slice(0, 3).map(option => `  - ${option.title}`));
  }

  return lines;
}

function buildFinalCheckoutText(data) {
  const items = Array.isArray(data?.itemsList) ? data.itemsList : [];
  const includeRecetario = data?.recetarioAdhered === true;
  const totals = buildCartTotals(items, { includeRecetario });
  const lines = ["Resumen final:"];

  for (const item of items) {
    const itemLine = Number.isFinite(Number(item?.publicPrice))
      ? `${item.productTitle}: ${formatCurrency(item.publicPrice)}`
      : `${item.productTitle}: pendiente`;
    const stockSuffix = item?.stockStatus && item.stockStatus !== "disponible" ? ` (${item.stockStatus})` : "";
    lines.push(`- ${itemLine}${stockSuffix}`);
  }

  if (Number.isFinite(totals.listTotal)) {
    lines.push(`Total: ${formatCurrency(totals.listTotal)}`);
  }

  if (typeof data?.recetarioAdhered === "boolean") {
    lines.push(`Recetario Solidario: ${data.recetarioAdhered ? "S�" : "No"}`);
  }

  if (totals.scenarioLines.length > 0) {
    lines.push("Totales con descuentos:");
    lines.push(...totals.scenarioLines);
  }

  lines.push(`Formas de pago: ${buildPaymentFormsText(items, { includeRecetario })}`);

  if (data?.mode === "DELIVERY" && data?.deliveryDraft) {
    lines.push("Delivery:");
    lines.push(`- ${[data.deliveryDraft.firstName, data.deliveryDraft.lastName].filter(Boolean).join(" ")}`);
    lines.push(`- ${data.deliveryDraft.addressLine}`);
    lines.push(`- Entre calles: ${data.deliveryDraft.crossStreets}`);
    lines.push(`- Barrio: ${data.deliveryDraft.neighborhood}`);
    lines.push(`- Mail: ${data.deliveryDraft.email}`);
  }

  lines.push("En breve un asesor se va a comunicar por este medio para terminar la compra.");
  return lines.join("\n");
}

function resolveItemPricingScenarios(item, options = {}) {
  const includeRecetario = options.includeRecetario === true;
  const productId = String(item?.productId || "");
  const publicPrice = Number(item?.publicPrice);
  if (productId && Number.isFinite(publicPrice) && publicPrice > 0) {
    return getPricingScenarios(productId, publicPrice, { includeRecetario });
  }
  return Array.isArray(item?.pricingScenarios) ? item.pricingScenarios : [];
}

function buildCartTotals(items, options = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const scenarioMap = new Map();
  let listTotal = 0;

  for (const item of safeItems) {
    const publicPrice = Number(item?.publicPrice);
    if (Number.isFinite(publicPrice)) {
      listTotal += publicPrice;
    }

    for (const scenario of resolveItemPricingScenarios(item, options)) {
      const entry = scenarioMap.get(scenario.id) || {
        id: scenario.id,
        label: scenario.label,
        minTotal: 0,
        maxTotal: 0,
        range: false
      };

      if (Number.isFinite(Number(scenario.finalPrice))) {
        entry.minTotal += Number(scenario.finalPrice);
        entry.maxTotal += Number(scenario.finalPrice);
      } else if (Number.isFinite(Number(scenario.minPrice)) && Number.isFinite(Number(scenario.maxPrice))) {
        entry.minTotal += Number(scenario.minPrice);
        entry.maxTotal += Number(scenario.maxPrice);
        entry.range = true;
      }

      scenarioMap.set(scenario.id, entry);
    }
  }

  const scenarioLines = Array.from(scenarioMap.values())
    .sort((left, right) => left.label.localeCompare(right.label, "es"))
    .map(formatCartScenarioLine);

  return { listTotal, scenarioLines };
}

function buildPaymentFormsText(items, options = {}) {
  const labels = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    for (const scenario of resolveItemPricingScenarios(item, options)) {
      const label = normalize(String(scenario?.label || ""));
      if (label.includes("ef/transf")) {
        labels.add("efectivo / transferencia");
      }
      if (label.includes("debito")) {
        labels.add("débito");
      }
      if (label.includes("credito")) {
        labels.add("crédito");
      }
    }
  }

  return labels.size > 0 ? Array.from(labels).join(", ") : "a coordinar con el asesor";
}

function buildSummaryPayload(data) {
  const draft = data?.currentItemDraft || null;
  const cartItems = Array.isArray(data?.itemsList) ? data.itemsList : [];

  if (draft) {
    return {
      mode: String(data.mode || ""),
      orderType: String(data.orderType || ""),
      productTitle: String(draft.productTitle || ""),
      productId: String(draft.productId || ""),
      stockStatus: String(draft.stockStatus || "A pedido"),
      publicPrice: Number.isFinite(Number(draft.publicPrice)) ? Number(draft.publicPrice) : null,
      publicPriceLabel: String(draft.publicPriceLabel || "Precio"),
      recetario: "",
      referencePricing: null,
      pricingLines: [],
      coverageNote: String(draft.coverageNote || ""),
      note: String(draft.note || ""),
      alternatives: Array.isArray(draft.alternatives) ? draft.alternatives : [],
      alternatives: Array.isArray(draft.alternatives) ? draft.alternatives : [],
      cartItems: cartItems.length + 1,
      items: [...cartItems, draft].map(item => ({
        productTitle: String(item?.productTitle || ""),
        stockStatus: String(item?.stockStatus || ""),
        publicPrice: Number.isFinite(Number(item?.publicPrice)) ? Number(item.publicPrice) : null,
        note: String(item?.note || ""),
        coverageNote: String(item?.coverageNote || ""),
        alternatives: Array.isArray(item?.alternatives) ? item.alternatives : []
      }))
    };
  }

  const includeRecetario = data?.recetarioAdhered === true;
  const totals = buildCartTotals(cartItems, { includeRecetario });
  return {
    mode: String(data.mode || ""),
    orderType: String(data.orderType || ""),
    productTitle: "",
    productId: "",
    stockStatus: "",
    publicPrice: Number.isFinite(Number(totals.listTotal)) ? Number(totals.listTotal) : null,
    publicPriceLabel: "Total",
    recetario: typeof data?.recetarioAdhered === "boolean" ? (data.recetarioAdhered ? "Sí" : "No") : "",
    referencePricing: null,
    pricingLines: typeof data?.recetarioAdhered === "boolean" ? totals.scenarioLines : [],
    coverageNote: "",
    note: "",
    cartItems: cartItems.length,
    items: cartItems.map(item => ({
      productTitle: String(item?.productTitle || ""),
      stockStatus: String(item?.stockStatus || ""),
      publicPrice: Number.isFinite(Number(item?.publicPrice)) ? Number(item.publicPrice) : null,
      note: String(item?.note || ""),
      coverageNote: String(item?.coverageNote || ""),
      alternatives: Array.isArray(item?.alternatives) ? item.alternatives : []
    }))
  };
}

function summarizeLookupNote(note) {
  const value = String(note || "").trim();
  if (!value) {
    return "";
  }
  if (/^Stock:\s*/i.test(value)) {
    return value.replace(/^Stock:\s*/i, "");
  }
  if (/^Stock por sucursal:\s*/i.test(value)) {
    return value.replace(/^Stock por sucursal:\s*/i, "");
  }
  return value;
}

function buildOperationalSummaryText(data) {
  const summary = data.currentSummary || buildSummaryPayload(data);
  const hasDraft = Boolean(data?.currentItemDraft?.productTitle);
  const allowsAddMore = allowsSummaryAddMore(data);
  const lines = [];

  if (hasDraft) {
    lines.push("Revisá este producto:");
    lines.push(`- Producto: ${summary.productTitle || "No informado"}`);
    lines.push(`- Stock: ${summary.stockStatus || "A pedido"}`);

    const stockDetail = summarizeLookupNote(summary.note);
    if (stockDetail && normalize(stockDetail) !== normalize(summary.stockStatus || "")) {
      lines.push(`- Detalle: ${stockDetail}`);
    }

    if (summary.publicPrice !== null) {
      lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
    }
    if (summary.coverageNote) {
      lines.push(`- Nota: ${summary.coverageNote}`);
    }
    if (summary.stockStatus === "sin stock" && Array.isArray(summary.alternatives) && summary.alternatives.length > 0) {
      lines.push("- Alternativas de la misma droga:");
      lines.push(...summary.alternatives.slice(0, 3).map(option => `  ${option.title}`));
    }
    lines.push(`- Productos en el pedido: ${summary.cartItems || 1}`);
    lines.push(allowsAddMore ? "¿Querés agregar algo más o terminar la compra?" : "¿Querés terminar la compra?");
    return lines.join("\n");
  }

  lines.push("Revisá tu pedido:");
  for (const item of Array.isArray(summary.items) ? summary.items : []) {
    const itemLine = Number.isFinite(Number(item?.publicPrice))
      ? `${item.productTitle}: ${formatCurrency(item.publicPrice)}`
      : `${item.productTitle}: pendiente`;
    const stockSuffix = item?.stockStatus && item.stockStatus !== "disponible" ? ` (${item.stockStatus})` : "";
    lines.push(`- ${itemLine}${stockSuffix}`);
  }

  if (summary.publicPrice !== null) {
    lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
  }

  if (summary.recetario) {
    lines.push(`- Recetario Solidario: ${summary.recetario}`);
  }

  if (Array.isArray(summary.pricingLines) && summary.pricingLines.length > 0) {
    lines.push("Totales con descuentos:");
    lines.push(...summary.pricingLines);
  }

  lines.push(allowsAddMore ? "¿Querés agregar algo más o terminar la compra?" : "¿Querés terminar la compra?");
  return lines.join("\n");
}

function summaryButtons(data) {
  const hasCart = Boolean(data?.currentItemDraft?.productTitle) || (Array.isArray(data?.itemsList) && data.itemsList.length > 0);
  if (!hasCart) {
    return [buildBackButton()];
  }

  if (!allowsSummaryAddMore(data)) {
    return [
      { id: "summary_finish", title: "Terminar compra" },
      buildBackButton()
    ];
  }

  return [
    { id: "summary_add_more", title: "Agregar algo más" },
    { id: "summary_finish", title: "Terminar compra" },
    buildBackButton()
  ];
}

function goBackFromRecetario(session, runtime, flowEngine) {
  delete session.data.currentSummary;
  delete session.data.referencePricing;
  delete session.data.recetarioAdhered;

  if (session.data?.currentItemDraft?.productTitle || (Array.isArray(session.data?.itemsList) && session.data.itemsList.length > 0)) {
    move(session, STEP.SUMMARY);
    return buildSummaryActions(session.data);
  }

  const returnStep = session.data?.lookupSourceStep || (session.data?.orderType === "PARTICULAR" ? STEP.PARTICULAR_INPUT : STEP.ITEM_INPUT);
  if (returnStep === STEP.CART_INPUT) {
    clearLookupData(session);
    move(session, STEP.CART_INPUT);
    return buildCartInputActions("Perfecto. Escribime el producto otra vez.");
  }

  if (returnStep === STEP.PARTICULAR_INPUT) {
    clearLookupData(session);
    move(session, STEP.PARTICULAR_INPUT);
    return buildParticularInputActions(runtime);
  }

  restoreProductWizardFromLookup(session);
  move(session, resolveStep(flowEngine, STEP.ITEM_INPUT, STEP.ITEM_INPUT));
  return buildCurrentWizardPrompt(session, runtime);
}

function goBackFromSummary(session, runtime, flowEngine) {
  delete session.data.currentSummary;
  const origin = session.data?.currentItemDraft?.originStep || "";

  if (origin === STEP.CART_INPUT) {
    delete session.data.currentItemDraft;
    clearLookupData(session);
    move(session, STEP.CART_INPUT);
    return buildCartInputActions(buildFreeTextRewritePrompt(STEP.CART_INPUT, getProductSearchMode(session)), session, runtime);
  }

  if (origin === STEP.PARTICULAR_INPUT) {
    delete session.data.currentItemDraft;
    clearLookupData(session);
    move(session, STEP.PARTICULAR_INPUT);
    return buildParticularInputActions(runtime, session);
  }

  if (origin === STEP.ITEM_INPUT) {
    delete session.data.currentItemDraft;
    restoreProductWizardFromLookup(session);
    move(session, resolveStep(flowEngine, STEP.ITEM_INPUT, STEP.ITEM_INPUT));
    return buildCurrentWizardPrompt(session, runtime);
  }

  if (Array.isArray(session.data?.itemsList) && session.data.itemsList.length > 0) {
    move(session, STEP.CART_INPUT);
    return buildCartInputActions("", session, runtime);
  }

  return buildParticularInputActions(runtime, session);
}

function sanitizeActions(actions) {
  return Array.isArray(actions) ? actions.filter(Boolean).map(action => sanitizeActionValue(action)) : [];
}

function sanitizeActionValue(value, key = "") {
  if (typeof value === "string") {
    return shouldSanitizeTextKey(key) ? sanitizeVisibleText(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeActionValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    next[nestedKey] = sanitizeActionValue(nestedValue, nestedKey);
  }
  return next;
}

function shouldSanitizeTextKey(key) {
  return !["id", "type", "interactiveType", "payload"].includes(String(key || ""));
}

function sanitizeVisibleText(value) {
  let result = String(value || "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!/[??]/.test(result)) {
      break;
    }
    try {
      const repaired = Buffer.from(result, "latin1").toString("utf8");
      if (!repaired || repaired === result) {
        break;
      }
      result = repaired;
    } catch (_error) {
      break;
    }
  }

  result = result.replace(/[   ⁠]/g, " ");
  result = repairBrokenSpanish(result);
  result = normalizeUiFragments(result);
  return result;
}

function repairBrokenSpanish(value) {
  let result = String(value || "");
  const replacements = [
    ["�C�mo", "¿Cómo"],
    ["�Qu�", "¿Qué"],
    ["�Quer�s", "¿Querés"],
    ["�Est�s", "¿Estás"],
    ["�Quisiste", "¿Quisiste"],
    ["hab�amos", "habíamos"],
    ["quer�s", "querés"],
    ["queres", "querés"],
    ["escrib�", "escribí"],
    ["Envi�mela", "Enviámela"],
    ["Envi�", "Enviá"],
    ["ac�", "acá"],
    ["est�", "está"],
    ["revisi�n", "revisión"],
    ["operaci�n", "operación"],
    ["opci�n", "opción"],
    ["direcci�n", "dirección"],
    ["d�bito", "débito"],
    ["cr�dito", "crédito"],
    ["P�gina", "Página"],
    ["m�s", "más"],
    ["continuar�", "continuará"],
    ["atender�", "atenderá"],
    ["S�", "Sí"],
    ["Eleg�", "Elegí"],
    ["Respond�", "Respondé"],
    ["Toc�", "Tocá"],
    ["Revis�", "Revisá"],
    ["Pod�s", "Podés"],
    ["prefer�s", "preferís"],
    ["necesit�s", "necesitás"],
    ["entend�", "entendí"],
    ["volv�", "volvé"],
    ["men�", "menú"],
    ["d�a", "día"],
    ["ah�", "ahí"],
    ["complet�", "completá"],
    ["eleg�", "elegí"],
    ["encontr�", "encontré"],
    ["presentaci�n", "presentación"],
    ["atr�s", "atrás"],
    ["Respondeme", "Respondéme"],
    ["si, no o volv� a escribir", "sí, no o volvé a escribir"],
    ["?C?mo", "¿Cómo"],
    ["?Qu?", "¿Qué"],
    ["?Quer?s", "¿Querés"],
    ["?Est?s", "¿Estás"],
    ["?Quisiste", "¿Quisiste"],
    ["hab?amos", "habíamos"],
    ["quer?s", "querés"],
    ["escrib?", "escribí"],
    ["Envi?mela", "Enviámela"],
    ["Envi?", "Enviá"],
    ["ac?", "acá"],
    ["est?", "está"],
    ["revisi?n", "revisión"],
    ["operaci?n", "operación"],
    ["opci?n", "opción"],
    ["direcci?n", "dirección"],
    ["d?bito", "débito"],
    ["cr?dito", "crédito"],
    ["P?gina", "Página"],
    ["m?s", "más"],
    ["S?", "Sí"],
    ["Eleg?", "Elegí"],
    ["Respond?", "Respondé"],
    ["Toc?", "Tocá"],
    ["Revis?", "Revisá"],
    ["Pod?s", "Podés"],
    ["prefer?s", "preferís"],
    ["necesit?s", "necesitás"],
    ["entend?", "entendí"],
    ["volv?", "volvé"],
    ["men?", "menú"],
    ["d?a", "día"],
    ["ah?", "ahí"],
    ["complet?", "completá"],
    ["eleg?", "elegí"],
    ["encontr?", "encontré"],
    ["presentaci?n", "presentación"],
    ["atr?s", "atrás"]
  ];

  for (const [from, to] of replacements) {
    result = result.split(from).join(to);
  }

  return result;
}

function normalizeUiFragments(value) {
  let result = String(value || "");
  const replacements = [
    ["Revisa este producto:", "Revisá este producto:"],
    ["Revisa tu pedido:", "Revisá tu pedido:"],
    ["Que necesitas?", "¿Qué necesitás?"],
    ["Que queres agregar?", "¿Qué querés agregar?"],
    ["Estas adherido al Recetario Solidario?", "¿Estás adherido al Recetario Solidario?"],
    ["Si queres volver, toca Volver al menu anterior.", "Si querés volver, tocá Volver al menú anterior."],
    ["Estas opciones", "estas opciones"],
    ["Pagina ", "Página "]
  ];

  for (const [from, to] of replacements) {
    result = result.split(from).join(to);
  }

  return result;
}

function buildSummaryPayload(data) {
  const draft = data?.currentItemDraft || null;
  const cartItems = Array.isArray(data?.itemsList) ? data.itemsList : [];

  if (draft) {
    return {
      mode: String(data.mode || ""),
      orderType: String(data.orderType || ""),
      productTitle: String(draft.productTitle || ""),
      productId: String(draft.productId || ""),
      stockStatus: String(draft.stockStatus || "A pedido"),
      publicPrice: Number.isFinite(Number(draft.publicPrice)) ? Number(draft.publicPrice) : null,
      publicPriceLabel: String(draft.publicPriceLabel || "Precio"),
      recetario: "",
      referencePricing: null,
      pricingLines: Array.isArray(draft.pricingLines) ? draft.pricingLines : [],
      coverageNote: String(draft.coverageNote || ""),
      note: String(draft.note || ""),
      alternatives: Array.isArray(draft.alternatives) ? draft.alternatives : [],
      cartItems: cartItems.length + 1,
      items: [...cartItems, draft].map(item => ({
        productTitle: String(item?.productTitle || ""),
        stockStatus: String(item?.stockStatus || ""),
        publicPrice: Number.isFinite(Number(item?.publicPrice)) ? Number(item.publicPrice) : null,
        note: String(item?.note || ""),
        coverageNote: String(item?.coverageNote || ""),
        pricingScenarios: Array.isArray(item?.pricingScenarios) ? item.pricingScenarios : [],
        alternatives: Array.isArray(item?.alternatives) ? item.alternatives : []
      }))
    };
  }

  const includeRecetario = data?.recetarioAdhered === true;
  const totals = buildCartTotals(cartItems, { includeRecetario });
  return {
    mode: String(data.mode || ""),
    orderType: String(data.orderType || ""),
    productTitle: "",
    productId: "",
    stockStatus: "",
    publicPrice: Number.isFinite(Number(totals.listTotal)) ? Number(totals.listTotal) : null,
    publicPriceLabel: "Total",
    recetario: typeof data?.recetarioAdhered === "boolean" ? (data.recetarioAdhered ? "Sí" : "No") : "",
    referencePricing: null,
    pricingLines: totals.scenarioLines,
    coverageNote: "",
    note: "",
    cartItems: cartItems.length,
    items: cartItems.map(item => ({
      productTitle: String(item?.productTitle || ""),
      stockStatus: String(item?.stockStatus || ""),
      publicPrice: Number.isFinite(Number(item?.publicPrice)) ? Number(item.publicPrice) : null,
      note: String(item?.note || ""),
      coverageNote: String(item?.coverageNote || ""),
      pricingScenarios: Array.isArray(item?.pricingScenarios) ? item.pricingScenarios : [],
      alternatives: Array.isArray(item?.alternatives) ? item.alternatives : []
    }))
  };
}

function buildOperationalSummaryText(data) {
  const summary = data.currentSummary || buildSummaryPayload(data);
  const hasDraft = Boolean(data?.currentItemDraft?.productTitle);
  const lines = [];

  if (hasDraft) {
    lines.push("Revisá este producto:");
    lines.push(`- Producto: ${summary.productTitle || "No informado"}`);
    lines.push(`- Stock: ${summary.stockStatus || "A pedido"}`);

    const stockDetail = summarizeLookupNote(summary.note);
    if (stockDetail && normalizeComparableStockText(stockDetail) !== normalizeComparableStockText(summary.stockStatus || "")) {
      lines.push(`- Detalle: ${stockDetail}`);
    }

    if (summary.publicPrice !== null) {
      lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
    }
    if (Array.isArray(summary.pricingLines) && summary.pricingLines.length > 0) {
      lines.push("- Opciones de pago:");
      lines.push(...summary.pricingLines.map(line => `  ${line}`));
    }
    if (summary.coverageNote) {
      lines.push(`- Nota: ${summary.coverageNote}`);
    }
    if (summary.stockStatus === "sin stock" && Array.isArray(summary.alternatives) && summary.alternatives.length > 0) {
      lines.push("- Alternativas de la misma droga:");
      lines.push(...summary.alternatives.slice(0, 3).map(option => `  ${option.title}`));
    }
    lines.push(`- Productos en el pedido: ${summary.cartItems || 1}`);
    lines.push("¿Querés agregar algo más o terminar la compra?");
    return lines.join("\n");
  }

  lines.push("Revisá tu pedido:");
  for (const item of Array.isArray(summary.items) ? summary.items : []) {
    lines.push(...buildItemCheckoutLines(item, { includeRecetario: data?.recetarioAdhered === true }));
  }

  if (summary.publicPrice !== null) {
    lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
  }

  if (summary.recetario) {
    lines.push(`- Recetario Solidario: ${summary.recetario}`);
  }

  if (Array.isArray(summary.pricingLines) && summary.pricingLines.length > 0) {
    lines.push("Totales con descuentos:");
    lines.push(...summary.pricingLines);
  }

  lines.push(`- Formas de pago: ${buildPaymentFormsText(Array.isArray(data?.itemsList) ? data.itemsList : [], { includeRecetario: data?.recetarioAdhered === true })}`);
  lines.push("¿Querés agregar algo más o terminar la compra?");
  return lines.join("\n");
}

function snapshotSessionData(data) {
  const input = data && typeof data === "object" ? data : {};
  const itemsList = Array.isArray(input.itemsList) ? input.itemsList : [];
  const delivery = input.deliveryDraft && typeof input.deliveryDraft === "object" ? input.deliveryDraft : {};
  return {
    mode: String(input.mode || ""),
    zone: String(delivery.neighborhood || ""),
    address: String(delivery.addressLine || ""),
    branch: "Delko 1",
    orderType: String(input.orderType || ""),
    recipes: Number(input.recipes || 0),
    items: Number(input.items || itemsList.length || 0),
    waitingAdvisor: Boolean(input.waitingAdvisor),
    advisorHandoffReason: String(input.advisorHandoffReason || ""),
    manualAdvisorIntervened: Boolean(input.manualAdvisorIntervened),
    finalized: Boolean(input.finalized),
    automationMode: String(input.automationMode || ""),
    initialWelcomeSent: Boolean(input.initialWelcomeSent)
  };
}

function resetSessions() {
  sessions.clear();
  profiles.clear();
  recentInboundFingerprints.clear();
}

async function resetContactState(contactId, options = {}) {
  if (!contactId) {
    return;
  }

  const preserveProfile = Boolean(options && options.preserveProfile);
  let restoredProfile = null;

  if (preserveProfile) {
    for (const candidate of buildSessionContactCandidates(contactId)) {
      const existingProfile = profiles.get(candidate);
      if (existingProfile && typeof existingProfile === "object") {
        restoredProfile = JSON.parse(JSON.stringify(existingProfile));
        break;
      }

      if (KV_ENABLED) {
        const payload = await kvGetJson(buildStateKey(candidate));
        if (payload?.profile && typeof payload.profile === "object") {
          restoredProfile = JSON.parse(JSON.stringify(payload.profile));
          break;
        }
      }
    }
  }

  for (const candidate of buildSessionContactCandidates(contactId)) {
    sessions.delete(candidate);
    profiles.delete(candidate);
    recentInboundFingerprints.delete(candidate);
    for (const key of Array.from(recentInboundFingerprints.keys())) {
      if (String(key).startsWith(`${candidate}::`)) {
        recentInboundFingerprints.delete(key);
      }
    }
    await kvDelete(buildStateKey(candidate));
  }

  const restoredSession = {
    state: S.IDLE,
    step: null,
    lastTransition: null,
    data: {},
    fallback: 0,
    updatedAt: Date.now()
  };
  const profileToPersist = preserveProfile && restoredProfile ? restoredProfile : null;

  for (const candidate of buildSessionContactCandidates(contactId)) {
    sessions.set(candidate, {
      state: restoredSession.state,
      step: restoredSession.step,
      lastTransition: restoredSession.lastTransition,
      data: {},
      fallback: restoredSession.fallback,
      updatedAt: restoredSession.updatedAt
    });
    if (profileToPersist) {
      profiles.set(candidate, JSON.parse(JSON.stringify(profileToPersist)));
    }
    await persistState(candidate, sessions.get(candidate), profileToPersist);
  }
}

async function getContactConversationState(contactId) {
  if (!contactId) {
    return null;
  }

  await hydrateState(contactId);
  const session = getSession(contactId);
  return {
    state: session.state,
    step: session.step,
    sessionData: snapshotSessionData(session.data)
  };
}

async function closeContactConversation(contactId) {
  if (!contactId) {
    return null;
  }

  await hydrateState(contactId);
  const session = getSession(contactId);
  const profile = getProfile(contactId);
  const sessionData = {
    ...snapshotSessionData(session.data),
    waitingAdvisor: false,
    advisorHandoffReason: "",
    manualAdvisorIntervened: false
  };

  resetSession(session);
  touchSession(contactId, session);
  await persistState(contactId, session, profile);
  return sessionData;
}

async function enterInitialBotMode(
  contactId,
  { contactName, welcomeAlreadySent = false, attendedByHuman = false } = {}
) {
  if (!contactId) {
    return null;
  }

  await hydrateState(contactId);
  cleanupExpiredSessions();
  const session = getSession(contactId);
  const profile = getProfile(contactId, contactName);
  const currentData = session.data && typeof session.data === "object" ? session.data : {};

  if (attendedByHuman) {
    resetSession(session);
    session.state = S.AGENT;
    session.step = null;
    session.lastTransition = null;
    session.fallback = 0;
    session.data = {
      automationMode: "initial",
      initialWelcomeSent: true,
      waitingAdvisor: false,
      advisorHandoffReason: "manual_advisor",
      manualAdvisorIntervened: true,
      finalized: false
    };

    touchSession(contactId, session);
    await persistState(contactId, session, profile);
    return {
      shouldSendWelcome: false,
      state: buildSessionSnapshot(session),
      sessionData: snapshotSessionData(session.data)
    };
  }

  if (currentData.manualAdvisorIntervened) {
    return {
      shouldSendWelcome: false,
      state: buildSessionSnapshot(session),
      sessionData: snapshotSessionData(currentData)
    };
  }

  if (currentData.automationMode === "initial" && currentData.initialWelcomeSent) {
    return {
      shouldSendWelcome: false,
      state: buildSessionSnapshot(session),
      sessionData: snapshotSessionData(currentData)
    };
  }

  resetSession(session);
  session.state = S.AGENT;
  session.step = null;
  session.lastTransition = null;
  session.fallback = 0;
  session.data = {
    automationMode: "initial",
    initialWelcomeSent: true,
    waitingAdvisor: true,
    advisorHandoffReason: "bot_initial_welcome",
    manualAdvisorIntervened: false,
    finalized: false
  };

  touchSession(contactId, session);
  await persistState(contactId, session, profile);

  return {
    shouldSendWelcome: !welcomeAlreadySent,
    state: buildSessionSnapshot(session),
    sessionData: snapshotSessionData(session.data)
  };
}

async function markAdvisorManualControl(contactId) {
  if (!contactId) {
    return null;
  }

  await hydrateState(contactId);
  const session = getSession(contactId);
  const profile = getProfile(contactId);

  if (!session.data || typeof session.data !== "object") {
    session.data = {};
  }

  session.state = S.AGENT;
  session.step = null;
  session.lastTransition = null;
  session.fallback = 0;
  session.data.waitingAdvisor = false;
  session.data.manualAdvisorIntervened = true;
  session.data.finalized = false;
  if (!String(session.data.advisorHandoffReason || "").trim()) {
    session.data.advisorHandoffReason = "manual_advisor";
  }

  touchSession(contactId, session);
  await persistState(contactId, session, profile);
  return snapshotSessionData(session.data);
}

async function forceParticularSearchFlow(contactId, { contactName, mode = "DELIVERY" } = {}) {
  if (!contactId) {
    return null;
  }

  await hydrateState(contactId);
  const session = getSession(contactId);
  const profile = getProfile(contactId, contactName);

  initializeOrder(session, String(mode || "DELIVERY").trim().toUpperCase() === "MOSTRADOR" ? "MOSTRADOR" : "DELIVERY");
  session.data.orderType = "PARTICULAR";
  session.data.waitingAdvisor = false;
  session.data.advisorHandoffReason = "";
  session.data.manualAdvisorIntervened = false;
  session.data.finalized = false;
  if (hasRecentProductHistory(profile)) {
    enableRecentProductHistoryOffer(session);
  } else {
    clearRecentProductHistoryOffer(session);
  }
  move(session, STEP.PARTICULAR_SEARCH_MODE);
  touchSession(contactId, session);
  await persistState(contactId, session, profile);
  return buildSessionSnapshot(session);
}

async function rememberExternalPromptActions(contactId, actions) {
  if (!contactId) {
    return null;
  }

  await hydrateState(contactId);
  const session = getSession(contactId);
  const profile = getProfile(contactId);
  const sanitizedActions = sanitizeActions(Array.isArray(actions) ? actions : [actions]);
  if (extractPromptChoices(sanitizedActions).length === 0) {
    return snapshotSessionData(session.data);
  }
  rememberPromptChoices(session, sanitizedActions);
  touchSession(contactId, session);
  await persistState(contactId, session, profile);
  return snapshotSessionData(session.data);
}

function buildPromptChoiceFingerprint(contactId) {
  const session = sessions.get(contactId);
  const promptChoices = Array.isArray(session?.data?.promptChoices) ? session.data.promptChoices : [];
  const choiceSignature = promptChoices
    .map(choice => String(choice?.id || "").trim())
    .filter(Boolean)
    .join("|");

  return [
    String(session?.state || ""),
    String(session?.step || ""),
    String(session?.data?.mode || ""),
    String(session?.data?.orderType || ""),
    choiceSignature
  ]
    .filter(Boolean)
    .join("::");
}

function markInboundFingerprint(contactId, text, timestamp = Date.now()) {
  const normalizedText = normalizeChoiceLabel(text);
  if (!contactId || !normalizedText) {
    return false;
  }

  const safeTimestamp = Number(timestamp || 0) > 0 ? Number(timestamp) : Date.now();
  const promptFingerprint = buildPromptChoiceFingerprint(contactId);
  const key = `${contactId}::${promptFingerprint || "no_prompt"}::${normalizedText}`;
  const coarseKey = `${contactId}::__coarse__::${normalizedText}`;
  const previous = Number(recentInboundFingerprints.get(key) || 0);
  const shouldUseCoarseFingerprint = !/^[a-z]$/i.test(normalizedText);
  const coarsePrevious = shouldUseCoarseFingerprint ? Number(recentInboundFingerprints.get(coarseKey) || 0) : 0;
  recentInboundFingerprints.set(key, safeTimestamp);
  if (shouldUseCoarseFingerprint) {
    recentInboundFingerprints.set(coarseKey, safeTimestamp);
  }
  return (
    (previous > 0 && Math.abs(safeTimestamp - previous) <= DUPLICATE_INBOUND_WINDOW_MS) ||
    (shouldUseCoarseFingerprint &&
      coarsePrevious > 0 &&
      Math.abs(safeTimestamp - coarsePrevious) <= COARSE_DUPLICATE_INBOUND_WINDOW_MS)
  );
}

function sanitizeVisibleText(value) {
  let result = String(value || "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!/[\u00c3\u00c2]/.test(result)) {
      break;
    }
    try {
      const repaired = Buffer.from(result, "latin1").toString("utf8");
      if (!repaired || repaired === result) {
        break;
      }
      result = repaired;
    } catch (_error) {
      break;
    }
  }

  result = result.replace(/[\u00a0\u202f\u2007\u2060]/g, " ");
  result = repairBrokenSpanish(result);
  result = normalizeUiFragments(result);
  return result;
}

function repairBrokenSpanish(value) {
  let result = String(value || "");
  const replacements = [
    ["\ufffdC\ufffdmo", "\u00bfC\u00f3mo"],
    ["\ufffdQu\ufffd", "\u00bfQu\u00e9"],
    ["\ufffdQuer\ufffds", "\u00bfQuer\u00e9s"],
    ["\ufffdEst\ufffds", "\u00bfEst\u00e1s"],
    ["\ufffdQuisiste", "\u00bfQuisiste"],
    ["hab\ufffdamos", "hab\u00edamos"],
    ["quer\ufffds", "quer\u00e9s"],
    ["queres", "quer\u00e9s"],
    ["escrib\ufffd", "escrib\u00ed"],
    ["Envi\ufffdmela", "Envi\u00e1mela"],
    ["Envi\ufffd", "Envi\u00e1"],
    ["ac\ufffd", "ac\u00e1"],
    ["est\ufffd", "est\u00e1"],
    ["revisi\ufffdn", "revisi\u00f3n"],
    ["operaci\ufffdn", "operaci\u00f3n"],
    ["opci\ufffdn", "opci\u00f3n"],
    ["direcci\ufffdn", "direcci\u00f3n"],
    ["d\ufffdbito", "d\u00e9bito"],
    ["cr\ufffddito", "cr\u00e9dito"],
    ["P\ufffdgina", "P\u00e1gina"],
    ["m\ufffds", "m\u00e1s"],
    ["continuar\ufffd", "continuar\u00e1"],
    ["atender\ufffd", "atender\u00e1"],
    ["S\ufffd", "S\u00ed"],
    ["Eleg\ufffd", "Eleg\u00ed"],
    ["Respond\ufffd", "Respond\u00e9"],
    ["Toc\ufffd", "Toc\u00e1"],
    ["Revis\ufffd", "Revis\u00e1"],
    ["Pod\ufffds", "Pod\u00e9s"],
    ["prefer\ufffds", "prefer\u00eds"],
    ["necesit\ufffds", "necesit\u00e1s"],
    ["entend\ufffd", "entend\u00ed"],
    ["volv\ufffd", "volv\u00e9"],
    ["men\ufffd", "men\u00fa"],
    ["d\ufffda", "d\u00eda"],
    ["ah\ufffd", "ah\u00ed"],
    ["complet\ufffd", "complet\u00e1"],
    ["eleg\ufffd", "eleg\u00ed"],
    ["encontr\ufffd", "encontr\u00e9"],
    ["presentaci\ufffdn", "presentaci\u00f3n"],
    ["atr\ufffds", "atr\u00e1s"],
    ["?C?mo", "\u00bfC\u00f3mo"],
    ["?Qu?", "\u00bfQu\u00e9"],
    ["?Quer?s", "\u00bfQuer\u00e9s"],
    ["?Est?s", "\u00bfEst\u00e1s"],
    ["?Quisiste", "\u00bfQuisiste"],
    ["hab?amos", "hab\u00edamos"],
    ["quer?s", "quer\u00e9s"],
    ["escrib?", "escrib\u00ed"],
    ["Envi?mela", "Envi\u00e1mela"],
    ["Envi?", "Envi\u00e1"],
    ["ac?", "ac\u00e1"],
    ["est?", "est\u00e1"],
    ["revisi?n", "revisi\u00f3n"],
    ["operaci?n", "operaci\u00f3n"],
    ["opci?n", "opci\u00f3n"],
    ["direcci?n", "direcci\u00f3n"],
    ["d?bito", "d\u00e9bito"],
    ["cr?dito", "cr\u00e9dito"],
    ["P?gina", "P\u00e1gina"],
    ["m?s", "m\u00e1s"],
    ["S?", "S\u00ed"],
    ["Eleg?", "Eleg\u00ed"],
    ["Respond?", "Respond\u00e9"],
    ["Toc?", "Toc\u00e1"],
    ["Revis?", "Revis\u00e1"],
    ["Pod?s", "Pod\u00e9s"],
    ["c\ufffdmodo", "c\u00f3modo"],
    ["c?modo", "c\u00f3modo"],
    ["prefer?s", "prefer\u00eds"],
    ["necesit?s", "necesit\u00e1s"],
    ["entend?", "entend\u00ed"],
    ["volv?", "volv\u00e9"],
    ["men?", "men\u00fa"],
    ["d?a", "d\u00eda"],
    ["ah?", "ah\u00ed"],
    ["complet?", "complet\u00e1"],
    ["eleg?", "eleg\u00ed"],
    ["encontr?", "encontr\u00e9"],
    ["presentaci?n", "presentaci\u00f3n"],
    ["atr?s", "atr\u00e1s"],
  ];

  for (const [from, to] of replacements) {
    result = result.split(from).join(to);
  }

  return result;
}

function normalizeUiFragments(value) {
  let result = String(value || "");
  const replacements = [
    ["Revisa este producto:", "Revis\u00e1 este producto:"],
    ["Revisa tu pedido:", "Revis\u00e1 tu pedido:"],
    ["Que necesitas?", "\u00bfQu\u00e9 necesit\u00e1s?"],
    ["Que queres agregar?", "\u00bfQu\u00e9 quer\u00e9s agregar?"],
    ["Estas adherido al Recetario Solidario?", "\u00bfEst\u00e1s adherido al Recetario Solidario?"],
    ["\u00bfestas adherido al Recetario Solidario?", "\u00bfEst\u00e1s adherido al Recetario Solidario?"],
    ["\u00bfest\u00e1s adherido al Recetario Solidario?", "\u00bfEst\u00e1s adherido al Recetario Solidario?"],
    ["\ufffdest\ufffds adherido al Recetario Solidario?", "\u00bfEst\u00e1s adherido al Recetario Solidario?"],
    ["Si queres volver, toca Volver al menu anterior.", "Si quer\u00e9s volver, toc\u00e1 Volver al men\u00fa anterior."],
    ["Si queres volver, elegi una opcion.", "Si quer\u00e9s volver, eleg\u00ed una opci\u00f3n."],
    ["Estas opciones", "estas opciones"],
    ["Pagina ", "P\u00e1gina "]
  ];

  for (const [from, to] of replacements) {
    result = result.split(from).join(to);
  }

  return result;
}

function buildSummaryPayload(data) {
  const draft = data?.currentItemDraft || null;
  const cartItems = Array.isArray(data?.itemsList) ? data.itemsList : [];

  if (draft) {
    return {
      mode: String(data.mode || ""),
      orderType: String(data.orderType || ""),
      productTitle: String(draft.productTitle || ""),
      productId: String(draft.productId || ""),
      stockStatus: String(draft.stockStatus || "A pedido"),
      publicPrice: Number.isFinite(Number(draft.publicPrice)) ? Number(draft.publicPrice) : null,
      publicPriceLabel: String(draft.publicPriceLabel || "Precio"),
      recetario: "",
      referencePricing: null,
      pricingLines: Array.isArray(draft.pricingLines) ? draft.pricingLines : [],
      coverageNote: String(draft.coverageNote || ""),
      note: String(draft.note || ""),
      cartItems: cartItems.length + 1,
      items: [...cartItems, draft].map(item => ({
        productTitle: String(item?.productTitle || ""),
        stockStatus: String(item?.stockStatus || ""),
        publicPrice: Number.isFinite(Number(item?.publicPrice)) ? Number(item.publicPrice) : null,
        note: String(item?.note || ""),
        coverageNote: String(item?.coverageNote || ""),
        pricingScenarios: Array.isArray(item?.pricingScenarios) ? item.pricingScenarios : [],
        alternatives: Array.isArray(item?.alternatives) ? item.alternatives : []
      }))
    };
  }

  const includeRecetario = data?.recetarioAdhered === true;
  const totals = buildCartTotals(cartItems, { includeRecetario });
  return {
    mode: String(data.mode || ""),
    orderType: String(data.orderType || ""),
    productTitle: "",
    productId: "",
    stockStatus: "",
    publicPrice: Number.isFinite(Number(totals.listTotal)) ? Number(totals.listTotal) : null,
    publicPriceLabel: "Total",
    recetario: typeof data?.recetarioAdhered === "boolean" ? (data.recetarioAdhered ? "Sí" : "No") : "",
    referencePricing: null,
    pricingLines: typeof data?.recetarioAdhered === "boolean" ? totals.scenarioLines : [],
    coverageNote: "",
    note: "",
    cartItems: cartItems.length,
    items: cartItems.map(item => ({
      productTitle: String(item?.productTitle || ""),
      stockStatus: String(item?.stockStatus || ""),
      publicPrice: Number.isFinite(Number(item?.publicPrice)) ? Number(item.publicPrice) : null,
      note: String(item?.note || ""),
      coverageNote: String(item?.coverageNote || ""),
      pricingScenarios: Array.isArray(item?.pricingScenarios) ? item.pricingScenarios : [],
      alternatives: Array.isArray(item?.alternatives) ? item.alternatives : []
    }))
  };
}

function buildOperationalSummaryText(data) {
  const summary = data.currentSummary || buildSummaryPayload(data);
  const hasDraft = Boolean(data?.currentItemDraft?.productTitle);
  const lines = [];

  if (hasDraft) {
    lines.push("Revisá este producto:");
    lines.push(`- Producto: ${summary.productTitle || "No informado"}`);
    lines.push(`- Stock: ${summary.stockStatus || "A pedido"}`);

    const stockDetail = summarizeLookupNote(summary.note);
    if (stockDetail && normalizeComparableStockText(stockDetail) !== normalizeComparableStockText(summary.stockStatus || "")) {
      lines.push(`- Detalle: ${stockDetail}`);
    }

    if (summary.publicPrice !== null) {
      lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
    }
    if (Array.isArray(summary.pricingLines) && summary.pricingLines.length > 0) {
      lines.push("- Opciones de pago:");
      lines.push(...summary.pricingLines.map(line => `  ${line}`));
    }
    if (summary.coverageNote) {
      lines.push(`- Nota: ${summary.coverageNote}`);
    }
    if (summary.stockStatus === "sin stock" && Array.isArray(summary.alternatives) && summary.alternatives.length > 0) {
      lines.push("- Alternativas de la misma droga:");
      lines.push(...summary.alternatives.slice(0, 3).map(option => `  ${option.title}`));
    }
    lines.push(`- Productos en el pedido: ${summary.cartItems || 1}`);
    lines.push("¿Querés agregar algo más o terminar la compra?");
    return lines.join("\n");
  }

  lines.push("Revisá tu pedido:");
  for (const item of Array.isArray(summary.items) ? summary.items : []) {
    lines.push(...buildItemCheckoutLines(item, { includeRecetario: data?.recetarioAdhered === true }));
  }

  if (summary.publicPrice !== null) {
    lines.push(`- ${summary.publicPriceLabel}: ${formatCurrency(summary.publicPrice)}`);
  }

  if (summary.recetario) {
    lines.push(`- Recetario Solidario: ${summary.recetario}`);
  }

  if (Array.isArray(summary.pricingLines) && summary.pricingLines.length > 0) {
    lines.push("Totales con descuentos:");
    lines.push(...summary.pricingLines);
  }

  lines.push(`- Formas de pago: ${buildPaymentFormsText(Array.isArray(data?.itemsList) ? data.itemsList : [], { includeRecetario: data?.recetarioAdhered === true })}`);
  lines.push(allowsAddMore ? "¿Querés agregar algo más o terminar la compra?" : "¿Querés terminar la compra?");
  return lines.join("\n");
}

function allowsSummaryAddMore(data) {
  return String(data?.orderType || "").trim().toUpperCase() !== "VACUNAS";
}

function pushSectionHeading(lines, title) {
  if (lines.length > 0 && lines[lines.length - 1] !== "") {
    lines.push("");
  }
  lines.push(`*${title}*`);
  lines.push("----------------");
}

function formatPlainEmail(value) {
  const email = trim(String(value || ""), 160);
  if (!email) {
    return "";
  }
  return email.replace(/@/g, "@\u200b").replace(/\./g, ".\u200b");
}

function buildFinalCheckoutText(data) {
  const items = Array.isArray(data?.itemsList) ? data.itemsList : [];
  const includeRecetario = data?.recetarioAdhered === true;
  const totals = buildCartTotals(items, { includeRecetario });
  const lines = [];

  pushSectionHeading(lines, "Resumen final");

  if (items.length > 0) {
    pushSectionHeading(lines, "Productos");
    for (const item of items) {
      lines.push(...buildItemCheckoutLines(item, { includeRecetario }));
    }
  }

  if (typeof data?.recetarioAdhered === "boolean") {
    pushSectionHeading(lines, "Recetario Solidario");
    lines.push(data.recetarioAdhered ? "Sí" : "No");
  }

  if (Number.isFinite(totals.listTotal)) {
    pushSectionHeading(lines, "Totales del pedido");
    lines.push(`- Total: ${formatCurrency(totals.listTotal)}`);
  }

  if (totals.scenarioLines.length > 0) {
    pushSectionHeading(lines, "Totales con descuentos");
    lines.push(...totals.scenarioLines);
  }

  pushSectionHeading(lines, "Formas de pago");
  lines.push(buildPaymentFormsText(items, { includeRecetario }));

  if (data?.mode === "DELIVERY" && data?.deliveryDraft) {
    pushSectionHeading(lines, "Delivery");
    lines.push(`- ${[data.deliveryDraft.firstName, data.deliveryDraft.lastName].filter(Boolean).join(" ")}`);
    lines.push(`- ${data.deliveryDraft.addressLine}`);
    lines.push(`- Entre calles: ${data.deliveryDraft.crossStreets}`);
    lines.push(`- Barrio: ${data.deliveryDraft.neighborhood}`);
    lines.push(`- Mail: ${formatPlainEmail(data.deliveryDraft.email)}`);
  }

  lines.push("");
  lines.push("En breve un asesor se va a comunicar por este medio para terminar la compra.");
  return lines.join("\n");
}

function buildBranchPrompt(label, promptText) {
  const safeLabel = String(label || "").trim();
  const safePrompt = String(promptText || "").trim();
  if (!safeLabel) {
    return safePrompt;
  }
  if (!safePrompt) {
    return safeLabel;
  }
  return `${safeLabel}.\n${safePrompt}`;
}

function getOrderTypeChatLabel(orderType) {
  const value = String(orderType || "").trim().toUpperCase();
  if (value === "PARTICULAR") return "Particular";
  if (value === "OBRA SOCIAL") return "Obra social";
  if (value === "VACUNAS") return "Programa de sobrepeso y diabetes";
  if (value === "MOSTRADOR") return "Mostrador";
  return "";
}

function buildParticularSearchModePrompt() {
  return buildBranchPrompt("Particular", "Elegí cómo querés buscar el producto.");
}

function buildRecentProductHistoryPrompt(profile) {
  const addressLine = trim(profile?.delivery?.addressLine || "", 120);
  const addressSuffix = addressLine ? `También tengo guardada tu dirección en ${addressLine}.` : "";
  return [
    buildBranchPrompt("Particular", "Tengo guardados productos de tu último pedido."),
    "Si querés, elegí uno para pedirlo de nuevo o buscá otro distinto.",
    addressSuffix
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildProductWizardStartActions(_runtime, introText) {
  const basePrompt = String(introText || buildProductLabHelpText()).trim();
  return buildPromptActions(
    buildBranchPrompt("Programa de sobrepeso y diabetes", basePrompt),
    productLabButtons(),
    [buildBackButton()]
  );
}

function buildRecipeUploadActions(session, runtime) {
  const prompt = nodeText(runtime, "receta_upload", "Enviá tu receta.");
  return [buildRecipeUploadNavigation(buildBranchPrompt(getOrderTypeChatLabel(session?.data?.orderType), prompt))];
}

function parseServiceTypeChoice(input) {
  if (input.buttonId === "service_particular" || input.normalized.includes("particular")) {
    return { kind: "particular", label: "PARTICULAR" };
  }
  if (
    input.buttonId === "service_vaccines" ||
    input.buttonId === "service_treatment" ||
    input.normalized.includes("vacunas") ||
    input.normalized.includes("vacuna") ||
    input.normalized.includes("sobrepeso") ||
    input.normalized.includes("obesidad") ||
    input.normalized.includes("diabetes") ||
    input.normalized.includes("programa") ||
    input.normalized.includes("diabetes tipo 2") ||
    input.normalized.includes("tratamiento")
  ) {
    return { kind: "treatment", label: "VACUNAS" };
  }
  if (input.buttonId === "service_obra_social" || input.normalized.includes("obra social")) {
    return { kind: "obra_social", label: "OBRA SOCIAL" };
  }
  return null;
}

module.exports = {
  nextBotReply,
  _private: {
    resetSessions,
    normalize,
    parseModeChoice,
    parseServiceTypeChoice,
    parseSummaryChoice,
    buildLookupDetailsText,
    buildFinalCheckoutText,
    formatStockStatus,
    getProfileSnapshot(contactId) {
      const profile = profiles.get(contactId);
      return profile ? JSON.parse(JSON.stringify(profile)) : null;
    },
    resetContactState,
    markInboundFingerprint,
    getContactConversationState,
    closeContactConversation,
    enterInitialBotMode,
    markAdvisorManualControl,
    forceParticularSearchFlow,
    rememberExternalPromptActions
  }
};
