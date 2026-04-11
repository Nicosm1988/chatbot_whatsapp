const fs = require("fs");
const path = require("path");
const {
  getProductById,
  getLabById,
  getBrandById,
  findProductByText,
  getReferencePublicPrice,
  searchProductsByText
} = require("./product_discount_catalog");

const PLEX_API_BASE_URL = String(process.env.PHARMACY_SYSTEM_API_BASE_URL || "").trim().replace(/\/+$/, "");
const PLEX_API_USERNAME = String(process.env.PHARMACY_SYSTEM_API_USERNAME || "").trim();
const PLEX_API_PASSWORD = String(process.env.PHARMACY_SYSTEM_API_PASSWORD || "").trim();
const PLEX_API_BRANCH_IDS = parseBranchIds(process.env.PHARMACY_SYSTEM_API_BRANCH_IDS || "1");
const PLEX_API_PRODUCTS_PER_PAGE = Math.max(1, Number(process.env.PHARMACY_SYSTEM_API_PRODUCTS_PER_PAGE || 20));
const PLEX_API_STOCKS_PER_PAGE = Math.max(1, Number(process.env.PHARMACY_SYSTEM_API_STOCKS_PER_PAGE || 1000));
const PLEX_API_PRODUCT_SEARCH_PAGE_LIMIT = Math.max(
  1,
  Number(process.env.PHARMACY_SYSTEM_API_PRODUCT_SEARCH_PAGE_LIMIT || 5)
);
const PLEX_API_PRODUCT_OPTION_LIMIT = Math.max(1, Number(process.env.PHARMACY_SYSTEM_API_PRODUCT_OPTION_LIMIT || 40));
const API_CACHE_TTL_MS = Math.max(1000, Number(process.env.PHARMACY_SYSTEM_API_CACHE_TTL_MS || 30000));
const LOOKUP_URL_TEMPLATE = String(process.env.PHARMACY_SYSTEM_LOOKUP_URL_TEMPLATE || "").trim();
const API_TOKEN = String(process.env.PHARMACY_SYSTEM_API_TOKEN || "").trim();
const API_AUTH_HEADER = String(process.env.PHARMACY_SYSTEM_API_AUTH_HEADER || "Authorization").trim();
const API_TIMEOUT_MS = Math.max(1500, Number(process.env.PHARMACY_SYSTEM_API_TIMEOUT_MS || 6500));
const PRODUCT_SEARCH_MODE = {
  NAME: "product_name",
  DRUG: "drug"
};
const PLEX_DRUG_SNAPSHOT_PATH = path.join(__dirname, "plex_drug_search_snapshot.json");

const stockPageCache = new Map();
let sucursalesCache = { expiresAt: 0, items: [] };
let plexDrugSnapshotCache = null;
const PRODUCT_QUERY_STOPWORDS = new Set([
  "a",
  "al",
  "algo",
  "alguna",
  "alguno",
  "busco",
  "con",
  "de",
  "del",
  "el",
  "favor",
  "la",
  "las",
  "lo",
  "los",
  "me",
  "medicamento",
  "mi",
  "necesito",
  "para",
  "por",
  "producto",
  "quiero",
  "un",
  "una",
  "uno",
  "unos",
  "unas",
  "x"
]);
const DRUG_SEARCH_IGNORED_TOKENS = new Set([
  "amp",
  "caps",
  "cap",
  "comp",
  "comprimidos",
  "crema",
  "frasco",
  "g",
  "gel",
  "gr",
  "gotas",
  "iu",
  "jer",
  "kg",
  "mcg",
  "mg",
  "ml",
  "ovulos",
  "pomada",
  "sachet",
  "spray",
  "ui"
]);

async function lookupProductAvailability({ query, productId = "", selectedProduct = null }) {
  const catalogProduct =
    (selectedProduct?.productId ? getProductById(selectedProduct.productId) : null) ||
    (productId ? getProductById(productId) : findProductByText(query));
  const effectiveQuery = cleanText(query || selectedProduct?.title || catalogProduct?.title || "");

  const plexLookup = await lookupThroughPlexCenterApi({ effectiveQuery, catalogProduct, selectedProduct });
  if (plexLookup) {
    return plexLookup;
  }

  const apiLookup = await lookupThroughGenericApi({ effectiveQuery, productId, catalogProduct });
  if (apiLookup) {
    return apiLookup;
  }

  return lookupFromDocument({ effectiveQuery, catalogProduct });
}

async function searchProductOptions({ query, limit = PLEX_API_PRODUCT_OPTION_LIMIT, mode = PRODUCT_SEARCH_MODE.NAME }) {
  const effectiveQuery = cleanText(query);
  if (!effectiveQuery) {
    return [];
  }

  const catalogOptions = searchCatalogProductOptions(effectiveQuery, limit);
  if (mode === PRODUCT_SEARCH_MODE.DRUG) {
    const drugOptions = searchDrugSnapshotOptions({ effectiveQuery, limit });
    return drugOptions.length > 0 ? drugOptions : catalogOptions;
  }

  if (!PLEX_API_BASE_URL || !PLEX_API_USERNAME || !PLEX_API_PASSWORD) {
    return catalogOptions;
  }

  try {
    const plexOptions = await searchPlexProductOptions({ effectiveQuery, catalogOptions, limit });
    return plexOptions.length > 0 ? plexOptions : catalogOptions;
  } catch (error) {
    console.warn("Plex Center option search failed, using catalog fallback:", error.message);
    return catalogOptions;
  }
}

function searchDrugSnapshotOptions({ effectiveQuery, limit }) {
  const snapshot = loadPlexDrugSnapshot();
  const groups = Array.isArray(snapshot?.drugGroups) ? snapshot.drugGroups : [];
  if (groups.length === 0) {
    return [];
  }

  const searchProfile = buildDrugSearchProfile(effectiveQuery);
  const matchedGroups = groups
    .map(group => ({
      group,
      score: scoreDrugSnapshotGroup(group, searchProfile)
    }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.group.drugTitle.localeCompare(right.group.drugTitle, "es"))
    .slice(0, 12);

  if (matchedGroups.length === 0) {
    return [];
  }

  const exactDrugMatch = matchedGroups.find(item => normalizeSearchText(item.group.drugTitle) === searchProfile.rawNormalized);
  const activeGroups = exactDrugMatch ? [exactDrugMatch] : matchedGroups;
  const collected = new Map();

  for (const match of activeGroups) {
    const products = Array.isArray(match.group?.products) ? match.group.products : [];
    for (const product of products) {
      const option = buildDrugSnapshotOption(product, match.group, match.score);
      if (!option) {
        continue;
      }

      const cacheKey = option.code || option.title;
      const existing = collected.get(cacheKey);
      if (!existing || option.score > existing.score) {
        collected.set(cacheKey, option);
      }
    }
  }

  return Array.from(collected.values())
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "es"))
    .slice(0, limit)
    .map(({ score, ...option }) => option);
}

async function lookupThroughPlexCenterApi({ effectiveQuery, catalogProduct, selectedProduct }) {
  if (!PLEX_API_BASE_URL || !PLEX_API_USERNAME || !PLEX_API_PASSWORD) {
    return null;
  }

  try {
    const candidate =
      buildSelectedPlexCandidate(selectedProduct) ||
      pickBestPlexProduct(await searchPlexProducts({ effectiveQuery, catalogProduct }), { effectiveQuery, catalogProduct });
    if (!candidate) {
      return null;
    }

    const stockSummary = await lookupPlexStock(candidate);
    return normalizePlexLookup(candidate, stockSummary, catalogProduct);
  } catch (error) {
    console.warn("Plex Center lookup failed, using document fallback:", error.message);
    return null;
  }
}

function searchCatalogProductOptions(query, limit) {
  return searchProductsByText(query, "", { limit }).map(product => {
    const lab = getLabById(product.labId);
    const brand = getBrandById(product.brandId);
    return {
      code: "",
      title: String(product.title || ""),
      productId: String(product.id || ""),
      labTitle: String(lab?.title || ""),
      brandTitle: String(brand?.title || ""),
      publicPrice: getReferencePublicPrice(product.id),
      source: "document"
    };
  });
}

async function searchPlexProductOptions({ effectiveQuery, catalogOptions, limit }) {
  const searchProfile = buildProductSearchProfile(effectiveQuery);
  const searchTerms = buildPlexOptionSearchTerms(searchProfile, catalogOptions);
  const primarySearchTerm = searchTerms[0] || "";
  const pageLimit = resolvePlexSearchPageLimit(searchProfile);
  const collected = new Map();

  for (const searchTerm of searchTerms) {
    for (let page = 1; page <= pageLimit; page += 1) {
      const products = await fetchPlexProductsPage(searchTerm, page);
      if (products.length === 0) {
        break;
      }

      for (const product of products) {
        const option = buildPlexProductOption(product, searchProfile);
        if (!option) {
          continue;
        }

        const cacheKey = option.code || option.title;
        const existing = collected.get(cacheKey);
        if (!existing || option.score > existing.score) {
          collected.set(cacheKey, option);
        }
      }

      if (collected.size >= limit) {
        break;
      }
    }

    if (collected.size >= limit || (collected.size > 0 && searchTerm === primarySearchTerm)) {
      break;
    }
  }

  return Array.from(collected.values())
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "es"))
    .slice(0, limit)
    .map(({ score, ...option }) => option);
}

async function fetchPlexProductsPage(searchTerm, page) {
  const url = new URL(`${PLEX_API_BASE_URL}/wsplexcenter/productos`);
  url.searchParams.set("busqueda", searchTerm);
  url.searchParams.set("paginanro", String(page));
  url.searchParams.set("paginacant", String(PLEX_API_PRODUCTS_PER_PAGE));

  const payload = await fetchJson(url.toString(), {
    Authorization: buildBasicAuthHeader(PLEX_API_USERNAME, PLEX_API_PASSWORD)
  });
  return readPlexCollection(payload, "productos");
}

async function searchPlexProducts({ effectiveQuery, catalogProduct }) {
  const searchTerms = buildPlexSearchTerms({ effectiveQuery, catalogProduct });
  const collected = [];
  const seenCodes = new Set();

  for (const searchTerm of searchTerms) {
    const url = new URL(`${PLEX_API_BASE_URL}/wsplexcenter/productos`);
    url.searchParams.set("busqueda", searchTerm);
    url.searchParams.set("paginanro", "1");
    url.searchParams.set("paginacant", String(PLEX_API_PRODUCTS_PER_PAGE));

    const payload = await fetchJson(url.toString(), {
      Authorization: buildBasicAuthHeader(PLEX_API_USERNAME, PLEX_API_PASSWORD)
    });
    const products = readPlexCollection(payload, "productos");
    for (const product of products) {
      const code = String(product?.codproducto || "");
      if (code && seenCodes.has(code)) {
        continue;
      }
      if (code) {
        seenCodes.add(code);
      }
      collected.push(product);
    }
    if (collected.length > 0) {
      return collected;
    }
  }

  return collected;
}

function buildSelectedPlexCandidate(selectedProduct) {
  if (!selectedProduct || typeof selectedProduct !== "object") {
    return null;
  }

  const code = String(selectedProduct.code || "").trim();
  if (!code) {
    return null;
  }

  return {
    codproducto: code,
    producto: cleanText(selectedProduct.title || ""),
    precio: selectedProduct.publicPrice ?? null,
    coddroga: String(selectedProduct.drugCode || "").trim(),
    drugTitle: cleanText(selectedProduct.drugTitle || "")
  };
}

function buildPlexSearchTerms({ effectiveQuery, catalogProduct }) {
  const terms = [
    catalogProduct?.title,
    effectiveQuery,
    buildKeywordSearch(catalogProduct?.title || effectiveQuery)
  ]
    .map(cleanText)
    .filter(Boolean);

  return [...new Set(terms)];
}

function buildKeywordSearch(value) {
  const normalized = cleanText(value);
  if (!normalized) {
    return "";
  }

  const keywords = normalized
    .split(" ")
    .filter(token => token.length >= 2)
    .slice(0, 4);
  return keywords.join(" ");
}

function buildPlexOptionSearchTerms(searchProfile, catalogOptions) {
  const catalogTitles = (catalogOptions || []).slice(0, 3).map(option => option.title);
  const typoVariants = buildTypoTolerantSearchTerms(searchProfile);
  return [
    searchProfile.phrase,
    searchProfile.raw,
    ...searchProfile.tokens,
    ...typoVariants,
    ...catalogTitles,
    buildKeywordSearch(searchProfile.raw)
  ]
    .map(cleanText)
    .filter(Boolean)
    .filter((value, index, items) => items.indexOf(value) === index);
}

function buildDrugSearchProfile(value) {
  const searchProfile = buildProductSearchProfile(value);
  const filteredTokens = filterDrugSearchTokens(searchProfile.tokens);
  if (filteredTokens.length === 0) {
    return searchProfile;
  }

  const phrase = filteredTokens.join(" ");
  return {
    ...searchProfile,
    tokens: filteredTokens,
    phrase,
    rawNormalized: normalizeSearchText(phrase),
    hasNumeric: filteredTokens.some(token => /\d/.test(token))
  };
}

function filterDrugSearchTokens(tokens) {
  const filtered = (Array.isArray(tokens) ? tokens : []).filter(token => {
    if (!token) {
      return false;
    }
    if (/^\d+(?:[.,]\d+)?$/.test(token)) {
      return false;
    }
    return !DRUG_SEARCH_IGNORED_TOKENS.has(token);
  });

  return filtered.length > 0 ? [...new Set(filtered)] : [];
}

function loadPlexDrugSnapshot() {
  if (plexDrugSnapshotCache) {
    return plexDrugSnapshotCache;
  }

  try {
    if (!fs.existsSync(PLEX_DRUG_SNAPSHOT_PATH)) {
      plexDrugSnapshotCache = { drugGroups: [] };
      return plexDrugSnapshotCache;
    }

    plexDrugSnapshotCache = JSON.parse(fs.readFileSync(PLEX_DRUG_SNAPSHOT_PATH, "utf8"));
    return plexDrugSnapshotCache;
  } catch (error) {
    plexDrugSnapshotCache = { drugGroups: [] };
    return plexDrugSnapshotCache;
  }
}

function resolvePlexSearchPageLimit(searchProfile) {
  if (searchProfile.hasNumeric || searchProfile.tokens.length >= 2) {
    return Math.min(PLEX_API_PRODUCT_SEARCH_PAGE_LIMIT, 2);
  }
  return PLEX_API_PRODUCT_SEARCH_PAGE_LIMIT;
}

function pickBestPlexProduct(products, { effectiveQuery, catalogProduct }) {
  if (!Array.isArray(products) || products.length === 0) {
    return null;
  }

  const searchTargets = [catalogProduct?.title, effectiveQuery]
    .map(normalizeSearchText)
    .filter(Boolean);

  const scored = products
    .map(product => ({
      product,
      score: scorePlexProduct(product, searchTargets)
    }))
    .sort((left, right) => right.score - left.score);

  if (scored[0]?.score > 0) {
    return scored[0].product;
  }

  return products[0] || null;
}

function scorePlexProduct(product, searchTargets) {
  const candidate = normalizeSearchText(product?.producto);
  if (!candidate) {
    return 0;
  }

  let bestScore = 0;
  for (const searchTarget of searchTargets) {
    let score = 0;
    if (candidate === searchTarget) {
      score += 1000;
    }
    if (candidate.includes(searchTarget) || searchTarget.includes(candidate)) {
      score += 600;
    }

    const searchTokens = searchTarget.split(" ").filter(token => token.length >= 2);
    for (const token of searchTokens) {
      if (candidate.includes(token)) {
        score += /^\d/.test(token) ? 60 : 25;
      }
    }

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

function buildPlexProductOption(product, searchProfile) {
  const title = readString(product, ["producto"]);
  const score = scorePlexOption(product, searchProfile);
  if (!title || score <= 0) {
    return null;
  }

  const resolvedProduct = findProductByText(title) || null;
  const lab = getLabById(resolvedProduct?.labId || "");
  const brand = getBrandById(resolvedProduct?.brandId || "");

  return {
    code: String(product?.codproducto || ""),
    title,
    productId: String(resolvedProduct?.id || ""),
    labTitle: String(lab?.title || ""),
    brandTitle: String(brand?.title || ""),
    drugCode: String(product?.coddroga || ""),
    publicPrice: readNumber(product, ["precio"]),
    source: "api",
    score
  };
}

function scorePlexOption(product, searchProfile) {
  const candidateTitle = readString(product, ["producto"]);
  if (!candidateTitle) {
    return 0;
  }

  const candidateNormalized = normalizeSearchText(candidateTitle);
  const candidateTokens = tokenizeSearchTokens(candidateTitle);
  const searchTokens = searchProfile.tokens;
  if (searchTokens.length === 0) {
    return 0;
  }

  let score = 0;
  let exactMatches = 0;
  let prefixMatches = 0;

  for (const token of searchTokens) {
    const exactMatch = candidateTokens.find(candidateToken => candidateToken === token);
    if (exactMatch) {
      exactMatches += 1;
      score += /\d/.test(token) ? 120 : 90;
      continue;
    }

    const prefixMatch =
      token.length >= 4 && !/\d/.test(token)
        ? candidateTokens.find(candidateToken => candidateToken.startsWith(token))
        : null;
    if (prefixMatch) {
      prefixMatches += 1;
      score += 45;
      continue;
    }

    const fuzzyMatch = findFuzzyTokenMatch(token, candidateTokens);
    if (fuzzyMatch) {
      score += 30;
      continue;
    }

    return 0;
  }

  if (candidateNormalized === searchProfile.phrase || candidateNormalized === searchProfile.rawNormalized) {
    score += 450;
  } else if (searchProfile.phrase && candidateNormalized.includes(searchProfile.phrase)) {
    score += 220;
  }

  if (candidateTokens[0] && searchTokens[0] && candidateTokens[0] === searchTokens[0]) {
    score += 40;
  }

  if (searchTokens.length === 1) {
    score += exactMatches > 0 ? 180 : prefixMatches > 0 ? 80 : 0;
  } else if (exactMatches === searchTokens.length) {
    score += 180;
  }

  return score;
}

function scoreDrugSnapshotGroup(group, searchProfile) {
  const candidateTitle = String(group?.drugTitle || "");
  if (!candidateTitle) {
    return 0;
  }

  const candidateNormalized = normalizeSearchText(candidateTitle);
  const candidateTokens = tokenizeSearchTokens(candidateTitle);
  const searchTokens = searchProfile.tokens;
  if (searchTokens.length === 0) {
    return 0;
  }

  let score = 0;
  let exactMatches = 0;
  let prefixMatches = 0;

  for (const token of searchTokens) {
    const exactMatch = candidateTokens.find(candidateToken => candidateToken === token);
    if (exactMatch) {
      exactMatches += 1;
      score += /\d/.test(token) ? 120 : 95;
      continue;
    }

    const prefixMatch =
      token.length >= 4 && !/\d/.test(token)
        ? candidateTokens.find(candidateToken => candidateToken.startsWith(token))
        : null;
    if (prefixMatch) {
      prefixMatches += 1;
      score += 45;
      continue;
    }

    const fuzzyMatch = findFuzzyTokenMatch(token, candidateTokens);
    if (fuzzyMatch) {
      score += 30;
      continue;
    }

    return 0;
  }

  if (candidateNormalized === searchProfile.phrase || candidateNormalized === searchProfile.rawNormalized) {
    score += 500;
  } else if (searchProfile.phrase && candidateNormalized.includes(searchProfile.phrase)) {
    score += 220;
  }

  if (searchTokens.length === 1) {
    score += exactMatches > 0 ? 220 : prefixMatches > 0 ? 90 : 0;
  } else if (exactMatches === searchTokens.length) {
    score += 180;
  }

  return score;
}

function buildDrugSnapshotOption(product, group, groupScore) {
  const title = cleanText(product?.title || "");
  if (!title) {
    return null;
  }

  const resolvedProduct = findProductByText(title) || null;
  const lab = getLabById(resolvedProduct?.labId || "");
  const brand = getBrandById(resolvedProduct?.brandId || "");

  return {
    code: String(product?.code || ""),
    title,
    productId: String(resolvedProduct?.id || ""),
    labTitle: String(lab?.title || ""),
    brandTitle: String(brand?.title || ""),
    drugTitle: String(group?.drugTitle || ""),
    drugCode: String(group?.drugCode || ""),
    publicPrice: Number.isFinite(Number(product?.publicPrice)) ? Number(product.publicPrice) : null,
    source: "api_snapshot",
    score: Number(groupScore || 0)
  };
}

function resolveDrugSnapshotGroup({ productCode = "", drugCode = "", drugTitle = "", title = "" }) {
  const snapshot = loadPlexDrugSnapshot();
  const groups = Array.isArray(snapshot?.drugGroups) ? snapshot.drugGroups : [];
  if (groups.length === 0) {
    return null;
  }

  const normalizedDrugCode = String(drugCode || "").trim();
  if (normalizedDrugCode) {
    const matchByCode = groups.find(group => String(group?.drugCode || "") === normalizedDrugCode);
    if (matchByCode) {
      return matchByCode;
    }
  }

  const normalizedDrugTitle = normalizeSearchText(drugTitle);
  if (normalizedDrugTitle) {
    const matchByTitle = groups.find(group => normalizeSearchText(group?.drugTitle || "") === normalizedDrugTitle);
    if (matchByTitle) {
      return matchByTitle;
    }
  }

  const normalizedProductCode = String(productCode || "").trim();
  if (normalizedProductCode) {
    const matchByProductCode = groups.find(group =>
      Array.isArray(group?.products) && group.products.some(product => String(product?.code || "") === normalizedProductCode)
    );
    if (matchByProductCode) {
      return matchByProductCode;
    }
  }

  const normalizedTitle = normalizeSearchText(title);
  if (normalizedTitle) {
    return groups.find(group =>
      Array.isArray(group?.products) && group.products.some(product => normalizeSearchText(product?.title || "") === normalizedTitle)
    ) || null;
  }

  return null;
}

function buildSameDrugAlternatives({ productCode = "", drugCode = "", drugTitle = "", title = "", limit = 4 }) {
  const group = resolveDrugSnapshotGroup({ productCode, drugCode, drugTitle, title });
  if (!group) {
    return {
      drugTitle: String(drugTitle || ""),
      drugCode: String(drugCode || ""),
      alternatives: []
    };
  }

  const normalizedProductCode = String(productCode || "").trim();
  const normalizedTitle = normalizeSearchText(title);
  const alternatives = (Array.isArray(group?.products) ? group.products : [])
    .filter(product => {
      const candidateCode = String(product?.code || "").trim();
      const candidateTitle = normalizeSearchText(product?.title || "");
      if (normalizedProductCode && candidateCode === normalizedProductCode) {
        return false;
      }
      if (normalizedTitle && candidateTitle === normalizedTitle) {
        return false;
      }
      return true;
    })
    .slice(0, limit)
    .map(product => ({
      title: cleanText(product?.title || ""),
      publicPrice: Number.isFinite(Number(product?.publicPrice)) ? Number(product.publicPrice) : null,
      productCode: String(product?.code || ""),
      drugTitle: String(group?.drugTitle || "")
    }))
    .filter(option => option.title);

  return {
    drugTitle: String(group?.drugTitle || drugTitle || ""),
    drugCode: String(group?.drugCode || drugCode || ""),
    alternatives
  };
}

async function lookupPlexStock(product) {
  const branchNames = await loadPlexBranchNames();
  const branchStocks = await Promise.all(
    PLEX_API_BRANCH_IDS.map(branchId => findProductStockInBranch(String(branchId), String(product?.codproducto || ""), branchNames))
  );

  const anyResolved = branchStocks.some(item => item.ok && !item.indeterminate);
  const allResolved = branchStocks.every(item => item.ok && !item.indeterminate);
  const anyAvailable = branchStocks.some(item => item.ok && item.quantity > 0);

  let available = null;
  if (allResolved) {
    available = anyAvailable;
  } else if (anyAvailable) {
    available = true;
  } else if (!anyResolved) {
    available = null;
  }

  return {
    available,
    allResolved,
    branches: branchStocks
  };
}

async function loadPlexBranchNames() {
  if (sucursalesCache.expiresAt > Date.now() && sucursalesCache.items.length > 0) {
    return sucursalesCache.items;
  }

  try {
    const payload = await fetchJson(`${PLEX_API_BASE_URL}/wsplexcenter/sucursales`, {
      Authorization: buildBasicAuthHeader(PLEX_API_USERNAME, PLEX_API_PASSWORD)
    });
    const items = readPlexCollection(payload, "sucursales");
    sucursalesCache = {
      expiresAt: Date.now() + API_CACHE_TTL_MS,
      items
    };
    return items;
  } catch (error) {
    return [];
  }
}

async function findProductStockInBranch(branchId, productCode, branchNames) {
  const branchName = resolveBranchName(branchId, branchNames);
  const firstPage = await fetchPlexStockPage(branchId, 1);
  if (!firstPage.ok) {
    return {
      branchId,
      branchName,
      ok: false,
      quantity: 0,
      boxes: 0,
      units: 0
    };
  }

  const firstMatch = findStockMatch(firstPage.products, productCode);
  if (firstMatch) {
    return formatBranchStock(branchId, branchName, firstMatch);
  }

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const pageResult = await fetchPlexStockPage(branchId, page);
    if (!pageResult.ok) {
      return {
        branchId,
        branchName,
        ok: false,
        quantity: 0,
        boxes: 0,
        units: 0
      };
    }

    if (pageResult.reportedPage !== page) {
      return {
        branchId,
        branchName,
        ok: true,
        indeterminate: true,
        quantity: 0,
        boxes: 0,
        units: 0
      };
    }

    const match = findStockMatch(pageResult.products, productCode);
    if (match) {
      return formatBranchStock(branchId, branchName, match);
    }
  }

  return {
    branchId,
    branchName,
    ok: true,
    indeterminate: false,
    quantity: 0,
    boxes: 0,
    units: 0
  };
}

async function fetchPlexStockPage(branchId, page) {
  const cacheKey = `${branchId}:${page}:${PLEX_API_STOCKS_PER_PAGE}`;
  const cached = stockPageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const url = new URL(`${PLEX_API_BASE_URL}/wsplexcenter/stock`);
    url.searchParams.set("sucursal", String(branchId));
    url.searchParams.set("paginanro", String(page));
    url.searchParams.set("paginacant", String(PLEX_API_STOCKS_PER_PAGE));

    const payload = await fetchJson(url.toString(), {
      Authorization: buildBasicAuthHeader(PLEX_API_USERNAME, PLEX_API_PASSWORD)
    });
    const response = payload?.response || {};
    const content = response?.content || {};
    const reportedPage = Math.max(1, Number(content.paginanro || content.pagina || page || 1));
    const totalPages = Math.max(0, Number(content.totpaginas || content.total_paginas || 0));
    const totalProducts = Number(content.totregistros || content.total_productos || 0);
    const result = {
      ok: String(response.respcode || "") === "0" || totalProducts === 0,
      reportedPage,
      totalPages,
      products: Array.isArray(content.productos) ? content.productos : []
    };
    stockPageCache.set(cacheKey, {
      expiresAt: Date.now() + API_CACHE_TTL_MS,
      value: result
    });
    return result;
  } catch (error) {
    return {
      ok: false,
      reportedPage: Math.max(1, Number(page || 1)),
      totalPages: 0,
      products: []
    };
  }
}

function readPlexCollection(payload, key) {
  const response = payload?.response || {};
  const content = response?.content || {};
  const items = content?.[key];
  return Array.isArray(items) ? items : [];
}

function resolveBranchName(branchId, branchNames) {
  const match = (branchNames || []).find(item => String(item?.idsucursal || "") === String(branchId));
  return String(match?.sucursal || `Sucursal ${branchId}`);
}

function findStockMatch(products, productCode) {
  return (products || []).find(item => String(item?.codproducto || "") === String(productCode)) || null;
}

function formatBranchStock(branchId, branchName, product) {
  const boxes = Math.max(0, Number(product?.cajas || 0));
  const units = Math.max(0, Number(product?.unidades || 0));
  return {
    branchId,
    branchName,
    ok: true,
    indeterminate: false,
    quantity: boxes + units,
    boxes,
    units
  };
}

function normalizePlexLookup(product, stockSummary, catalogProduct) {
  const resolvedTitle = readString(product, ["producto"]) || catalogProduct?.title || "";
  const resolvedProduct = catalogProduct || findProductByText(resolvedTitle) || null;
  const lab = getLabById(resolvedProduct?.labId || "");
  const brand = getBrandById(resolvedProduct?.brandId || "");
  const productCode = String(product?.codproducto || "");
  const drugMetadata = buildSameDrugAlternatives({
    productCode,
    drugCode: String(product?.coddroga || ""),
    drugTitle: String(product?.drugTitle || ""),
    title: resolvedTitle
  });

  return {
    found: Boolean(resolvedTitle || resolvedProduct),
    productId: resolvedProduct?.id || "",
    productCode,
    title: resolvedTitle || resolvedProduct?.title || "",
    labTitle: lab?.title || "",
    brandTitle: brand?.title || "",
    drugTitle: String(drugMetadata.drugTitle || product?.drugTitle || ""),
    drugCode: String(drugMetadata.drugCode || product?.coddroga || ""),
    available: stockSummary?.available ?? null,
    publicPrice: readNumber(product, ["precio"]),
    source: "api",
    note: buildPlexNote(stockSummary),
    alternatives: Array.isArray(drugMetadata.alternatives) ? drugMetadata.alternatives : []
  };
}

function buildPlexNote(stockSummary) {
  const branches = Array.isArray(stockSummary?.branches) ? stockSummary.branches : [];
  if (branches.length === 0) {
    return "";
  }

  if (branches.length === 1) {
    return `Stock: ${describeBranchStock(branches[0])}`;
  }

  const branchLines = branches.map(branch => `${branch.branchName}: ${describeBranchStock(branch)}`);

  return `Stock por sucursal: ${branchLines.join(" ")}`;
}

function describeBranchStock(branch) {
  if (!branch.ok) {
    return "A pedido.";
  }
  if (branch.indeterminate) {
    return "A pedido.";
  }
  if (branch.boxes > 0 || branch.units > 0) {
    const parts = [];
    if (branch.boxes > 0) {
      parts.push(`${branch.boxes} caja${branch.boxes === 1 ? "" : "s"}`);
    }
    if (branch.units > 0) {
      parts.push(`${branch.units} unidad${branch.units === 1 ? "" : "es"}`);
    }
    return `${parts.join(" y ")}.`;
  }
  return "sin stock.";
}

function simplifyBranchName(branchName) {
  const value = String(branchName || "").trim();
  if (/delko 1/i.test(value)) {
    return "Delko 1";
  }
  if (/delko 2/i.test(value)) {
    return "Delko 2";
  }
  return value || "Sucursal";
}

async function lookupThroughGenericApi({ effectiveQuery, productId, catalogProduct }) {
  if (!LOOKUP_URL_TEMPLATE) {
    return null;
  }

  const url = buildLookupUrl(LOOKUP_URL_TEMPLATE, effectiveQuery, productId || catalogProduct?.id || "");
  if (!url) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const headers = { accept: "application/json" };
    if (API_TOKEN) {
      headers[API_AUTH_HEADER] = API_AUTH_HEADER.toLowerCase() === "authorization" ? `Bearer ${API_TOKEN}` : API_TOKEN;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`lookup_status_${response.status}`);
    }

    const payload = await response.json();
    const candidate = extractCandidate(payload);
    if (!candidate) {
      return null;
    }

    return normalizeLookup(candidate, catalogProduct, "api");
  } catch (error) {
    console.warn("Pharmacy system lookup failed, using document fallback:", error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function lookupFromDocument({ effectiveQuery, catalogProduct }) {
  if (!catalogProduct) {
    return {
      found: false,
      productId: "",
      title: effectiveQuery,
      labTitle: "",
      brandTitle: "",
      available: null,
      publicPrice: null,
      source: "document_fallback",
      note: "No encontré ese producto en el catálogo temporal actual y la API todavía no está conectada."
    };
  }

  const lab = getLabById(catalogProduct.labId);
  const brand = getBrandById(catalogProduct.brandId);
  return {
    found: true,
    productId: catalogProduct.id,
    title: catalogProduct.title,
    labTitle: lab?.title || "",
    brandTitle: brand?.title || "",
    available: null,
    publicPrice: getReferencePublicPrice(catalogProduct.id),
    source: "document_fallback",
    note: "Usando el documento oficial temporal hasta contar con validación en tiempo real por API."
  };
}

function buildProductSearchProfile(value) {
  const raw = cleanText(value);
  const tokens = tokenizeMeaningfulSearchTokens(raw);
  return {
    raw,
    rawNormalized: normalizeSearchText(raw),
    tokens,
    phrase: tokens.join(" "),
    hasNumeric: tokens.some(token => /\d/.test(token))
  };
}

function tokenizeMeaningfulSearchTokens(value) {
  const tokens = tokenizeSearchTokens(value).filter(token => {
    if (/\d/.test(token)) {
      return true;
    }
    return token.length >= 3 && !PRODUCT_QUERY_STOPWORDS.has(token);
  });

  return tokens.length > 0 ? [...new Set(tokens)] : tokenizeSearchTokens(value).slice(0, 4);
}

function tokenizeSearchTokens(value) {
  return normalizeSearchText(value).match(/\d+(?:[.,]\d+)?|[a-z]+/g) || [];
}

function buildTypoTolerantSearchTerms(searchProfile) {
  const variants = new Set();
  const tokens = Array.isArray(searchProfile?.tokens) ? searchProfile.tokens : [];
  if (tokens.length === 0) {
    return [];
  }

  const compactedTokens = tokens.map(compactRepeatedLetters);
  if (compactedTokens.some((token, index) => token && token !== tokens[index])) {
    variants.add(compactedTokens.join(" "));
    for (const token of compactedTokens) {
      if (token) {
        variants.add(token);
      }
    }
  }

  return Array.from(variants)
    .map(cleanText)
    .filter(Boolean)
    .filter((value, index, items) => items.indexOf(value) === index);
}

function compactRepeatedLetters(value) {
  const token = normalizeSearchText(value);
  if (!token || /\d/.test(token) || token.length < 5) {
    return token;
  }
  return token.replace(/([a-z])\1+/g, "$1");
}

function findFuzzyTokenMatch(token, candidateTokens) {
  const queryToken = String(token || "");
  if (/\d/.test(queryToken) || queryToken.length < 5) {
    return null;
  }

  return (candidateTokens || []).find(candidateToken => {
    const current = String(candidateToken || "");
    if (!current || /\d/.test(current) || current.length < 5) {
      return false;
    }
    if (Math.abs(current.length - queryToken.length) > 1) {
      return false;
    }
    if (current.slice(0, 3) !== queryToken.slice(0, 3)) {
      return false;
    }
    return levenshteinDistance(queryToken, current) <= 1;
  }) || null;
}

function levenshteinDistance(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const upper = previous[column];
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + cost
      );
      diagonal = upper;
    }
  }
  return previous[b.length];
}

function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  return fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...headers
    },
    signal: controller.signal,
    cache: "no-store"
  })
    .then(async response => {
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || `lookup_status_${response.status}`);
      }
      return response.json();
    })
    .finally(() => {
      clearTimeout(timeout);
    });
}

function normalizeLookup(candidate, catalogProduct, source) {
  const resolvedTitle = readString(candidate, ["title", "name", "productName", "description", "nombre"]) || catalogProduct?.title || "";
  const resolvedProduct =
    catalogProduct ||
    findProductByText(resolvedTitle) ||
    (readString(candidate, ["sku", "code", "codigo", "id"]) ? getProductById(readString(candidate, ["sku", "code", "codigo", "id"])) : null);

  const lab = getLabById(resolvedProduct?.labId || "");
  const brand = getBrandById(resolvedProduct?.brandId || "");
  return {
    found: Boolean(resolvedTitle || resolvedProduct),
    productId: resolvedProduct?.id || "",
    title: resolvedTitle || resolvedProduct?.title || "",
    labTitle: lab?.title || "",
    brandTitle: brand?.title || "",
    available: readAvailability(candidate),
    publicPrice: readNumber(candidate, ["publicPrice", "price", "precio", "priceAmount", "importe"]),
    source,
    note: ""
  };
}

function extractCandidate(payload) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (typeof payload !== "object") {
    return null;
  }

  for (const key of ["result", "results", "items", "products", "data"]) {
    const value = payload[key];
    if (Array.isArray(value) && value.length > 0) {
      return value[0];
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }

  return payload;
}

function readAvailability(candidate) {
  for (const key of ["available", "inStock", "hasStock", "stockAvailable"]) {
    if (typeof candidate?.[key] === "boolean") {
      return candidate[key];
    }
  }

  for (const key of ["stock", "quantity", "qty", "existencia"]) {
    const value = candidate?.[key];
    if (typeof value === "number") {
      return value > 0;
    }
    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
      return Number(value) > 0;
    }
  }

  return null;
}

function readNumber(candidate, keys) {
  for (const key of keys) {
    const value = candidate?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function readString(candidate, keys) {
  for (const key of keys) {
    const value = candidate?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function buildLookupUrl(template, query, productId) {
  const safeQuery = encodeURIComponent(cleanText(query));
  const safeProductId = encodeURIComponent(cleanText(productId));
  return String(template || "")
    .replace(/\{query\}/g, safeQuery)
    .replace(/\{productId\}/g, safeProductId);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function normalizeSearchText(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseBranchIds(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function getPharmacyLookupStatus() {
  const plexCenterConfigured = Boolean(PLEX_API_BASE_URL && PLEX_API_USERNAME && PLEX_API_PASSWORD);
  const genericApiConfigured = Boolean(LOOKUP_URL_TEMPLATE);

  return {
    ready: plexCenterConfigured || genericApiConfigured,
    mode: plexCenterConfigured ? "plex_center_api" : genericApiConfigured ? "generic_api" : "document_fallback",
    plexCenterConfigured,
    genericApiConfigured,
    branchIds: plexCenterConfigured ? [...PLEX_API_BRANCH_IDS] : [],
    productsPerPage: plexCenterConfigured ? PLEX_API_PRODUCTS_PER_PAGE : null,
    fallbackMode: "document"
  };
}

module.exports = {
  lookupProductAvailability,
  searchProductOptions,
  getPharmacyLookupStatus
};
