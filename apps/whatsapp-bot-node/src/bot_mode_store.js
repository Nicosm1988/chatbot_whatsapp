const { Pool } = require("pg");

const CONNECTION_STRING =
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || "";

const VALID_MODES = new Set(["chatbot", "holding"]);
const FALLBACK_MODE = (() => {
  const envMode = String(process.env.BOT_MODE || "").trim().toLowerCase();
  return VALID_MODES.has(envMode) ? envMode : "chatbot";
})();

const HOLDING_MESSAGE =
  "¡Hola! Gracias por escribirnos a Farmacia Delko. Recibimos tu mensaje y en los próximos minutos uno de nuestros asesores se va a comunicar con vos para darte la mejor atención. Agradecemos tu paciencia, ¡ya estamos con vos!";

let pool = null;
let schemaReady = false;
let cachedMode = FALLBACK_MODE;

function getPool() {
  if (!CONNECTION_STRING) {
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 30000
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
  const activePool = getPool();
  if (!activePool) {
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
      return stored;
    }
    return FALLBACK_MODE;
  } catch (error) {
    console.error("bot_mode_store.getBotMode failed:", error?.message || error);
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
