const LABS = [
  { id: "elea", title: "Elea" },
  { id: "novo_nordisk", title: "Novo Nordisk" },
  { id: "adium", title: "Adium" }
];

const BRANDS = [
  { id: "dutide", labId: "elea", title: "DUTIDE" },
  { id: "obetide", labId: "elea", title: "OBETIDE" },
  { id: "ozempic", labId: "novo_nordisk", title: "OZEMPIC" },
  { id: "wegovy", labId: "novo_nordisk", title: "WEGOVY" },
  { id: "saxenda", labId: "novo_nordisk", title: "SAXENDA" },
  { id: "mounjaro", labId: "adium", title: "MOUNJARO" }
];

const PLAN_DEFINITIONS = {
  particular: {
    id: "particular",
    title: "Particular",
    buttonTitle: "Particular",
    paymentOptionIds: ["cash_transfer", "debit", "credit"],
    lines: [
      "Venta particular disponible para este producto.",
      "Efectivo o transferencia: 25% de descuento.",
      "Tarjeta de debito: 20% de descuento.",
      "Tarjeta de credito: 10% de descuento + 3 cuotas sin interes."
    ]
  },
  ftcheq_30: {
    id: "ftcheq_30",
    title: "FTCheq",
    buttonTitle: "FTCheq",
    paymentOptionIds: ["cash_transfer", "other"],
    lines: [
      "Programa FTCheq con 30% de descuento.",
      "Delko suma 20% adicional si el pago es en efectivo o transferencia."
    ]
  },
  ftcheq_variable: {
    id: "ftcheq_variable",
    title: "FTCheq",
    buttonTitle: "FTCheq",
    paymentOptionIds: ["cash_transfer", "other"],
    lines: [
      "Programa FTCheq con descuento variable entre 25%, 30% o 35%.",
      "Delko suma 20% adicional si el pago es en efectivo o transferencia."
    ]
  },
  recetario_20: {
    id: "recetario_20",
    title: "Recetario",
    buttonTitle: "Recetario",
    paymentOptionIds: ["cash_transfer", "other"],
    lines: [
      "Recetario Solidario con 20% de descuento.",
      "Delko suma 20% adicional si el pago es en efectivo o transferencia."
    ]
  },
  recetario_ftcheq_combo: {
    id: "recetario_ftcheq_combo",
    title: "FTCheq + Recetario",
    buttonTitle: "FT+Recetario",
    paymentOptionIds: ["cash_transfer", "other"],
    lines: [
      "Recetario Solidario aplica 20% de descuento.",
      "FTCheq aplica el descuento que corresponda: 25%, 30% o 35%.",
      "Delko suma 20% adicional si el pago es en efectivo o transferencia."
    ]
  }
};

const PAYMENT_OPTIONS = {
  cash_transfer: {
    id: "cash_transfer",
    title: "Efect/Transf",
    label: "Efectivo o transferencia"
  },
  debit: {
    id: "debit",
    title: "Debito",
    label: "Tarjeta de debito"
  },
  credit: {
    id: "credit",
    title: "Credito",
    label: "Tarjeta de credito"
  },
  other: {
    id: "other",
    title: "Otro medio",
    label: "Otro medio de pago"
  }
};

const PRODUCTS = [
  {
    id: "dutide_025_jer_x4",
    labId: "elea",
    brandId: "dutide",
    title: "DUTIDE 0.25 mg jer. prell. x 4",
    shortTitle: "0.25 jer x4",
    planIds: ["particular", "ftcheq_30"],
    aliases: ["dutide 0.25", "dutide 0 25", "dutide jer 0.25"]
  },
  {
    id: "dutide_05_jer_x4",
    labId: "elea",
    brandId: "dutide",
    title: "DUTIDE 0.5 mg jer. prell. x 4",
    shortTitle: "0.5 jer x4",
    planIds: ["particular", "ftcheq_30"],
    aliases: ["dutide 0.5", "dutide 0 5", "dutide jer 0.5"]
  },
  {
    id: "dutide_1_jer_x4",
    labId: "elea",
    brandId: "dutide",
    title: "DUTIDE 1 mg jer. prell. x 4",
    shortTitle: "1 mg jer x4",
    planIds: ["particular", "ftcheq_30"],
    aliases: ["dutide 1 mg", "dutide 1", "dutide jer 1"]
  },
  {
    id: "dutide_14_comp_x30",
    labId: "elea",
    brandId: "dutide",
    title: "DUTIDE 14 mg comp. x 30",
    shortTitle: "14 mg comp",
    planIds: ["particular"],
    aliases: ["dutide 14 mg", "dutide 14", "dutide comp 14"]
  },
  {
    id: "dutide_3_comp_x30",
    labId: "elea",
    brandId: "dutide",
    title: "DUTIDE 3 mg comp. x 30",
    shortTitle: "3 mg comp",
    planIds: ["particular"],
    aliases: ["dutide 3 mg", "dutide 3", "dutide comp 3"]
  },
  {
    id: "dutide_7_comp_x30",
    labId: "elea",
    brandId: "dutide",
    title: "DUTIDE 7 mg comp. x 30",
    shortTitle: "7 mg comp",
    planIds: ["particular"],
    aliases: ["dutide 7 mg", "dutide 7", "dutide comp 7"]
  },
  {
    id: "obetide_025_jer_x4",
    labId: "elea",
    brandId: "obetide",
    title: "OBETIDE 0.25 mg jer. prell. x 4",
    shortTitle: "0.25 jer x4",
    planIds: ["particular", "recetario_20"],
    aliases: ["obetide 0.25", "obetide 0 25", "obetide jer 0.25"]
  },
  {
    id: "obetide_05_jer_x4",
    labId: "elea",
    brandId: "obetide",
    title: "OBETIDE 0.5 mg jer. prell. x 4",
    shortTitle: "0.5 jer x4",
    planIds: ["particular", "recetario_20"],
    aliases: ["obetide 0.5", "obetide 0 5", "obetide jer 0.5"]
  },
  {
    id: "obetide_1_jer_x4",
    labId: "elea",
    brandId: "obetide",
    title: "OBETIDE 1 mg jer. prell. x 4",
    shortTitle: "1 mg jer x4",
    planIds: ["particular", "recetario_20"],
    aliases: ["obetide 1 mg", "obetide 1", "obetide jer 1"]
  },
  {
    id: "obetide_17_jer_x4",
    labId: "elea",
    brandId: "obetide",
    title: "OBETIDE 1.7 mg jer. prell. x 4",
    shortTitle: "1.7 jer x4",
    planIds: ["particular", "recetario_20"],
    aliases: ["obetide 1.7", "obetide 1 7", "obetide jer 1.7"]
  },
  {
    id: "obetide_24_jer_x4",
    labId: "elea",
    brandId: "obetide",
    title: "OBETIDE 2.4 mg jer. prell. x 4",
    shortTitle: "2.4 jer x4",
    planIds: ["particular", "recetario_20"],
    aliases: ["obetide 2.4", "obetide 2 4", "obetide jer 2.4"]
  },
  {
    id: "ozempic_025_05_x15ml",
    labId: "novo_nordisk",
    brandId: "ozempic",
    title: "OZEMPIC 0.25 0.5mg/dosis x1.5ml",
    shortTitle: "0.25/0.5 x1.5",
    planIds: ["particular", "ftcheq_variable", "recetario_ftcheq_combo"],
    aliases: ["ozempic 0.25", "ozempic 0.5", "ozempic 1.5ml"]
  },
  {
    id: "ozempic_1_x3ml",
    labId: "novo_nordisk",
    brandId: "ozempic",
    title: "OZEMPIC 1mg/dosis x 3ml",
    shortTitle: "1 mg x3ml",
    planIds: ["particular", "ftcheq_variable", "recetario_ftcheq_combo"],
    aliases: ["ozempic 1 mg", "ozempic 1mg", "ozempic 3ml"]
  },
  {
    id: "wegovy_025_x15ml",
    labId: "novo_nordisk",
    brandId: "wegovy",
    title: "WEGOVY 0.25 mg/ds lap.x1 x1.5ml",
    shortTitle: "0.25 lap",
    planIds: ["particular", "ftcheq_variable", "recetario_ftcheq_combo"],
    aliases: ["wegovy 0.25", "wegovy 0 25", "wegovy 1.5ml"]
  },
  {
    id: "wegovy_05_x15ml",
    labId: "novo_nordisk",
    brandId: "wegovy",
    title: "WEGOVY 0.5 mg/ds lap.x1 x1.5ml",
    shortTitle: "0.5 lap",
    planIds: ["particular", "ftcheq_variable", "recetario_ftcheq_combo"],
    aliases: ["wegovy 0.5", "wegovy 0 5"]
  },
  {
    id: "wegovy_1_x3ml",
    labId: "novo_nordisk",
    brandId: "wegovy",
    title: "WEGOVY 1 mg/ds lap.x1 x3ml",
    shortTitle: "1 mg lap",
    planIds: ["particular", "ftcheq_variable", "recetario_ftcheq_combo"],
    aliases: ["wegovy 1 mg", "wegovy 1"]
  },
  {
    id: "wegovy_17_x3ml",
    labId: "novo_nordisk",
    brandId: "wegovy",
    title: "WEGOVY 1.7 mg/ds lap.x1 x3ml",
    shortTitle: "1.7 mg lap",
    planIds: ["particular", "ftcheq_variable", "recetario_ftcheq_combo"],
    aliases: ["wegovy 1.7", "wegovy 1 7"]
  },
  {
    id: "wegovy_24_x3ml",
    labId: "novo_nordisk",
    brandId: "wegovy",
    title: "WEGOVY 2.4 mg/ds lap.x1 x3ml",
    shortTitle: "2.4 mg lap",
    planIds: ["particular", "ftcheq_variable", "recetario_ftcheq_combo"],
    aliases: ["wegovy 2.4", "wegovy 2 4"]
  },
  {
    id: "saxenda_x3",
    labId: "novo_nordisk",
    brandId: "saxenda",
    title: "SAXENDA lap.prell.x 3",
    shortTitle: "Lap x3",
    planIds: ["particular", "ftcheq_variable", "recetario_ftcheq_combo"],
    aliases: ["saxenda", "saxenda lap", "saxenda x3"],
    coverageNote: "Es el unico producto del documento donde una obra social podria llegar a cubrir algo."
  },
  {
    id: "mounjaro_25_kwikpen",
    labId: "adium",
    brandId: "mounjaro",
    title: "MOUNJARO 2.5 mg/0.6 mLx1 KwikPen",
    shortTitle: "2.5 KwikPen",
    planIds: ["particular", "ftcheq_30"],
    aliases: ["mounjaro 2.5", "mounjaro 2 5", "kwikpen 2.5"]
  },
  {
    id: "mounjaro_5_kwikpen",
    labId: "adium",
    brandId: "mounjaro",
    title: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
    shortTitle: "5 mg Kwik",
    planIds: ["particular", "ftcheq_30"],
    aliases: ["mounjaro 5", "mounjaro 5 mg", "kwikpen 5"]
  }
];

const REFERENCE_PRICING = {
  dutide_1_jer_x4: {
    publicPrice: 152903.45,
    withoutRecetario: {
      label: "FTCheq 30% + Delko 20% en efectivo/transferencia",
      finalPrice: 85625.94
    }
  },
  dutide_7_comp_x30: {
    publicPrice: 218238.56,
    withoutRecetario: {
      label: "Venta particular con 25% en efectivo/transferencia",
      finalPrice: 163678.92
    }
  },
  obetide_24_jer_x4: {
    publicPrice: 263709.9,
    withRecetario: {
      label: "Recetario Solidario 20% + Delko 20% en efectivo/transferencia",
      finalPrice: 168774.34
    }
  },
  ozempic_1_x3ml: {
    publicPrice: 386656.15,
    withoutRecetario: {
      label: "FTCheq + Delko 20% en efectivo/transferencia",
      finalPrice: 216527.45
    },
    withRecetario: {
      label: "Recetario Solidario + FTCheq + Delko 20% en efectivo/transferencia",
      finalPrice: 173221.95
    }
  },
  mounjaro_5_kwikpen: {
    publicPrice: 829980.63,
    withoutRecetario: {
      label: "FTCheq 30% + Delko 20% en efectivo/transferencia",
      finalPrice: 464789.15
    }
  }
};

const DISCOUNT_RATES = {
  particular: {
    cashTransfer: 0.25,
    debit: 0.2,
    credit: 0.1
  },
  delkoCashTransferExtra: 0.2,
  ftcheq30: 0.3,
  recetario20: 0.2,
  ftcheqVariable: [0.25, 0.3, 0.35]
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function applyDiscountChain(publicPrice, discounts) {
  return (discounts || []).reduce((current, discount) => roundCurrency(current * (1 - Number(discount || 0))), roundCurrency(publicPrice));
}

function buildRange(publicPrice, chains) {
  const values = (chains || []).map(discounts => applyDiscountChain(publicPrice, discounts));
  if (values.length === 0) {
    return null;
  }

  return {
    minPrice: roundCurrency(Math.min(...values)),
    maxPrice: roundCurrency(Math.max(...values))
  };
}

function tokenizeNormalized(value) {
  return normalize(value).match(/\d+(?:[.,]\d+)?|[a-z]+/g) || [];
}

function compactNormalized(value) {
  return tokenizeNormalized(value).join("");
}

function hasNumericToken(tokens) {
  return (tokens || []).some(token => /\d/.test(token));
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

function scoreTextCandidate(query, target) {
  const queryNormalized = normalize(query);
  const targetNormalized = normalize(target);
  const queryTokens = tokenizeNormalized(query);
  const targetTokens = tokenizeNormalized(target);
  const compactQuery = compactNormalized(query);
  const compactTarget = compactNormalized(target);
  const queryHasNumeric = hasNumericToken(queryTokens);

  if (!queryNormalized || !targetNormalized) {
    return null;
  }

  let score = Math.round(similarityRatio(compactQuery, compactTarget) * 120);
  const exact = queryNormalized === targetNormalized;
  const queryIncludesTarget = queryNormalized.includes(targetNormalized);
  const targetIncludesQuery = targetNormalized.includes(queryNormalized);

  if (exact) {
    score += 500;
  }
  if (queryIncludesTarget) {
    score += 260;
  }
  if (targetIncludesQuery) {
    score += queryHasNumeric || queryTokens.length > 1 ? 180 : 80;
  }

  let matchedTokens = 0;
  let matchedNumericTokens = 0;
  let missingNumericTokens = 0;

  for (const token of queryTokens) {
    const tokenMatched = /\d/.test(token) ? targetTokens.includes(token) : targetTokens.includes(token) || targetNormalized.includes(token);
    if (tokenMatched) {
      matchedTokens += 1;
      if (/\d/.test(token)) {
        matchedNumericTokens += 1;
      }
      score += /\d/.test(token) ? 80 : 35;
    } else if (/\d/.test(token)) {
      missingNumericTokens += 1;
      score -= 70;
    }
  }

  if (queryTokens.length > 0 && matchedTokens === queryTokens.length) {
    score += 120;
  }

  return {
    score,
    exact,
    queryIncludesTarget,
    targetIncludesQuery,
    matchedTokens,
    matchedNumericTokens,
    missingNumericTokens,
    queryTokens,
    queryHasNumeric
  };
}

function rankProductCandidates(text, brandId) {
  const normalized = normalize(text);
  if (!normalized || normalized.length < 4) {
    return [];
  }

  return PRODUCTS
    .filter(item => !brandId || item.brandId === brandId)
    .map(product => {
      const variants = [product.title, product.shortTitle, ...(product.aliases || [])].filter(Boolean);
      let bestCandidate = null;

      for (const variant of variants) {
        const candidate = scoreTextCandidate(text, variant);
        if (!candidate) {
          continue;
        }
        if (!bestCandidate || candidate.score > bestCandidate.score) {
          bestCandidate = {
            ...candidate,
            variant
          };
        }
      }

      return bestCandidate
        ? {
            product,
            ...bestCandidate
          }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
}

function getLabs() {
  return clone(LABS);
}

function getLabById(id) {
  return clone(LABS.find(item => item.id === id) || null);
}

function getBrandById(id) {
  return clone(BRANDS.find(item => item.id === id) || null);
}

function getBrandsByLab(labId) {
  return clone(BRANDS.filter(item => item.labId === labId));
}

function getProductById(id) {
  return clone(PRODUCTS.find(item => item.id === id) || null);
}

function getProductsByBrand(brandId) {
  return clone(PRODUCTS.filter(item => item.brandId === brandId));
}

function getPlanById(id) {
  return clone(PLAN_DEFINITIONS[id] || null);
}

function getPlansForProduct(productId) {
  const product = PRODUCTS.find(item => item.id === productId);
  if (!product) {
    return [];
  }
  return clone(
    (product.planIds || [])
      .map(planId => PLAN_DEFINITIONS[planId])
      .filter(Boolean)
  );
}

function getPaymentOptionById(id) {
  return clone(PAYMENT_OPTIONS[id] || null);
}

function getPaymentOptionsForPlan(planId) {
  const plan = PLAN_DEFINITIONS[planId];
  if (!plan) {
    return [];
  }
  return clone((plan.paymentOptionIds || []).map(optionId => PAYMENT_OPTIONS[optionId]).filter(Boolean));
}

function getReferencePublicPrice(productId) {
  const example = REFERENCE_PRICING[productId];
  return example && Number.isFinite(example.publicPrice) ? Number(example.publicPrice) : null;
}

function getReferencePricing(productId, adheridoRecetario) {
  const example = REFERENCE_PRICING[productId];
  if (!example) {
    return null;
  }
  const selected = adheridoRecetario ? example.withRecetario : example.withoutRecetario;
  if (!selected) {
    return null;
  }
  return clone({
    publicPrice: example.publicPrice,
    finalPrice: selected.finalPrice,
    label: selected.label
  });
}

function getProductCoverageNote(productId) {
  const product = PRODUCTS.find(item => item.id === productId);
  return product?.coverageNote ? String(product.coverageNote) : "";
}

function buildParticularPricingScenarios(basePrice) {
  return [
    {
      id: "particular_cash_transfer",
      label: "Particular ef/transf (25%)",
      finalPrice: applyDiscountChain(basePrice, [DISCOUNT_RATES.particular.cashTransfer])
    },
    {
      id: "particular_debit",
      label: "Particular debito (20%)",
      finalPrice: applyDiscountChain(basePrice, [DISCOUNT_RATES.particular.debit])
    },
    {
      id: "particular_credit",
      label: "Particular credito (10% + 3 cuotas)",
      finalPrice: applyDiscountChain(basePrice, [DISCOUNT_RATES.particular.credit])
    }
  ];
}

function getPricingScenarios(productId, publicPrice, options = {}) {
  const product = PRODUCTS.find(item => item.id === productId);
  const basePrice = Number(publicPrice);
  const includeRecetario = options.includeRecetario !== false;
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return [];
  }

  const scenarios = [];
  const planIds = Array.isArray(product?.planIds) && product.planIds.length > 0
    ? product.planIds
    : ["particular"];

  if (planIds.includes("particular")) {
    scenarios.push(...buildParticularPricingScenarios(basePrice));
  }

  if (planIds.includes("ftcheq_30")) {
    scenarios.push({
      id: "ftcheq_30_cash_transfer",
      label: "FTCheq 30% + Delko 20% ef/transf",
      finalPrice: applyDiscountChain(basePrice, [DISCOUNT_RATES.ftcheq30, DISCOUNT_RATES.delkoCashTransferExtra])
    });
  }

  if (planIds.includes("ftcheq_variable")) {
    const range = buildRange(
      basePrice,
      DISCOUNT_RATES.ftcheqVariable.map(rate => [rate, DISCOUNT_RATES.delkoCashTransferExtra])
    );
    if (range) {
      scenarios.push({
        id: "ftcheq_variable_cash_transfer",
        label: "FTCheq + Delko 20% ef/transf",
        minPrice: range.minPrice,
        maxPrice: range.maxPrice,
        rangeNote: "segun porcentaje del laboratorio"
      });
    }
  }

  if (includeRecetario && planIds.includes("recetario_20")) {
    scenarios.push({
      id: "recetario_20_cash_transfer",
      label: "Recetario + Delko 20% ef/transf",
      finalPrice: applyDiscountChain(basePrice, [DISCOUNT_RATES.recetario20, DISCOUNT_RATES.delkoCashTransferExtra])
    });
  }

  if (includeRecetario && planIds.includes("recetario_ftcheq_combo")) {
    const range = buildRange(
      basePrice,
      DISCOUNT_RATES.ftcheqVariable.map(rate => [
        DISCOUNT_RATES.recetario20,
        rate,
        DISCOUNT_RATES.delkoCashTransferExtra
      ])
    );
    if (range) {
      scenarios.push({
        id: "recetario_ftcheq_combo_cash_transfer",
        label: "Recetario + FTCheq + Delko 20% ef/transf",
        minPrice: range.minPrice,
        maxPrice: range.maxPrice,
        rangeNote: "segun porcentaje del laboratorio"
      });
    }
  }

  return clone(scenarios);
}

function findLabByText(text) {
  const normalized = normalize(text);
  if (!normalized) {
    return null;
  }
  return clone(LABS.find(item => normalized.includes(normalize(item.title))) || null);
}

function findBrandByText(text, labId) {
  const normalized = normalize(text);
  if (!normalized) {
    return null;
  }
  const candidates = BRANDS.filter(item => !labId || item.labId === labId);
  return clone(candidates.find(item => normalized.includes(normalize(item.title))) || null);
}

function findProductByText(text, brandId) {
  const ranked = rankProductCandidates(text, brandId);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) {
    return null;
  }

  const margin = best.score - Number(second?.score || 0);
  const enoughSpecificity = best.queryHasNumeric || best.queryTokens.length >= 2;
  const directConfidence =
    best.exact ||
    best.queryIncludesTarget ||
    (best.targetIncludesQuery && enoughSpecificity && best.missingNumericTokens === 0 && margin >= 20 && best.score >= 260) ||
    (best.score >= 320 && best.missingNumericTokens === 0 && margin >= 40);

  return directConfidence ? clone(best.product) : null;
}

function suggestProductByText(text, brandId) {
  const ranked = rankProductCandidates(text, brandId);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) {
    return null;
  }

  const margin = best.score - Number(second?.score || 0);
  const genericSingleToken = best.queryTokens.length === 1 && !best.queryHasNumeric;

  if (best.exact || best.queryIncludesTarget) {
    return null;
  }
  if (best.matchedTokens === 0) {
    return null;
  }
  if (best.missingNumericTokens > 0) {
    return null;
  }
  if (best.score < (genericSingleToken ? 220 : 140)) {
    return null;
  }
  if (margin < (genericSingleToken ? 55 : 10)) {
    return null;
  }

  return clone(best.product);
}

function searchProductsByText(text, brandId, options = {}) {
  const ranked = rankProductCandidates(text, brandId);
  const limit = Math.max(1, Number(options.limit || 12));

  return clone(
    ranked
      .filter(item => {
        const genericSingleToken = item.queryTokens.length === 1 && !item.queryHasNumeric;
        const strongTextualMatch =
          item.exact ||
          item.queryIncludesTarget ||
          item.targetIncludesQuery ||
          (item.queryHasNumeric && item.matchedTokens === item.queryTokens.length);
        if (item.matchedTokens === 0) {
          return false;
        }
        if (item.missingNumericTokens > 0) {
          return false;
        }
        if (!strongTextualMatch) {
          return false;
        }
        if (item.exact || item.queryIncludesTarget) {
          return true;
        }
        if (genericSingleToken) {
          return item.score >= 160 && item.matchedTokens >= 1;
        }
        return item.score >= 130;
      })
      .slice(0, limit)
      .map(item => item.product)
  );
}

module.exports = {
  getLabs,
  getLabById,
  getBrandById,
  getBrandsByLab,
  getProductById,
  getProductsByBrand,
  getPlansForProduct,
  getPlanById,
  getPaymentOptionById,
  getPaymentOptionsForPlan,
  getReferencePublicPrice,
  getReferencePricing,
  getPricingScenarios,
  getProductCoverageNote,
  findLabByText,
  findBrandByText,
  findProductByText,
  suggestProductByText,
  searchProductsByText
};
