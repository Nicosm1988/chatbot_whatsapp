const { getFlowCatalog: getDefaultFlowCatalog } = require("./flow_catalog");
const { config, isVercelRuntime } = require("./config");

const KV_REST_API_URL = String(process.env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
const KV_REST_API_TOKEN = String(process.env.KV_REST_API_TOKEN || "").trim();
const KV_ENABLED = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);
const WORKFLOW_KV_KEY = String(process.env.WORKFLOW_KV_KEY || "wa:workflow:catalog:v1").trim();
const FAST_LOCAL_WORKFLOW_CACHE =
  config.whatsappTransport === "web" && !isVercelRuntime && process.env.NODE_ENV !== "test";
const WORKFLOW_CACHE_MS = Number(process.env.WORKFLOW_CACHE_MS || (FAST_LOCAL_WORKFLOW_CACHE ? 60000 : 2500));
const WORKFLOW_KV_TIMEOUT_MS = Math.max(
  250,
  Number(process.env.WORKFLOW_STORE_TIMEOUT_MS || (FAST_LOCAL_WORKFLOW_CACHE ? 250 : 2500))
);
const WORKFLOW_REMOTE_BACKOFF_MS = Math.max(
  10000,
  Number(process.env.WORKFLOW_REMOTE_BACKOFF_MS || (FAST_LOCAL_WORKFLOW_CACHE ? 300000 : 30000))
);

let memoryCatalog = null;
let cachedCatalog = null;
let cacheExpiresAt = 0;
let remoteBackoffUntil = 0;

function inRemoteBackoff() {
  return FAST_LOCAL_WORKFLOW_CACHE && remoteBackoffUntil > Date.now();
}

function markRemoteBackoff() {
  if (!FAST_LOCAL_WORKFLOW_CACHE) {
    return;
  }
  remoteBackoffUntil = Date.now() + WORKFLOW_REMOTE_BACKOFF_MS;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeNode(node) {
  return {
    id: String(node?.id || ""),
    title: String(node?.title || ""),
    subtitle: String(node?.subtitle || ""),
    explain: String(node?.explain || ""),
    kind: String(node?.kind || "process"),
    x: Number(node?.x || 0),
    y: Number(node?.y || 0),
    w: Number(node?.w || 220),
    h: Number(node?.h || 98),
    botMessage: String(node?.botMessage || "")
  };
}

function sanitizeEdge(edge, index) {
  return {
    id: String(edge?.id || `edge_${index + 1}`),
    from: String(edge?.from || ""),
    to: String(edge?.to || ""),
    label: String(edge?.label || ""),
    routeKey: String(edge?.routeKey || ""),
    disabled: Boolean(edge?.disabled)
  };
}

function sanitizeWorkflow(workflow, index) {
  return {
    id: String(workflow?.id || `wf_${index + 1}`),
    name: String(workflow?.name || `Workflow ${index + 1}`),
    description: String(workflow?.description || ""),
    canvas: {
      width: Number(workflow?.canvas?.width || 1200),
      height: Number(workflow?.canvas?.height || 680)
    },
    nodes: Array.isArray(workflow?.nodes) ? workflow.nodes.map(sanitizeNode) : [],
    edges: Array.isArray(workflow?.edges) ? workflow.edges.map(sanitizeEdge) : []
  };
}

function sanitizeCatalog(input) {
  const fallback = getDefaultFlowCatalog();
  if (!input || typeof input !== "object") {
    return fallback;
  }

  const workflows = Array.isArray(input.workflows)
    ? input.workflows.map(sanitizeWorkflow)
    : fallback.workflows.map(sanitizeWorkflow);

  return {
    updatedAt: new Date().toISOString(),
    workflows
  };
}

async function kvGetJson(key) {
  if (inRemoteBackoff()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKFLOW_KV_TIMEOUT_MS);
  try {
    const response = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`
      },
      cache: "no-store",
      signal: controller.signal
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
    console.warn("Workflow KV read failed:", error.message);
    markRemoteBackoff();
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function kvSetJson(key, value) {
  if (inRemoteBackoff()) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKFLOW_KV_TIMEOUT_MS);
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}/${encoded}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`
      },
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    console.warn("Workflow KV write failed:", error.message);
    markRemoteBackoff();
  } finally {
    clearTimeout(timeout);
  }
}

function setCache(catalog) {
  cachedCatalog = clone(catalog);
  cacheExpiresAt = Date.now() + WORKFLOW_CACHE_MS;
}

async function getWorkflowCatalog() {
  if (cachedCatalog && Date.now() < cacheExpiresAt) {
    return clone(cachedCatalog);
  }

  let catalog = null;

  if (KV_ENABLED && !inRemoteBackoff()) {
    catalog = await kvGetJson(WORKFLOW_KV_KEY);
  } else if (memoryCatalog) {
    catalog = clone(memoryCatalog);
  }

  const normalized = sanitizeCatalog(catalog || getDefaultFlowCatalog());
  setCache(normalized);
  return clone(normalized);
}

async function saveWorkflowCatalog(nextCatalog) {
  const normalized = sanitizeCatalog(nextCatalog);

  if (KV_ENABLED && !inRemoteBackoff()) {
    await kvSetJson(WORKFLOW_KV_KEY, normalized);
  } else {
    memoryCatalog = clone(normalized);
  }

  setCache(normalized);
  return clone(normalized);
}

async function resetWorkflowCatalog() {
  const defaults = sanitizeCatalog(getDefaultFlowCatalog());

  if (KV_ENABLED && !inRemoteBackoff()) {
    await kvSetJson(WORKFLOW_KV_KEY, defaults);
  } else {
    memoryCatalog = clone(defaults);
  }

  setCache(defaults);
  return clone(defaults);
}

function toNodeMessageMap(workflow) {
  const map = {};
  for (const node of workflow?.nodes || []) {
    if (node?.id) {
      map[node.id] = String(node.botMessage || "");
    }
  }
  return map;
}

function toRouteMap(workflow) {
  const routes = {};
  for (const edge of workflow?.edges || []) {
    if (!edge?.routeKey || edge.disabled) {
      continue;
    }
    routes[edge.routeKey] = edge.to;
  }
  return routes;
}

async function getChatbotRuntimeConfig() {
  const catalog = await getWorkflowCatalog();
  const workflow = (catalog.workflows || []).find(wf => wf.id === "wf_order");
  return {
    workflow: workflow ? clone(workflow) : { id: "wf_order", nodes: [], edges: [] },
    nodeMessages: toNodeMessageMap(workflow),
    routes: toRouteMap(workflow)
  };
}

module.exports = {
  getWorkflowCatalog,
  saveWorkflowCatalog,
  resetWorkflowCatalog,
  getChatbotRuntimeConfig
};
