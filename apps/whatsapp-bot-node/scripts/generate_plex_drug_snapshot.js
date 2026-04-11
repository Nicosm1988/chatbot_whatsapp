#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "..");
const outputPath = path.join(rootDir, "src", "plex_drug_search_snapshot.json");
const perPage = 1000;
const requestDelayMs = 150;
const maxRetries = 3;
const timeoutMs = 15000;

loadEnvFile(".env");
loadEnvFile(".env.production");
loadEnvFile(".env.local", true);
loadEnvFile(".env.preview", true);
loadEnvFile(".env.tmp.production", true);

const baseUrl = readEnv("PHARMACY_SYSTEM_API_BASE_URL").replace(/\/+$/, "");
const username = readEnv("PHARMACY_SYSTEM_API_USERNAME");
const password = readEnv("PHARMACY_SYSTEM_API_PASSWORD");
const authHeader = {
  Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`
};

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});

async function main() {
  console.log("1) Descargando drogas...");
  const drugs = await fetchCollection("/wsplexcenter/drogas", "drogas");
  console.log(`   Drogas recibidas: ${drugs.length}`);

  console.log("2) Descargando catalogo completo de productos...");
  const products = await fetchAllProducts();
  console.log(`   Productos recibidos: ${products.length}`);

  console.log("3) Agrupando productos por droga...");
  const drugMap = new Map(
    drugs.map(item => [
      String(item?.coddroga || "").trim(),
      String(item?.droga || "").trim()
    ]).filter(([code, title]) => code && title)
  );

  const groups = new Map();
  for (const product of products) {
    const drugCode = String(product?.coddroga || "").trim();
    const code = String(product?.codproducto || "").trim();
    const title = String(product?.producto || "").trim();
    if (!drugCode || !code || !title) {
      continue;
    }

    const drugTitle = drugMap.get(drugCode) || "";
    if (!drugTitle) {
      continue;
    }

    if (!groups.has(drugCode)) {
      groups.set(drugCode, {
        drugCode,
        drugTitle,
        products: []
      });
    }

    groups.get(drugCode).products.push({
      code,
      title,
      publicPrice: parseDecimal(product?.precio)
    });
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "plex_center_api",
    totalDrugs: drugs.length,
    totalProducts: products.length,
    drugGroups: Array.from(groups.values())
      .map(group => ({
        drugCode: group.drugCode,
        drugTitle: group.drugTitle,
        products: dedupeProducts(group.products).sort((left, right) => left.title.localeCompare(right.title, "es"))
      }))
      .filter(group => group.products.length > 0)
      .sort((left, right) => left.drugTitle.localeCompare(right.drugTitle, "es"))
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`4) Snapshot generado en ${outputPath}`);
  console.log(
    JSON.stringify(
      {
        groups: snapshot.drugGroups.length,
        firstGroup: snapshot.drugGroups[0]?.drugTitle || "",
        sampleProduct: snapshot.drugGroups[0]?.products?.[0]?.title || ""
      },
      null,
      2
    )
  );
}

function loadEnvFile(fileName, override = false) {
  const filePath = path.join(rootDir, fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
}

function readEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function fetchCollection(endpointPath, key) {
  const url = new URL(`${baseUrl}${endpointPath}`);
  const payload = await fetchJson(url.toString());
  return readCollection(payload, key);
}

async function fetchAllProducts() {
  const firstPage = await fetchProductsPage(1);
  const totalPages = Math.max(1, Number(firstPage.totalPages || 1));
  const items = [...firstPage.items];

  for (let page = 2; page <= totalPages; page += 1) {
    await delay(requestDelayMs);
    const nextPage = await fetchProductsPage(page);
    items.push(...nextPage.items);
  }

  return items;
}

async function fetchProductsPage(page) {
  const url = new URL(`${baseUrl}/wsplexcenter/productos`);
  url.searchParams.set("paginanro", String(page));
  url.searchParams.set("paginacant", String(perPage));

  const payload = await fetchJson(url.toString(), { page });
  const content = payload?.response?.content || {};
  return {
    items: readCollection(payload, "productos"),
    totalPages: Number(content?.totpaginas || content?.total_paginas || content?.totalPages || 1) || 1
  };
}

async function fetchJson(url, meta = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: authHeader,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`http_${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < maxRetries) {
        await delay(requestDelayMs * attempt);
        continue;
      }
    }
  }

  const suffix = meta?.page ? ` (page ${meta.page})` : "";
  throw new Error(`plex_fetch_failed${suffix}: ${lastError?.message || "unknown_error"}`);
}

function readCollection(payload, key) {
  const content = payload?.response?.content;
  const value = content?.[key];
  return Array.isArray(value) ? value : [];
}

function parseDecimal(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function dedupeProducts(products) {
  const seen = new Map();
  for (const product of products) {
    const key = String(product?.code || "").trim() || String(product?.title || "").trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.set(key, product);
  }
  return Array.from(seen.values());
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
