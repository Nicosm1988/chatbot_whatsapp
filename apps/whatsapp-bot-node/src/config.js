const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

const APP_ROOT = path.resolve(__dirname, "..");
const LOCAL_ENV_PATH = path.join(APP_ROOT, ".env.local");
const DEFAULT_ENV_PATH = path.join(APP_ROOT, ".env");

if (fs.existsSync(LOCAL_ENV_PATH)) {
  dotenv.config({ path: LOCAL_ENV_PATH });
}

if (fs.existsSync(DEFAULT_ENV_PATH)) {
  dotenv.config({ path: DEFAULT_ENV_PATH, override: false });
}

function requireEnv(name) {
  const rawValue = process.env[name];
  const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

function readNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readJson(value, defaultValue) {
  const raw = String(value || "").trim();
  if (!raw) {
    return defaultValue;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function readTransport(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_PHONE_NUMBER_ID ? "cloud" : "web";
  }

  if (normalized === "cloud" || normalized === "web") {
    return normalized;
  }

  throw new Error("WHATSAPP_TRANSPORT must be either 'cloud' or 'web'");
}

function readWhatsAppWebAuthMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "connected_browser";
  }

  if (normalized === "local_auth" || normalized === "connected_browser") {
    return normalized;
  }

  throw new Error("WHATSAPP_WEB_AUTH_MODE must be either 'local_auth' or 'connected_browser'");
}

function defaultWhatsAppWebAuthPath() {
  const localAppData = String(process.env.LOCALAPPDATA || "").trim();
  if (localAppData) {
    return `${localAppData}\\DelkoBot\\wwebjs-auth`;
  }

  return ".wwebjs_auth";
}

const isVercelRuntime = Boolean(process.env.VERCEL_URL || process.env.NOW_REGION || process.env.VERCEL_REGION);
const isProductionRuntime = process.env.NODE_ENV === "production" || isVercelRuntime;
const whatsappMockMode = readBoolean(process.env.WHATSAPP_MOCK_MODE, false);
const whatsappTransport = readTransport(process.env.WHATSAPP_TRANSPORT);
const whatsappWebAuthMode = readWhatsAppWebAuthMode(process.env.WHATSAPP_WEB_AUTH_MODE);
const whatsappAppSecret = String(process.env.WHATSAPP_APP_SECRET || "").trim();
const isCloudTransport = whatsappTransport === "cloud";
const defaultNativeLabelMap = {
  delivery: ["Delivery"],
  mostrador: ["Mostrador"],
  particular: ["Particular"],
  programa_obesidad_y_diabetes: ["Programa de sobrepeso y diabetes"],
  obra_social: ["Obra social"],
  esperando_asesor: ["Esperando a ser atendido por asesor"],
  finalizado: ["Finalizado"],
  test_run: ["Prueba"]
};
const whatsappSignatureRequired = readBoolean(
  process.env.WHATSAPP_ENFORCE_SIGNATURE,
  isCloudTransport && isProductionRuntime && Boolean(whatsappAppSecret) && !whatsappMockMode
);

if (whatsappSignatureRequired && !whatsappAppSecret) {
  throw new Error("WHATSAPP_ENFORCE_SIGNATURE=true requires WHATSAPP_APP_SECRET");
}

const config = {
  port: Number((process.env.PORT || "3000").trim()),
  metaApiVersion: (process.env.META_API_VERSION || "v22.0").trim(),
  businessDisplayName: (process.env.BUSINESS_DISPLAY_NAME || "Farmacia Delko").trim(),
  catalogWebUrl: (process.env.CATALOG_WEB_URL || "https://www.selmadigital.com.ar").trim(),
  mercadoLibreUrl: (process.env.MERCADOLIBRE_URL || "https://www.mercadolibre.com.ar").trim(),
  shippingPromoImageUrl: (process.env.SHIPPING_PROMO_IMAGE_URL || "").trim(),
  paymentLinkUrl: (process.env.PAYMENT_LINK_URL || "https://mpago.la/demo").trim(),
  whatsappTransport,
  whatsappAccessToken:
    isCloudTransport && !whatsappMockMode
      ? requireEnv("WHATSAPP_ACCESS_TOKEN")
      : (process.env.WHATSAPP_ACCESS_TOKEN || "mock-token").trim(),
  whatsappPhoneNumberId:
    isCloudTransport && !whatsappMockMode
      ? requireEnv("WHATSAPP_PHONE_NUMBER_ID")
      : (process.env.WHATSAPP_PHONE_NUMBER_ID || "mock-phone-number-id").trim(),
  whatsappWebhookVerifyToken:
    isCloudTransport
      ? requireEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN")
      : (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "web-transport").trim(),
  whatsappAppSecret,
  whatsappSignatureRequired,
  whatsappWebhookBodyLimitKb: Math.max(64, readNumber(process.env.WHATSAPP_WEBHOOK_BODY_LIMIT_KB, 256)),
  whatsappMockMode,
  whatsappWebAuthMode,
  whatsappWebSessionName: (process.env.WHATSAPP_WEB_SESSION_NAME || "farmacia-delko").trim(),
  whatsappWebAuthDataPath: String(process.env.WHATSAPP_WEB_AUTH_DATA_PATH || defaultWhatsAppWebAuthPath()).trim(),
  whatsappWebHeadless: readBoolean(process.env.WHATSAPP_WEB_HEADLESS, false),
  whatsappWebExecutablePath: String(process.env.WHATSAPP_WEB_EXECUTABLE_PATH || "").trim(),
  whatsappWebBrowserUrl: String(process.env.WHATSAPP_WEB_BROWSER_URL || "").trim(),
  whatsappWebBrowserWsEndpoint: String(process.env.WHATSAPP_WEB_BROWSER_WS_ENDPOINT || "").trim(),
  whatsappWebIncomingPollIntervalMs: Math.max(
    250,
    readNumber(process.env.WHATSAPP_WEB_INCOMING_POLL_INTERVAL_MS, 400)
  ),
  whatsappWebHealthyPollIntervalMs: Math.max(
    1000,
    readNumber(process.env.WHATSAPP_WEB_HEALTHY_POLL_INTERVAL_MS, 2000)
  ),
  whatsappWebBridgeReconcileIntervalMs: Math.max(
    1000,
    readNumber(process.env.WHATSAPP_WEB_BRIDGE_RECONCILE_INTERVAL_MS, 1500)
  ),
  whatsappWebIncomingLookbackSeconds: Math.max(
    60,
    readNumber(process.env.WHATSAPP_WEB_INCOMING_LOOKBACK_SECONDS, 300)
  ),
  whatsappWebRemoteCachePath: String(
    process.env.WHATSAPP_WEB_REMOTE_CACHE_PATH ||
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1037144458-alpha.html"
  ).trim(),
  whatsappWebInlineOverlayEnabled: readBoolean(process.env.WHATSAPP_WEB_INLINE_OVERLAY_ENABLED, whatsappTransport === "web"),
  whatsappWebNativeLabelsEnabled: readBoolean(process.env.WHATSAPP_WEB_NATIVE_LABELS_ENABLED, whatsappTransport === "web"),
  whatsappWebNativeLabelBootstrapOnStart: readBoolean(
    process.env.WHATSAPP_WEB_NATIVE_LABEL_BOOTSTRAP_ON_START,
    whatsappTransport === "web"
  ),
  whatsappWebNativeLabelMap: readJson(process.env.WHATSAPP_WEB_NATIVE_LABEL_MAP_JSON, defaultNativeLabelMap),
  agenticMode: readBoolean(process.env.AGENTIC_MODE, false),
  openaiApiKey: (process.env.OPENAI_API_KEY || "").trim()
};

module.exports = { config, isProductionRuntime, isVercelRuntime };
