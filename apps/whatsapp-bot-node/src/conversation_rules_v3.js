const { config } = require("./config");
const { getChatbotRuntimeConfig } = require("./workflow_store");
const { createFlowEngine } = require("./flow_engine");
const {
  getProductById,
  getProductsByBrand,
  getReferencePricing,
  findProductByText
} = require("./product_discount_catalog");
const { lookupProductAvailability } = require("./pharmacy_system_lookup");

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 20000;
const KV_REST_API_URL = String(process.env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
const KV_REST_API_TOKEN = String(process.env.KV_REST_API_TOKEN || "").trim();
const KV_STATE_PREFIX = String(process.env.STATE_STORE_PREFIX || "wa:state:").trim();
const KV_ENABLED = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);

const S = {
  IDLE: "idle",
  ORDER: "order",
  AGENT: "agent"
};

const STEP = {
  MENU: "menu",
  SUBPATH: "subpath",
  GROUP: "group",
  OFFER: "offer",
  DISCOUNT: "discount",
  CLOSE: "close"
};

const PRIMARY_CHOICES = {
  sugar: {
    id: "primary_sugar",
    title: "Control de azucar",
    shortTitle: "Control de azucar",
    buttonTitle: "Control de azucar",
    copy: "Perfecto. Te muestro solo opciones pensadas para control de azucar, sin llenarte de informacion.",
    nextStep: STEP.SUBPATH
  },
  weight: {
    id: "primary_weight",
    title: "Bajar de peso / metabolismo",
    shortTitle: "Bajar de peso",
    buttonTitle: "Bajar de peso",
    copy: "Perfecto. Te muestro opciones para metabolismo y descenso de peso, de forma simple y ordenada.",
    nextStep: STEP.SUBPATH
  },
  all: {
    id: "primary_all",
    title: "Ver todos los tratamientos",
    shortTitle: "Ver todos",
    buttonTitle: "Ver todos",
    copy: "Te los ordeno de forma simple para que compares rapido y elijas sin marearte.",
    nextStep: STEP.GROUP
  },
  guide: {
    id: "primary_guide",
    title: "Quiero asesoramiento",
    shortTitle: "Asesoramiento",
    buttonTitle: "Asesoramiento",
    copy: "Te guio en menos de un minuto para que veas primero las opciones que mas sentido tienen para vos.",
    nextStep: STEP.SUBPATH
  }
};

const GROUP_DEFINITIONS = {
  known_family: {
    id: "group_known_family",
    title: "Opciones tipo Ozempic / Wegovy",
    buttonTitle: "Ozempic / Wegovy",
    explain:
      "Aca vas a ver las opciones mas conocidas y elegidas. Son ideales si priorizas marcas muy buscadas y queres comparar dentro de esa linea.",
    offerIds: ["ozempic", "wegovy", "saxenda"]
  },
  budget_family: {
    id: "group_budget_family",
    title: "Alternativas mas economicas",
    buttonTitle: "Mas economicas",
    explain:
      "Si tu prioridad es pagar menos sin dejar de ver buenas opciones, estas suelen ser las mas convenientes.",
    offerIds: ["dutide_injectable", "dutide_pills", "obetide"]
  },
  advanced_family: {
    id: "group_advanced_family",
    title: "Tratamientos avanzados",
    buttonTitle: "Avanzados",
    explain:
      "Si buscas una opcion mas avanzada o premium, te muestro primero esta linea.",
    offerIds: ["mounjaro"]
  }
};

const OFFER_DEFINITIONS = {
  ozempic: {
    id: "offer_ozempic",
    title: "Ozempic",
    brandId: "ozempic",
    typeLabel: "Inyectable",
    mainBenefit: "control de azucar y apoyo metabolico con una de las marcas mas consultadas.",
    valueLine: "Es una de las opciones mas conocidas para quienes quieren empezar comparando marcas muy buscadas.",
    discountLine: "Puede combinar FTCheq, Recetario Solidario y beneficios propios segun forma de pago.",
    alternativeGroupId: "budget_family"
  },
  wegovy: {
    id: "offer_wegovy",
    title: "Wegovy",
    brandId: "wegovy",
    typeLabel: "Inyectable",
    mainBenefit: "metabolismo y descenso de peso dentro de las opciones mas conocidas.",
    valueLine: "Suele atraer a quienes quieren una linea muy instalada y comparar varias presentaciones.",
    discountLine: "Puede combinar FTCheq, Recetario Solidario y beneficios propios segun forma de pago.",
    alternativeGroupId: "budget_family"
  },
  saxenda: {
    id: "offer_saxenda",
    title: "Saxenda",
    brandId: "saxenda",
    typeLabel: "Inyectable",
    mainBenefit: "comparar una alternativa reconocida dentro de los inyectables.",
    valueLine: "Es una buena opcion para quien quiere mirar otra linea conocida antes de decidir.",
    discountLine: "Puede combinar FTCheq y, segun el caso, beneficios adicionales por forma de pago.",
    alternativeGroupId: "budget_family"
  },
  dutide_injectable: {
    id: "offer_dutide_injectable",
    title: "Dutide inyectable",
    brandId: "dutide",
    typeLabel: "Inyectable",
    mainBenefit: "una alternativa mas conveniente si queres cuidar el presupuesto.",
    valueLine: "Suele ser una de las mejores puertas de entrada cuando el precio pesa en la decision.",
    discountLine: "Puede sumar FTCheq y beneficios propios de la farmacia segun forma de pago.",
    productFilter: product => !String(product.title || "").toLowerCase().includes("comp."),
    alternativeGroupId: "known_family"
  },
  dutide_pills: {
    id: "offer_dutide_pills",
    title: "Dutide pastillas",
    brandId: "dutide",
    typeLabel: "Pastillas",
    mainBenefit: "control de azucar en comprimidos para quien prefiere evitar inyectables.",
    valueLine: "Es la opcion mas directa si queres ver una alternativa en pastillas dentro del catalogo actual.",
    discountLine: "Aplica venta particular y beneficios propios segun forma de pago.",
    productFilter: product => String(product.title || "").toLowerCase().includes("comp."),
    alternativeGroupId: "budget_family"
  },
  obetide: {
    id: "offer_obetide",
    title: "Obetide",
    brandId: "obetide",
    typeLabel: "Inyectable",
    mainBenefit: "una alternativa conveniente para quien busca bajar costo sin salir de una linea inyectable.",
    valueLine: "Es muy buena opcion si queres cuidar presupuesto y aprovechar combinaciones de descuentos.",
    discountLine: "Puede combinar Recetario Solidario y beneficios propios segun forma de pago.",
    alternativeGroupId: "known_family"
  },
  mounjaro: {
    id: "offer_mounjaro",
    title: "Mounjaro",
    brandId: "mounjaro",
    typeLabel: "Inyectable",
    mainBenefit: "ver una opcion avanzada dentro de la categoria metabolica.",
    valueLine: "Suele interesar cuando se busca una linea premium o una alternativa de gama alta.",
    discountLine: "Puede combinar FTCheq y beneficios propios segun forma de pago.",
    alternativeGroupId: "known_family"
  }
};

const SUBPATHS = {
  sugar: [
    { id: "sub_sugar_injectables", title: "Inyectables", kind: "groups", groupIds: ["known_family", "budget_family", "advanced_family"] },
    { id: "sub_sugar_pills", title: "Pastillas", kind: "offers", offerIds: ["dutide_pills"] },
    { id: "sub_sugar_best_price", title: "Mejor precio", kind: "offers", offerIds: ["dutide_injectable", "dutide_pills", "obetide"] },
    { id: "discount_cta", title: "💸 Ver descuentos", kind: "discount" }
  ],
  weight: [
    { id: "sub_weight_injectables", title: "Tratamientos inyectables", kind: "groups", groupIds: ["known_family", "budget_family", "advanced_family"] },
    { id: "sub_weight_budget", title: "Opciones mas economicas", kind: "offers", offerIds: ["dutide_injectable", "obetide", "dutide_pills"] },
    { id: "sub_weight_advice", title: "Asesoramiento", kind: "advice" },
    { id: "discount_cta", title: "💸 Ver descuentos", kind: "discount" }
  ],
  guide: [
    { id: "sub_guide_sugar", title: "Control de azucar", kind: "groups", groupIds: ["known_family", "budget_family"] },
    { id: "sub_guide_weight", title: "Bajar de peso", kind: "groups", groupIds: ["known_family", "budget_family", "advanced_family"] },
    { id: "sub_guide_price", title: "Mejor precio", kind: "offers", offerIds: ["dutide_injectable", "dutide_pills", "obetide"] },
    { id: "discount_cta", title: "💸 Ver descuentos", kind: "discount" }
  ],
  all: [
    { id: "group_known_family", title: "Opciones tipo Ozempic / Wegovy", kind: "group" },
    { id: "group_budget_family", title: "Alternativas mas economicas", kind: "group" },
    { id: "group_advanced_family", title: "Tratamientos avanzados", kind: "group" },
    { id: "discount_cta", title: "💸 Ver descuentos", kind: "discount" }
  ]
};

const DISCOUNT_OPTIONS = [
  { id: "discount_cash", title: "Efectivo / transferencia" },
  { id: "discount_debit", title: "Debito" },
  { id: "discount_credit", title: "Credito" },
  { id: "discount_programs", title: "FTCheq / Recetario" },
  { id: "discount_back", title: "Volver" }
];

const PROGRAM_OPTIONS = [
  { id: "program_ftcheq", title: "Tengo FTCheq" },
  { id: "program_recetario", title: "Tengo Recetario" },
  { id: "program_both", title: "Tengo ambos" },
  { id: "program_none", title: "No tengo programa" },
  { id: "program_unknown", title: "No estoy seguro" }
];

const CLOSE_OPTIONS = [
  { id: "close_price", title: "Quiero precio" },
  { id: "close_doubts", title: "Tengo dudas" },
  { id: "close_buy", title: "Quiero comprar" },
  { id: "discount_cta", title: "💸 Ver descuentos" },
  { id: "close_compare", title: "Comparar otra opcion" }
];

const sessions = new Map();
const profiles = new Map();
const arsFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

async function nextBotReply({ contactId, contactName, inboundText, inboundMessage }) {
  if (!contactId) {
    throw new Error("contactId is required");
  }

  await hydrateState(contactId);
  cleanupExpiredSessions();
  const runtime = await getChatbotRuntimeConfig();
  const flowEngine = createFlowEngine(runtime.workflow);
  const profile = getProfile(contactId, contactName);
  const session = getSession(contactId);
  const beforeSnapshot = buildSessionSnapshot(session);
  const input = buildInput(inboundText, inboundMessage);
  let result;

  if (input.buttonId === "inactivity_continue_no") {
    resetSession(session);
    result = {
      actions: [{ type: "text", text: "Gracias por tu tiempo. Cuando quieras retomar, aca vamos a estar." }],
      meta: { closed: true }
    };
  } else if (input.buttonId === "inactivity_continue_yes") {
    session.fallback = 0;
    result = {
      actions: [
        { type: "text", text: "Perfecto, seguimos desde donde habiamos quedado." },
        ...repeatCurrentPrompt(session, profile, runtime)
      ]
    };
  } else if (isCancel(input.normalized)) {
    resetSession(session);
    result = { actions: [{ type: "text", text: "Conversacion cancelada." }, ...mainMenu(profile, runtime, true)] };
  } else if (isMenu(input.normalized)) {
    resetSession(session);
    result = { actions: mainMenu(profile, runtime, true) };
  } else if (isHuman(input.normalized)) {
    session.state = S.AGENT;
    session.step = null;
    session.fallback = 0;
    result = { actions: [{ type: "text", text: "Te derivo con un asesor para seguir por WhatsApp." }] };
  } else if (session.state === S.AGENT) {
    result = { actions: [{ type: "text", text: "Tu consulta esta con un asesor. Si queres volver al bot, escribi MENU." }] };
  } else if (session.state === S.IDLE && recoverFromInput(session, input)) {
    result = await handleOrder(session, profile, input, runtime, flowEngine);
  } else if (session.state === S.IDLE) {
    result = startFlow(session, profile, runtime, flowEngine);
  } else {
    result = await handleOrder(session, profile, input, runtime, flowEngine);
  }

  const afterSnapshot = buildSessionSnapshot(session);
  const baseMeta = {
    before: beforeSnapshot,
    after: afterSnapshot,
    transition: session.lastTransition || null,
    closed: beforeSnapshot.state !== S.IDLE && afterSnapshot.state === S.IDLE,
    handedToHuman: afterSnapshot.state === S.AGENT,
    sessionData: snapshotSessionData(session.data)
  };
  session.lastTransition = null;

  touchSession(contactId, session);
  await persistState(contactId, session, profile);

  return {
    actions: Array.isArray(result?.actions) ? result.actions : [],
    meta: {
      ...baseMeta,
      ...(result?.meta || {})
    }
  };
}

function startFlow(session, profile, runtime, flowEngine) {
  session.state = S.ORDER;
  initializeSalesSession(session);
  move(session, resolveStep(flowEngine, STEP.MENU, STEP.MENU));
  return { actions: mainMenu(profile, runtime) };
}

async function handleOrder(session, profile, input, runtime, flowEngine) {
  if (isDiscountTrigger(input)) {
    session.data.returnStep = session.step || STEP.MENU;
    session.data.discountStage = "menu";
    move(session, STEP.DISCOUNT);
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
    [STEP.SUBPATH]: () => executeOrderStep(STEP.SUBPATH, session, profile, input, runtime, flowEngine),
    [STEP.GROUP]: () => executeOrderStep(STEP.GROUP, session, profile, input, runtime, flowEngine),
    [STEP.OFFER]: () => executeOrderStep(STEP.OFFER, session, profile, input, runtime, flowEngine),
    [STEP.DISCOUNT]: () => executeOrderStep(STEP.DISCOUNT, session, profile, input, runtime, flowEngine),
    [STEP.CLOSE]: () => executeOrderStep(STEP.CLOSE, session, profile, input, runtime, flowEngine),
    __default: () => ({ actions: mainMenu(profile, runtime, true) })
  };
}

async function executeOrderStep(step, session, profile, input, runtime, flowEngine) {
  switch (step) {
    case STEP.MENU:
      return handleMenuStep(session, input, runtime, flowEngine);
    case STEP.SUBPATH:
      return handleSubpathStep(session, input, runtime, flowEngine);
    case STEP.GROUP:
      return handleGroupStep(session, input, runtime, flowEngine);
    case STEP.OFFER:
      return handleOfferStep(session, input, runtime, flowEngine);
    case STEP.DISCOUNT:
      return handleDiscountStep(session, input, runtime, flowEngine);
    case STEP.CLOSE:
      return handleCloseStep(session, profile, input, runtime, flowEngine);
    default:
      move(session, resolveStep(flowEngine, STEP.MENU, STEP.MENU));
      return { actions: mainMenu(profile, runtime, true) };
  }
}

function handleMenuStep(session, input, runtime, flowEngine) {
  if (!input.normalized || isGreeting(input.normalized)) {
    return { actions: [welcomeMessage(), primaryChoiceList(runtime)] };
  }

  const primaryChoice = findPrimaryChoice(input);
  if (!primaryChoice) {
    return fallback(
      session,
      "Elegi una de las opciones para seguir.",
      welcomeMessage().text,
      primaryChoiceList(runtime)
    );
  }

  initializeSalesSession(session);
  session.data.primaryChoice = primaryChoice;

  if (primaryChoice === "all") {
    moveByRoute(session, flowEngine, STEP.MENU, "menu_all", STEP.GROUP);
    return {
      actions: [
        { type: "text", text: PRIMARY_CHOICES.all.copy },
        buildGroupList(["known_family", "budget_family", "advanced_family"], "Mostrame categorias")
      ]
    };
  }

  moveByRoute(session, flowEngine, STEP.MENU, "menu_segment", STEP.SUBPATH);
  return {
    actions: [
      { type: "text", text: PRIMARY_CHOICES[primaryChoice].copy },
      buildSubpathList(primaryChoice)
    ]
  };
}

function handleSubpathStep(session, input, runtime, flowEngine) {
  const primaryChoice = String(session.data.primaryChoice || "");
  if (!primaryChoice) {
    move(session, STEP.MENU);
    return { actions: [welcomeMessage(), primaryChoiceList(runtime)] };
  }

  const choice = findSubpathChoice(primaryChoice, input);
  if (!choice) {
    return fallback(
      session,
      "Elegi una opcion para seguir.",
      buildSubpathPrompt(primaryChoice),
      buildSubpathList(primaryChoice)
    );
  }

  if (choice.kind === "discount") {
    session.data.returnStep = STEP.SUBPATH;
    session.data.discountStage = "menu";
    moveByRoute(session, flowEngine, STEP.SUBPATH, "subpath_discount", STEP.DISCOUNT);
    return { actions: buildDiscountMenuActions(session) };
  }

      if (choice.kind === "advice") {
        moveByRoute(session, flowEngine, STEP.SUBPATH, "subpath_advice", STEP.GROUP);
        return {
          actions: [
            {
              type: "text",
          text:
            "Para no marearte, te recomiendo arrancar por dos caminos: una opcion conocida o una mas conveniente en precio. Asi comparas rapido y decidis mejor."
        },
        buildGroupList(["known_family", "budget_family"], "Elegi por donde queres empezar")
      ]
    };
  }

  session.data.subpathId = choice.id;

  if (choice.kind === "groups") {
    moveByRoute(session, flowEngine, STEP.SUBPATH, "subpath_groups", STEP.GROUP);
    return {
      actions: [
        { type: "text", text: buildGroupPrompt(choice) },
        buildGroupList(choice.groupIds, "Ver grupos")
      ]
    };
  }

  moveByRoute(session, flowEngine, STEP.SUBPATH, "subpath_offers", STEP.OFFER);
  return {
    actions: [
      { type: "text", text: buildOfferPrompt(choice.offerIds) },
      buildOfferList(choice.offerIds, "Ver opciones")
    ]
  };
}

function handleGroupStep(session, input, runtime, flowEngine) {
  const groupKey = findGroupChoice(input);
  if (!groupKey) {
    return fallback(
      session,
      "Elegi la categoria que queres ver.",
      "Te muestro las categorias mas utiles para comparar sin abrumarte.",
      buildGroupList(resolveCurrentGroupIds(session), "Ver categorias")
    );
  }

  if (groupKey === "discount_cta") {
    session.data.returnStep = STEP.GROUP;
    session.data.discountStage = "menu";
    moveByRoute(session, flowEngine, STEP.GROUP, "group_discount", STEP.DISCOUNT);
    return { actions: buildDiscountMenuActions(session) };
  }

  const group = GROUP_DEFINITIONS[groupKey];
  if (!group) {
    return fallback(session, "Elegi una categoria valida.");
  }

  session.data.groupId = groupKey;
  moveByRoute(session, flowEngine, STEP.GROUP, "group_offer", STEP.OFFER);
  return {
    actions: [
      { type: "text", text: group.explain },
      buildOfferList(group.offerIds, "Ver opciones")
    ]
  };
}

async function handleOfferStep(session, input, runtime, flowEngine) {
  const offerKey = findOfferChoice(input);
  if (offerKey === "discount_cta") {
    session.data.returnStep = STEP.OFFER;
    session.data.discountStage = "menu";
    moveByRoute(session, flowEngine, STEP.OFFER, "offer_discount", STEP.DISCOUNT);
    return { actions: buildDiscountMenuActions(session) };
  }

  if (offerKey === "offer_back_group") {
    if (session.data.groupId) {
      moveByRoute(session, flowEngine, STEP.OFFER, "offer_back_group", STEP.GROUP);
      return {
        actions: [
          { type: "text", text: "Perfecto. Volvamos a las categorias para comparar otra linea." },
          buildGroupList(resolveCurrentGroupIds(session), "Ver categorias")
        ]
      };
    }
    moveByRoute(session, flowEngine, STEP.OFFER, "offer_back_subpath", STEP.SUBPATH);
    return {
      actions: [
        { type: "text", text: "Perfecto. Volvamos a la seleccion anterior." },
        buildSubpathList(String(session.data.primaryChoice || "guide"))
      ]
    };
  }

  if (offerKey) {
    const offer = OFFER_DEFINITIONS[offerKey];
    if (!offer) {
      return fallback(session, "Elegi una opcion valida.");
    }

    session.data.offerId = offerKey;
    return {
      actions: buildOfferDetailActions(offer)
    };
  }

  const variantId = parseVariantChoice(input);
  if (variantId) {
    return lookupSelectedProduct(session, flowEngine, variantId);
  }

  return fallback(
    session,
    "Elegi una opcion para seguir.",
    "Te muestro las opciones de forma simple para que compares mejor.",
    buildOfferList(resolveCurrentOfferIds(session), "Ver opciones")
  );
}

function handleDiscountStep(session, input, runtime, flowEngine) {
  const stage = String(session.data.discountStage || "menu");

  if (stage === "menu") {
    const option = findDiscountOption(input);
    if (!option) {
      return fallback(
        session,
        "Elegi una opcion para ver descuentos.",
        buildDiscountIntroText(session),
        buildDiscountMenuList()
      );
    }

    if (option === "discount_back") {
      return returnFromDiscount(session, runtime, flowEngine);
    }

    if (option === "discount_programs") {
      session.data.discountStage = "programs";
      return {
        actions: [
          { type: "text", text: buildProgramIntroText() },
          buildProgramList()
        ]
      };
    }

    session.data.discountStage = "result";
    session.data.discountSelection = option;
    return {
      actions: buildDiscountResultActions(session)
    };
  }

  if (stage === "programs") {
    const program = findProgramOption(input);
    if (!program) {
      return fallback(
        session,
        "Elegi una opcion de programa.",
        buildProgramIntroText(),
        buildProgramList()
      );
    }

    session.data.discountSelection = program;
    session.data.discountStage = "result";
    return {
      actions: buildDiscountResultActions(session)
    };
  }

  const next = findDiscountResultAction(input);
  if (!next) {
    return fallback(
      session,
      "Elegi como queres seguir.",
      buildDiscountResultText(session),
      buildDiscountResultButtons()
    );
  }

  if (next === "discount_back") {
    return returnFromDiscount(session, runtime, flowEngine);
  }

  if (next === "summary_human") {
    session.state = S.AGENT;
    session.step = null;
    session.fallback = 0;
    return { actions: [{ type: "text", text: "Perfecto. Te derivamos con un asesor para confirmar la mejor condicion disponible." }] };
  }

  if (next === "close_buy") {
    moveByRoute(session, flowEngine, STEP.DISCOUNT, "discount_to_close", STEP.CLOSE);
    return {
      actions: buildCloseScriptActions(session, "close_buy")
    };
  }

  return returnFromDiscount(session, runtime, flowEngine);
}

function handleCloseStep(session, profile, input, runtime, flowEngine) {
  const closeChoice = findCloseChoice(input);
  if (!closeChoice) {
    return fallback(
      session,
      "Elegi como queres avanzar.",
      buildLookupSummaryText(session),
      buildCloseList()
    );
  }

  if (closeChoice === "discount_cta") {
    session.data.returnStep = STEP.CLOSE;
    session.data.discountStage = "menu";
    moveByRoute(session, flowEngine, STEP.CLOSE, "close_discount", STEP.DISCOUNT);
    return { actions: buildDiscountMenuActions(session) };
  }

  if (closeChoice === "close_price") {
    session.data.returnStep = STEP.CLOSE;
    session.data.discountStage = "menu";
    moveByRoute(session, flowEngine, STEP.CLOSE, "close_price", STEP.DISCOUNT);
    return {
      actions: [
        {
          type: "text",
          text:
            "Si tu prioridad es pagar menos, vamos directo a las condiciones que mas suelen mover el precio final."
        },
        buildDiscountMenuList()
      ]
    };
  }

  if (closeChoice === "close_compare") {
    const targetGroup = resolveCompareGroup(session);
    session.data.groupId = targetGroup;
    moveByRoute(session, flowEngine, STEP.CLOSE, "close_compare", STEP.OFFER);
    return {
      actions: [
        { type: "text", text: "Perfecto. Te muestro otra linea para que compares rapido." },
        buildOfferList(GROUP_DEFINITIONS[targetGroup].offerIds, "Ver opciones")
      ]
    };
  }

  if (closeChoice === "summary_human") {
    session.state = S.AGENT;
    session.step = null;
    session.fallback = 0;
    return { actions: [{ type: "text", text: "Perfecto. Te derivamos con un asesor para seguir por WhatsApp." }] };
  }

  if (closeChoice === "close_view_known") {
    const targetGroup = resolveCompareGroup(session, "known");
    session.data.groupId = targetGroup;
    moveByRoute(session, flowEngine, STEP.CLOSE, "close_view_known", STEP.OFFER);
    return {
      actions: [
        { type: "text", text: "Perfecto. Te muestro las opciones mas conocidas para comparar rapido." },
        buildOfferList(GROUP_DEFINITIONS[targetGroup].offerIds, "Ver opciones")
      ]
    };
  }

  if (closeChoice === "close_view_budget") {
    const targetGroup = resolveCompareGroup(session, "budget");
    session.data.groupId = targetGroup;
    moveByRoute(session, flowEngine, STEP.CLOSE, "close_view_budget", STEP.OFFER);
    return {
      actions: [
        { type: "text", text: "Perfecto. Te muestro las opciones mas economicas para comparar mejor precio." },
        buildOfferList(GROUP_DEFINITIONS[targetGroup].offerIds, "Ver opciones")
      ]
    };
  }

  if (closeChoice === "close_buy") {
    saveLastOrder(profile, session.data);
    return { actions: buildCloseScriptActions(session, closeChoice) };
  }

  return {
    actions: buildCloseScriptActions(session, closeChoice)
  };
}

async function lookupSelectedProduct(session, flowEngine, productId) {
  const product = getProductById(productId);
  const offer = OFFER_DEFINITIONS[String(session.data.offerId || "")];
  if (!product || !offer) {
    return {
      actions: [
        { type: "text", text: "No pude identificar esa presentacion. Probemos con otra opcion." },
        buildOfferList(resolveCurrentOfferIds(session), "Ver opciones")
      ]
    };
  }

  session.data.selectedProductId = productId;
  const lookup = await lookupProductAvailability({ query: product.title, productId });
  session.data.lookup = sanitizeLookup(lookup, product, offer);
  session.data.discountStage = "";
  move(session, STEP.CLOSE);

  return {
    actions: [
      { type: "text", text: buildLookupSummaryText(session) },
      buildCloseList()
    ]
  };
}

function buildOfferDetailActions(offer) {
  return [
    { type: "text", text: buildOfferDetailText(offer) },
    buildVariantList(offer)
  ];
}

function buildOfferDetailText(offer) {
  return [
    `*${offer.title}*`,
    `Tipo: ${offer.typeLabel}`,
    `Ideal si buscas: ${offer.mainBenefit}`,
    `Ventaja destacada: ${offer.valueLine}`,
    `Descuentos posibles: ${offer.discountLine}`,
    "Si queres, te muestro la mejor presentacion para seguir avanzando."
  ].join("\n");
}

function buildLookupSummaryText(session) {
  const offer = OFFER_DEFINITIONS[String(session.data.offerId || "")];
  const product = getProductById(String(session.data.selectedProductId || ""));
  const lookup = session.data.lookup || {};
  const lines = [
    `*${lookup.title || product?.title || offer?.title || "Producto"}*`,
    `Tipo: ${offer?.typeLabel || "Tratamiento"}`,
    `Beneficio principal: ${offer?.mainBenefit || "Opcion pensada para acompanarte en tu objetivo."}`,
    `Descuentos posibles: ${offer?.discountLine || "Beneficios segun programa y forma de pago."}`
  ];

  if (lookup.available === true) {
    lines.push("Stock actual: disponible.");
  } else if (lookup.available === false) {
    lines.push("Stock actual: sin stock en este momento.");
  } else {
    lines.push("Stock actual: pendiente de confirmacion en tiempo real hasta conectar la API.");
  }

  if (lookup.publicPrice !== null) {
    lines.push(`Precio de referencia: ${formatCurrency(lookup.publicPrice)}.`);
  } else {
    lines.push("Precio de referencia: te lo confirmamos segun presentacion, stock y descuentos vigentes.");
  }

  if (lookup.note) {
    lines.push(lookup.note);
  }

  lines.push("Decime como queres seguir y te acompano al siguiente paso.");
  return lines.join("\n");
}

function buildCloseScriptActions(session, closeChoice) {
  switch (closeChoice) {
    case "close_price":
      session.data.discountStage = "menu";
      return [
        {
          type: "text",
          text:
            "Si tu prioridad es pagar menos, esta es la parte que mas conviene mirar ahora. En efectivo o transferencia suele aparecer la mejor condicion, y si aplica FTCheq o Recetario Solidario el precio puede mejorar mucho mas."
        },
        buildDiscountMenuList()
      ];
    case "close_doubts":
      return [
        {
          type: "text",
          text:
            "Para no marearte, te recomiendo decidir entre una opcion mas conocida y una mas conveniente en precio. Asi comparas rapido y elegis con mas claridad."
        },
        buildListAction(
          "Elegi como queres destrabar la decision.",
          [
            row("close_view_known", "Ver opcion mas conocida", "Ir a las marcas mas buscadas"),
            row("close_view_budget", "Ver opcion mas economica", "Ir a las alternativas mas convenientes"),
            row("summary_human", "Hablar con asesor", "Quiero ayuda humana"),
            row("discount_cta", "💸 Ver descuentos", "Ver ahorro y medios de pago")
          ],
          "Ver opciones"
        )
      ];
    case "close_buy":
      return [
        {
          type: "text",
          text:
            "Perfecto. Si esta opcion es la que mas te cierra, conviene avanzar ahora para confirmar stock y la mejor condicion disponible. Las promociones pueden variar segun stock y programas vigentes."
        },
        buildListAction(
          "Elegi como queres continuar.",
          [
            row("summary_human", "Reservar por WhatsApp", "Seguir con una persona del equipo"),
            row("discount_cta", "💸 Ver descuentos", "Ver la mejor combinacion posible"),
            row("close_compare", "Comparar otra opcion", "Ver otra alternativa antes de decidir")
          ],
          "Continuar"
        )
      ];
    default:
      return [{ type: "text", text: "Contame como queres seguir y te ayudo." }, buildCloseList()];
  }
}

function buildDiscountMenuActions(session) {
  return [
    { type: "text", text: buildDiscountIntroText(session) },
    buildDiscountMenuList()
  ];
}

function buildDiscountIntroText(session) {
  return [
    "Hoy podes mejorar mucho el precio final combinando descuentos de laboratorio con beneficios propios de la farmacia.",
    "Efectivo o transferencia: hasta 25% + extras.",
    "Debito: 20%.",
    "Credito: 10% + cuotas.",
    "Ademas, en algunos productos aplican FTCheq y Recetario Solidario."
  ].join("\n");
}

function buildProgramIntroText() {
  return "Decime si hoy contas con FTCheq o Recetario Solidario, asi te muestro mejor el ahorro posible.";
}

function buildDiscountResultActions(session) {
  return [
    { type: "text", text: buildDiscountResultText(session) },
    buildDiscountResultButtons()
  ];
}

function buildDiscountResultText(session) {
  const selection = String(session.data.discountSelection || "");
  const lookup = session.data.lookup || {};
  const productId = String(session.data.selectedProductId || lookup.productId || "");
  const hasRecetario = selection === "program_recetario" || selection === "program_both";
  const referencePricing = productId ? getReferencePricing(productId, hasRecetario) : null;
  const lines = [];

  if (selection === "discount_cash") {
    lines.push("Si queres priorizar precio, efectivo o transferencia suele ser la mejor puerta de entrada.");
    lines.push("Ahi es donde mas se aprovecha el diferencial de combinar laboratorio + beneficio propio.");
  } else if (selection === "discount_debit") {
    lines.push("Con debito tenes una opcion clara para cuidar precio sin salir del pago con tarjeta.");
    lines.push("Es ideal si queres algo simple y directo.");
  } else if (selection === "discount_credit") {
    lines.push("Si priorizas comodidad, credito te deja entrar con cuotas y una condicion competitiva.");
    lines.push("Sirve mucho cuando queres repartir el gasto sin frenar la decision.");
  } else if (selection === "program_ftcheq") {
    lines.push("Si tenes FTCheq, ya arrancas con una ventaja fuerte y en algunos productos se puede potenciar aun mas.");
  } else if (selection === "program_recetario") {
    lines.push("Si tenes Recetario Solidario, hay productos donde el ahorro mejora claramente.");
  } else if (selection === "program_both") {
    lines.push("Si aplica la combinacion de programas, es donde mas valor podes capturar.");
  } else if (selection === "program_none") {
    lines.push("Aunque no tengas programa, todavia podes aprovechar condiciones competitivas segun como pagues.");
  } else if (selection === "program_unknown") {
    lines.push("No pasa nada. Un asesor puede ayudarte a revisar rapido si hoy tenes algun beneficio aplicable.");
  }

  if (referencePricing) {
    lines.push(`Ejemplo documental para esta presentacion: ${formatCurrency(referencePricing.finalPrice)}.`);
    lines.push(`Condicion de referencia: ${referencePricing.label}.`);
  } else if (lookup.publicPrice !== null) {
    lines.push(`Precio de referencia sin beneficios combinados: ${formatCurrency(lookup.publicPrice)}.`);
  }

  lines.push("Si queres, seguimos ahora con la mejor condicion disponible para tu caso.");
  return lines.join("\n");
}

function welcomeMessage() {
  return {
    type: "text",
    text:
      `Hola, soy el asistente de ${config.businessDisplayName}. Te ayudo a encontrar opciones para control de azucar, peso y salud metabolica en pocos pasos. Tenemos precios muy competitivos porque combinamos descuentos de laboratorio con beneficios propios segun forma de pago. Decime que estas buscando y te muestro la mejor opcion sin marearte.`
  };
}

function primaryChoiceList(runtime) {
  return buildListAction(
    nodeText(runtime, "menu", "Elegi que queres ver primero."),
    [
      row(PRIMARY_CHOICES.sugar.id, PRIMARY_CHOICES.sugar.shortTitle, "Opciones para diabetes"),
      row(PRIMARY_CHOICES.weight.id, PRIMARY_CHOICES.weight.shortTitle, "Opciones para peso y metabolismo"),
      row(PRIMARY_CHOICES.all.id, PRIMARY_CHOICES.all.shortTitle, "Comparar todas las lineas"),
      row(PRIMARY_CHOICES.guide.id, PRIMARY_CHOICES.guide.shortTitle, "Quiero que me guien")
    ],
    "Ver opciones"
  );
}

function buildSubpathPrompt(primaryChoice) {
  if (primaryChoice === "sugar") {
    return "Perfecto. Elegi por donde queres empezar para control de azucar.";
  }
  if (primaryChoice === "weight") {
    return "Perfecto. Elegi por donde queres empezar para metabolismo y descenso de peso.";
  }
  return "Perfecto. Elegi por donde queres empezar y te ordeno las opciones.";
}

function buildSubpathList(primaryChoice) {
  const options = SUBPATHS[primaryChoice] || [];
  return buildListAction(
    buildSubpathPrompt(primaryChoice),
    options.map(option => row(option.id, option.title, subpathDescription(option.id))),
    "Ver opciones"
  );
}

function buildGroupPrompt(choice) {
  if (choice.id === "sub_sugar_injectables") {
    return "Perfecto. Dentro de inyectables, te conviene comparar estas 3 familias.";
  }
  if (choice.id === "sub_weight_injectables") {
    return "Perfecto. Dentro de los inyectables, te ordeno las opciones asi.";
  }
  if (choice.id === "sub_guide_sugar") {
    return "Si priorizas control de azucar, te recomiendo empezar por estas categorias.";
  }
  if (choice.id === "sub_guide_weight") {
    return "Si priorizas metabolismo o peso, te recomiendo empezar por estas categorias.";
  }
  return "Estas son las categorias que mas rapido te ayudan a decidir.";
}

function buildOfferPrompt(offerIds) {
  const titles = offerIds.map(offerId => OFFER_DEFINITIONS[offerId]?.title).filter(Boolean);
  if (!titles.length) {
    return "Te muestro las opciones disponibles.";
  }
  return `Te muestro opciones concretas para comparar rapido: ${titles.join(", ")}.`;
}

function buildGroupList(groupKeys, buttonText) {
  const rows = groupKeys
    .map(groupKey => GROUP_DEFINITIONS[groupKey])
    .filter(Boolean)
    .map(group => row(group.id, group.buttonTitle || group.title, group.explain.slice(0, 72)));
  rows.push(row("discount_cta", "💸 Ver descuentos", "Ver ahorro y medios de pago"));
  return buildListAction("Elegi una categoria para seguir.", rows, buttonText || "Ver categorias");
}

function buildOfferList(offerKeys, buttonText) {
  const rows = offerKeys
    .map(offerKey => OFFER_DEFINITIONS[offerKey])
    .filter(Boolean)
    .map(offer =>
      row(
        offer.id,
        offer.title,
        `${offer.typeLabel} · ${trimText(offer.valueLine, 44)}`
      )
    );
  rows.push(row("discount_cta", "💸 Ver descuentos", "Ver ahorro y medios de pago"));
  if (offerKeys.length > 1) {
    rows.push(row("offer_back_group", "Volver a categorias", "Comparar otra familia"));
  }
  return buildListAction("Elegi una opcion para ver mas detalle.", rows, buttonText || "Ver opciones");
}

function buildVariantList(offer) {
  const products = getOfferProducts(offer);
  const rows = products.map(product =>
    row(`variant_${product.id}`, product.shortTitle || product.title, product.title)
  );
  rows.push(row("discount_cta", "💸 Ver descuentos", "Ver ahorro y medios de pago"));
  rows.push(row("offer_back_group", "Volver a categorias", "Comparar otra familia"));
  return buildListAction("Elegi la presentacion que queres revisar.", rows, "Ver presentaciones");
}

function buildDiscountMenuList() {
  return buildListAction(
    "Elegi que queres ver primero sobre descuentos.",
    DISCOUNT_OPTIONS.map(option => row(option.id, option.title, discountDescription(option.id))),
    "Ver descuentos"
  );
}

function buildProgramList() {
  return buildListAction(
    "Contame con que programa contas hoy.",
    PROGRAM_OPTIONS.map(option => row(option.id, option.title, programDescription(option.id))),
    "Ver programas"
  );
}

function buildDiscountResultButtons() {
  return buildListAction(
    "Elegi como queres seguir.",
    [
      row("close_buy", "Quiero avanzar", "Seguir con esta opcion"),
      row("discount_back", "Volver", "Volver a la pantalla anterior"),
      row("summary_human", "Hablar con asesor", "Quiero ayuda humana")
    ],
    "Continuar"
  );
}

function buildCloseList() {
  return buildListAction(
    "Elegi como queres seguir.",
    CLOSE_OPTIONS.map(option => row(option.id, option.title, closeDescription(option.id))),
    "Continuar"
  );
}

function buildListAction(text, rows, buttonText) {
  const cleanRows = rows.filter(Boolean).slice(0, 10);
  return {
    type: "interactive",
    interactiveType: "list",
    text,
    buttonText: trimText(buttonText || "Ver opciones", 20),
    sections: [
      {
        title: "Opciones",
        rows: cleanRows
      }
    ]
  };
}

function row(id, title, description) {
  return {
    id,
    title: trimText(title, 24),
    description: trimText(description, 72)
  };
}

function discountDescription(id) {
  if (id === "discount_cash") return "La via mas competitiva";
  if (id === "discount_debit") return "Ahorro simple con tarjeta";
  if (id === "discount_credit") return "Cuotas y comodidad";
  if (id === "discount_programs") return "FTCheq y Recetario";
  return "Volver a la pantalla anterior";
}

function programDescription(id) {
  if (id === "program_ftcheq") return "Ver ahorro con FTCheq";
  if (id === "program_recetario") return "Ver ahorro con Recetario";
  if (id === "program_both") return "Si aplica combinacion";
  if (id === "program_none") return "Ver beneficios sin programa";
  return "Necesito ayuda para revisarlo";
}

function closeDescription(id) {
  if (id === "close_price") return "Priorizar precio y ahorro";
  if (id === "close_doubts") return "Recibir ayuda para decidir";
  if (id === "close_buy") return "Avanzar con esta opcion";
  if (id === "discount_cta") return "Ver ahorro y medios de pago";
  return "Comparar una alternativa";
}

function matchesOption(input, ...labels) {
  const normalizedInput = String(input?.normalized || "");
  if (!normalizedInput) {
    return false;
  }

  return labels.some(label => {
    const normalizedLabel = normalize(label);
    return normalizedLabel && (
      normalizedInput === normalizedLabel ||
      normalizedInput.includes(normalizedLabel) ||
      normalizedLabel.includes(normalizedInput)
    );
  });
}

function subpathDescription(id) {
  if (id.includes("inject")) return "Ver opciones inyectables";
  if (id.includes("pills")) return "Ver alternativas en pastillas";
  if (id.includes("price") || id.includes("budget")) return "Priorizar mejor precio";
  if (id.includes("advice")) return "Quiero ayuda para elegir";
  return "Ver mas opciones";
}

function findPrimaryChoice(input) {
  const buttonId = input.buttonId || "";
  if (buttonId === PRIMARY_CHOICES.sugar.id || input.normalized.includes("azucar") || input.normalized.includes("diabetes")) {
    return "sugar";
  }
  if (buttonId === PRIMARY_CHOICES.weight.id || input.normalized.includes("peso") || input.normalized.includes("metabol")) {
    return "weight";
  }
  if (buttonId === PRIMARY_CHOICES.all.id || input.normalized.includes("todos")) {
    return "all";
  }
  if (buttonId === PRIMARY_CHOICES.guide.id || input.normalized.includes("asesor")) {
    return "guide";
  }
  return null;
}

function findSubpathChoice(primaryChoice, input) {
  const options = SUBPATHS[primaryChoice] || [];
  return (
    options.find(option => option.id === input.buttonId) ||
    options.find(option => matchesOption(input, option.title)) ||
    null
  );
}

function findGroupChoice(input) {
  const buttonId = input.buttonId || "";
  if (buttonId === "discount_cta") {
    return "discount_cta";
  }
  for (const [groupKey, group] of Object.entries(GROUP_DEFINITIONS)) {
    if (buttonId === group.id || matchesOption(input, group.title, group.buttonTitle)) {
      return groupKey;
    }
  }
  return null;
}

function findOfferChoice(input) {
  const buttonId = input.buttonId || "";
  if (buttonId === "discount_cta" || buttonId === "offer_back_group") {
    return buttonId;
  }
  for (const [offerKey, offer] of Object.entries(OFFER_DEFINITIONS)) {
    if (buttonId === offer.id || matchesOption(input, offer.title)) {
      return offerKey;
    }
  }
  return null;
}

function parseVariantChoice(input) {
  const buttonId = input.buttonId || "";
  if (buttonId.startsWith("variant_")) {
    return buttonId.replace("variant_", "");
  }
  const product = findProductByText(input.text);
  return product?.id || null;
}

function findDiscountOption(input) {
  const buttonId = input.buttonId || "";
  if (DISCOUNT_OPTIONS.some(option => option.id === buttonId)) {
    return buttonId;
  }
  if (input.normalized.includes("efect") || input.normalized.includes("transfer")) return "discount_cash";
  if (input.normalized.includes("debito")) return "discount_debit";
  if (input.normalized.includes("credito") || input.normalized.includes("cuota")) return "discount_credit";
  if (input.normalized.includes("ftcheq") || input.normalized.includes("recetario") || input.normalized.includes("program")) {
    return "discount_programs";
  }
  if (input.normalized.includes("volver")) return "discount_back";
  return null;
}

function findProgramOption(input) {
  const buttonId = input.buttonId || "";
  if (PROGRAM_OPTIONS.some(option => option.id === buttonId)) {
    return buttonId;
  }
  if (input.normalized.includes("ftcheq") && input.normalized.includes("recetario")) return "program_both";
  if (input.normalized.includes("ftcheq")) return "program_ftcheq";
  if (input.normalized.includes("recetario")) return "program_recetario";
  if (input.normalized.includes("no tengo") || input.normalized.includes("ningun")) return "program_none";
  if (input.normalized.includes("seguro") || input.normalized.includes("no se")) return "program_unknown";
  return null;
}

function findDiscountResultAction(input) {
  const buttonId = input.buttonId || "";
  if (["close_buy", "discount_back", "summary_human"].includes(buttonId)) {
    return buttonId;
  }
  return null;
}

function findCloseChoice(input) {
  const buttonId = input.buttonId || "";
  if (buttonId === "summary_human") {
    return "summary_human";
  }
  if (CLOSE_OPTIONS.some(option => option.id === buttonId)) {
    return buttonId;
  }
  if (buttonId === "close_view_known") {
    return "close_view_known";
  }
  if (buttonId === "close_view_budget") {
    return "close_view_budget";
  }
  if (input.normalized.includes("precio")) return "close_price";
  if (input.normalized.includes("duda")) return "close_doubts";
  if (input.normalized.includes("compr")) return "close_buy";
  return null;
}

function returnFromDiscount(session, runtime, flowEngine) {
  session.data.discountStage = "";
  session.data.discountSelection = "";
  moveByRoute(session, flowEngine, STEP.DISCOUNT, "discount_back", session.data.returnStep || STEP.MENU);
  return {
    actions: repeatCurrentPrompt(session, { firstName: "", welcomed: true, lastOrder: null }, runtime)
  };
}

function resolveCurrentGroupIds(session) {
  const subpathId = String(session.data.subpathId || "");
  const primaryChoice = String(session.data.primaryChoice || "all");
  const option = (SUBPATHS[primaryChoice] || []).find(item => item.id === subpathId);
  if (option?.groupIds?.length) {
    return option.groupIds;
  }
  return ["known_family", "budget_family", "advanced_family"];
}

function resolveCurrentOfferIds(session) {
  const subpathId = String(session.data.subpathId || "");
  const primaryChoice = String(session.data.primaryChoice || "all");
  const option = (SUBPATHS[primaryChoice] || []).find(item => item.id === subpathId);
  if (option?.offerIds?.length) {
    return option.offerIds;
  }
  const groupId = String(session.data.groupId || "");
  if (GROUP_DEFINITIONS[groupId]?.offerIds?.length) {
    return GROUP_DEFINITIONS[groupId].offerIds;
  }
  return ["ozempic", "wegovy", "dutide_injectable"];
}

function resolveCompareGroup(session, preferred) {
  if (preferred === "known") {
    return "known_family";
  }
  if (preferred === "budget") {
    return "budget_family";
  }
  const currentOffer = OFFER_DEFINITIONS[String(session.data.offerId || "")];
  return currentOffer?.alternativeGroupId || "budget_family";
}

function getOfferProducts(offer) {
  return getProductsByBrand(offer.brandId)
    .filter(product => (typeof offer.productFilter === "function" ? offer.productFilter(product) : true))
    .slice(0, 10);
}

function sanitizeLookup(lookup, product, offer) {
  const base = lookup && typeof lookup === "object" ? lookup : {};
  return {
    found: base.found !== false,
    productId: String(base.productId || product.id),
    title: String(base.title || product.title),
    available: typeof base.available === "boolean" ? base.available : null,
    publicPrice: Number.isFinite(Number(base.publicPrice)) ? Number(base.publicPrice) : null,
    source: String(base.source || "document_fallback"),
    note: String(base.note || buildLookupNote(base.source || "document_fallback", offer))
  };
}

function buildLookupNote(source, offer) {
  if (source === "api") {
    return "";
  }
  return `Referencia temporal para ${offer?.title || "esta opcion"} basada en el documento oficial hasta conectar la API en tiempo real.`;
}

function initializeSalesSession(session) {
  session.state = S.ORDER;
  session.data = {
    primaryChoice: "",
    subpathId: "",
    groupId: "",
    offerId: "",
    selectedProductId: "",
    lookup: null,
    returnStep: STEP.MENU,
    discountStage: "",
    discountSelection: "",
    itemsList: [],
    items: 0
  };
}

function repeatCurrentPrompt(session, profile, runtime) {
  switch (session.step) {
    case STEP.MENU:
      return mainMenu(profile, runtime, true);
    case STEP.SUBPATH:
      return [
        { type: "text", text: buildSubpathPrompt(String(session.data.primaryChoice || "guide")) },
        buildSubpathList(String(session.data.primaryChoice || "guide"))
      ];
    case STEP.GROUP:
      return [
        { type: "text", text: "Estas son las categorias recomendadas para seguir comparando." },
        buildGroupList(resolveCurrentGroupIds(session), "Ver categorias")
      ];
    case STEP.OFFER: {
      const offer = OFFER_DEFINITIONS[String(session.data.offerId || "")];
      if (offer) {
        return buildOfferDetailActions(offer);
      }
      return [
        { type: "text", text: buildOfferPrompt(resolveCurrentOfferIds(session)) },
        buildOfferList(resolveCurrentOfferIds(session), "Ver opciones")
      ];
    }
    case STEP.DISCOUNT:
      if (session.data.discountStage === "programs") {
        return [{ type: "text", text: buildProgramIntroText() }, buildProgramList()];
      }
      if (session.data.discountStage === "result") {
        return buildDiscountResultActions(session);
      }
      return buildDiscountMenuActions(session);
    case STEP.CLOSE:
      return [{ type: "text", text: buildLookupSummaryText(session) }, buildCloseList()];
    default:
      return mainMenu(profile, runtime, true);
  }
}

function mainMenu(profile, runtime, withIntro = false) {
  const actions = [];
  if (withIntro || !profile.welcomed) {
    actions.push(welcomeMessage());
    profile.welcomed = true;
  }
  actions.push(primaryChoiceList(runtime));
  return actions;
}

function isDiscountTrigger(input) {
  return input.buttonId === "discount_cta";
}

function recoverFromInput(session, input) {
  const buttonId = input.buttonId || "";
  if (buttonId.startsWith("primary_")) {
    session.state = S.ORDER;
    move(session, STEP.MENU);
    return true;
  }
  if (buttonId.startsWith("sub_")) {
    session.state = S.ORDER;
    move(session, STEP.SUBPATH);
    return true;
  }
  if (buttonId.startsWith("group_")) {
    session.state = S.ORDER;
    move(session, STEP.GROUP);
    return true;
  }
  if (buttonId.startsWith("offer_") || buttonId.startsWith("variant_") || buttonId === "offer_back_group") {
    session.state = S.ORDER;
    move(session, STEP.OFFER);
    return true;
  }
  if (buttonId.startsWith("discount_") || buttonId.startsWith("program_")) {
    session.state = S.ORDER;
    move(session, STEP.DISCOUNT);
    return true;
  }
  if (buttonId.startsWith("close_") || buttonId === "summary_human") {
    session.state = S.ORDER;
    move(session, STEP.CLOSE);
    return true;
  }
  return false;
}

function nodeText(runtime, nodeId, fallbackText) {
  const message = String(runtime?.nodeMessages?.[nodeId] || "").trim();
  return message || fallbackText;
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

function fallback(session, shortText, helpText, helpInteractive) {
  session.fallback = (session.fallback || 0) + 1;
  if (session.fallback === 1) {
    return { actions: [{ type: "text", text: `No te entendi bien. ${shortText}` }] };
  }
  if (session.fallback === 2) {
    const actions = [{ type: "text", text: helpText || shortText }];
    if (helpInteractive) {
      actions.push(helpInteractive);
    }
    return { actions };
  }
  session.state = S.AGENT;
  session.step = null;
  session.fallback = 0;
  return { actions: [{ type: "text", text: "Te paso con un asesor para evitar demoras. Si queres volver al bot, escribi MENU." }] };
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
  const text = trimText(inboundText || textFromMessage || "", 400);
  const normalized = normalize(text);
  const messageType = inboundMessage?.type || (text ? "text" : "unknown");
  const hasMedia = messageType === "image" || messageType === "document";
  return { text, normalized, buttonId, hasMedia };
}

function buildSessionSnapshot(session) {
  return {
    state: session?.state || S.IDLE,
    step: session?.step || null
  };
}

function snapshotSessionData(data) {
  const input = data && typeof data === "object" ? data : {};
  const itemsList = Array.isArray(input.itemsList) ? input.itemsList : [];
  return {
    mode: "",
    zone: "",
    address: "",
    branch: "",
    orderType: String(input.primaryChoice || ""),
    recipes: 0,
    items: Number(input.items || itemsList.length || 0)
  };
}

function saveLastOrder(profile, data) {
  profile.lastOrder = {
    mode: "",
    orderType: data.primaryChoice || "",
    items: Array.isArray(data.itemsList) ? data.itemsList.map(item => item.productTitle).filter(Boolean) : [],
    updatedAt: new Date().toISOString()
  };
}

function getProfile(contactId, contactName) {
  const key = String(contactId || "__temp__");
  const existing = profiles.get(key);
  if (existing) {
    if (contactName) {
      existing.firstName = firstName(contactName);
    }
    return existing;
  }
  const profile = { firstName: firstName(contactName), welcomed: false, lastOrder: null };
  profiles.set(key, profile);
  return profile;
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
  if (!KV_ENABLED || sessions.has(contactId)) {
    return;
  }

  const payload = await kvGetJson(buildStateKey(contactId));
  if (!payload || typeof payload !== "object") {
    return;
  }

  if (payload.session && typeof payload.session === "object") {
    sessions.set(contactId, payload.session);
  }

  if (payload.profile && typeof payload.profile === "object") {
    profiles.set(contactId, payload.profile);
  }
}

async function persistState(contactId, session, profile) {
  if (!KV_ENABLED) {
    return;
  }

  const payload = { session, profile };
  const ttlSeconds = Math.ceil(SESSION_TTL_MS / 1000);
  await kvSetJson(buildStateKey(contactId), payload, ttlSeconds);
}

async function kvGetJson(key) {
  try {
    const response = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`
      },
      cache: "no-store"
    });

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
    return null;
  }
}

async function kvSetJson(key, value, ttlSeconds) {
  try {
    const encodedValue = encodeURIComponent(JSON.stringify(value));
    await fetch(`${KV_REST_API_URL}/setex/${encodeURIComponent(key)}/${ttlSeconds}/${encodedValue}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`
      },
      cache: "no-store"
    });
  } catch (error) {
    console.warn("KV write failed, state remains in-memory:", error.message);
  }
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(id);
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
  return arsFormatter.format(Number(value));
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function trimText(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function firstName(name) {
  const clean = trimText(name || "", 80);
  if (!clean) {
    return "";
  }
  return (clean.split(" ")[0] || "").replace(/[^A-Za-z0-9'-]/g, "");
}

function isGreeting(normalized) {
  return ["hola", "buenas", "buen dia", "buenas tardes", "buenas noches", "hello"].includes(normalized);
}

function isCancel(normalized) {
  return ["cancelar", "cancel", "salir"].includes(normalized);
}

function isMenu(normalized) {
  return ["menu", "inicio", "opciones", "volver"].includes(normalized);
}

function isHuman(normalized) {
  return ["asesor", "agente", "humano", "hablar con asesor"].includes(normalized);
}

function resetSessions() {
  sessions.clear();
  profiles.clear();
}

module.exports = {
  nextBotReply,
  _private: {
    resetSessions,
    normalize,
    findPrimaryChoice,
    findSubpathChoice
  }
};
