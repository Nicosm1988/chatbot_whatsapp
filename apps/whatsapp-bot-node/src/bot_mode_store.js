const { Pool } = require("pg");
const { config, isVercelRuntime } = require("./config");

const CONNECTION_STRING =
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || "";

const VALID_MODES = new Set(["chatbot", "holding"]);
const FALLBACK_MODE = (() => {
  const envMode = String(process.env.BOT_MODE || "").trim().toLowerCase();
  return VALID_MODES.has(envMode) ? envMode : "chatbot";
})();

const HOLDING_MESSAGE =
  "¡Hola! Gracias por escribirnos a Farmacia Delko. Recibimos tu mensaje y en los próximos minutos uno de nuestros asesores se va a comunicar con vos para darte la mejor atención. Agradecemos tu paciencia, ¡ya estamos con vos!";

const FAST_LOCAL_BOT_MODE_CACHE =
  config.whatsappTransport === "web" && !isVercelRuntime && process.env.NODE_ENV !== "test";
const BOT_MODE_CACHE_MS = Math.max(
  0,
  Number(process.env.BOT_MODE_CACHE_MS || (FAST_LOCAL_BOT_MODE_CACHE ? 60000 : 2500))
);
const BOT_MODE_QUERY_TIMEOUT_MS = Math.max(
  250,
  Number(process.env.BOT_MODE_QUERY_TIMEOUT_MS || (FAST_LOCAL_BOT_MODE_CACHE ? 250 : 2500))
);
const BOT_MODE_REMOTE_BACKOFF_MS = Math.max(
  10000,
  Number(process.env.BOT_MODE_REMOTE_BACKOFF_MS || (FAST_LOCAL_BOT_MODE_CACHE ? 300000 : 30000))
);

let pool = null;
let schemaReady = false;
let cachedMode = FALLBACK_MODE;
let cachedModeExpiresAt = 0;
let remoteBackoffUntil = 0;

function inRemoteBackoff() {
  return FAST_LOCAL_BOT_MODE_CACHE && remoteBackoffUntil > Date.now();
}

function markRemoteBackoff() {
  if (!FAST_LOCAL_BOT_MODE_CACHE) {
    return;
  }
  remoteBackoffUntil = Date.now() + BOT_MODE_REMOTE_BACKOFF_MS;
}

function getPool() {
  if (inRemoteBackoff()) {
    return null;
  }

  if (!CONNECTION_STRING) {
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 30000,
      statement_timeout: BOT_MODE_QUERY_TIMEOUT_MS,
      query_timeout: BOT_MODE_QUERY_TIMEOUT_MS
    });
  }
  return pool;
}

async function ensureSchema(activePool) {
  if (schemaReady || !activePool) {
    return;
  }
  await activePool.query(
    `CREATE TABLE IF NOT EXISTS bot_settings (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  schemaReady = true;
}

async function getBotMode() {
  if (Date.now() < cachedModeExpiresAt) {
    return cachedMode;
  }

  const activePool = getPool();
  if (!activePool) {
    cachedModeExpiresAt = Date.now() + BOT_MODE_CACHE_MS;
    return cachedMode;
  }
  try {
    await ensureSchema(activePool);
    const { rows } = await activePool.query(
      "SELECT value FROM bot_settings WHERE key = 'bot_mode' LIMIT 1"
    );
    const stored = rows[0]?.value;
    if (stored && VALID_MODES.has(stored)) {
      cachedMode = stored;
      cachedModeExpiresAt = Date.now() + BOT_MODE_CACHE_MS;
      return stored;
    }
    cachedModeExpiresAt = Date.now() + BOT_MODE_CACHE_MS;
    return FALLBACK_MODE;
  } catch (error) {
    console.error("bot_mode_store.getBotMode failed:", error?.message || error);
    markRemoteBackoff();
    cachedModeExpiresAt = Date.now() + BOT_MODE_CACHE_MS;
    return cachedMode;
  }
}

async function setBotMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (!VALID_MODES.has(normalized)) {
    const err = new Error("invalid_bot_mode");
    err.code = "invalid_bot_mode";
    throw err;
  }
  cachedMode = normalized;
  cachedModeExpiresAt = Date.now() + BOT_MODE_CACHE_MS;
  const activePool = getPool();
  if (!activePool) {
    return { mode: normalized, persisted: false };
  }
  try {
    await ensureSchema(activePool);
    await activePool.query(
      `INSERT INTO bot_settings (key, value, updated_at)
       VALUES ('bot_mode', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [normalized]
    );
    return { mode: normalized, persisted: true };
  } catch (error) {
    console.error("bot_mode_store.setBotMode failed:", error?.message || error);
    markRemoteBackoff();
    return { mode: normalized, persisted: false };
  }
}

module.exports = {
  getBotMode,
  setBotMode,
  HOLDING_MESSAGE,
  VALID_MODES: Array.from(VALID_MODES),
  FALLBACK_MODE
};
