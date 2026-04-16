const puppeteer = require("puppeteer");
const { Client, LocalAuth, NoAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

const { config } = require("./config");

let client = null;
let initialized = false;
let isReady = false;
let isAuthenticated = false;
let disconnectReason = "";
let initializePromise = null;
let latestQr = "";
const observedPages = new WeakSet();
const observedBrowsers = new WeakSet();
let runtimeRecoveryPromise = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isExecutionContextError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("Protocol error (Runtime.callFunctionOn)") ||
    message.includes("Cannot find context with specified id")
  );
}

async function waitForStableWhatsAppPage(page, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await reconcileOperationalWhatsAppPage().catch(() => null);
      const activePage = client?.pupPage || page;
      const snapshot = await activePage.evaluate(() => ({
        url: window.location.href,
        hasDebug: Boolean(window.Debug?.VERSION),
        socketState: window.require?.("WAWebSocketModel")?.Socket?.state || null
      }));

      const onWhatsAppWeb = typeof snapshot.url === "string" && snapshot.url.startsWith("https://web.whatsapp.com/");
      const stableSocket =
        snapshot.socketState === "UNPAIRED" ||
        snapshot.socketState === "UNPAIRED_IDLE" ||
        snapshot.socketState === "OPENING" ||
        snapshot.socketState === "CONNECTED";

      if (onWhatsAppWeb && snapshot.hasDebug && stableSocket) {
        await sleep(1200);
        return true;
      }
    } catch {
      // la pagina todavia se esta acomodando
    }

    await sleep(500);
  }

  return false;
}

function shouldUseWebTransport() {
  return config.whatsappTransport === "web" && !config.whatsappMockMode;
}

function markRuntimeDisconnected(reason) {
  isReady = false;
  isAuthenticated = false;
  latestQr = "";
  disconnectReason = String(reason || "browser_page_closed");
  initializePromise = null;
  initialized = false;
}

function isBrowserHealthy(browser) {
  if (!browser) {
    return false;
  }

  try {
    return typeof browser.isConnected === "function" ? browser.isConnected() : true;
  } catch {
    return false;
  }
}

async function connectConfiguredBrowser() {
  if (!shouldUseConnectedBrowser()) {
    return null;
  }

  if (isBrowserHealthy(client?.pupBrowser)) {
    return client.pupBrowser;
  }

  const browserURL = String(config.whatsappWebBrowserUrl || "").trim();
  const browserWSEndpoint = String(config.whatsappWebBrowserWsEndpoint || "").trim();
  if (!browserURL && !browserWSEndpoint) {
    return null;
  }

  const browser = await puppeteer.connect({
    browserURL: browserURL || undefined,
    browserWSEndpoint: browserWSEndpoint || undefined,
    defaultViewport: null
  });

  if (client) {
    client.pupBrowser = browser;
  }

  return browser;
}

async function refreshConnectedBrowserRuntimeState(page) {
  if (!shouldUseConnectedBrowser() || !isPageHealthy(page)) {
    return false;
  }

  const snapshot = await page.evaluate(() => ({
    href: String(window.location.href || ""),
    hasPane: Boolean(document.querySelector("#pane-side")),
    hasMain: Boolean(document.querySelector("#main")),
    hasStore: typeof window.Store !== "undefined",
    hasDebug: Boolean(window.Debug?.VERSION),
    hasSynced: Boolean(window.AuthStore?.AppState?.hasSynced),
    socketState: window.require?.("WAWebSocketModel")?.Socket?.state || null
  })).catch(() => null);

  if (!snapshot) {
    return false;
  }

  const onWhatsAppWeb = snapshot.href.startsWith("https://web.whatsapp.com/");
  const authenticated =
    onWhatsAppWeb &&
    (
      snapshot.hasPane ||
      snapshot.hasMain ||
      snapshot.hasStore ||
      snapshot.hasSynced ||
      snapshot.socketState === "CONNECTED"
    );

  const ready =
    authenticated &&
    (
      snapshot.hasPane ||
      snapshot.hasMain ||
      snapshot.hasStore
    );

  if (!authenticated) {
    return false;
  }

  initialized = true;
  isAuthenticated = true;
  isReady = Boolean(ready);
  latestQr = "";
  disconnectReason = "";
  return true;
}

function scheduleRuntimeRecovery(reason = "browser_page_closed") {
  if (runtimeRecoveryPromise) {
    return runtimeRecoveryPromise;
  }

  runtimeRecoveryPromise = (async () => {
    try {
      const recoveredPage = await reconcileOperationalWhatsAppPage({ allowReconnect: true, reason });
      if (recoveredPage && isPageHealthy(recoveredPage)) {
        return recoveredPage;
      }
      return null;
    } finally {
      runtimeRecoveryPromise = null;
    }
  })();

  return runtimeRecoveryPromise;
}

function bindRuntimeObservers(page) {
  if (!page || observedPages.has(page)) {
    return;
  }

  observedPages.add(page);
  page.on("close", () => {
    if (client?.pupPage && client.pupPage !== page) {
      return;
    }

    console.warn("La pagina de WhatsApp Web usada por el bot se cerro.");
    scheduleRuntimeRecovery("browser_page_closed")
      .then(recoveredPage => {
        if (!recoveredPage || !isPageHealthy(recoveredPage)) {
          markRuntimeDisconnected("browser_page_closed");
        }
      })
      .catch(() => {
        markRuntimeDisconnected("browser_page_closed");
      });
  });

  try {
    const browser = typeof page.browser === "function" ? page.browser() : null;
    if (browser && !observedBrowsers.has(browser)) {
      observedBrowsers.add(browser);
      browser.on("disconnected", () => {
        if (client?.pupBrowser && client.pupBrowser !== browser) {
          return;
        }

        console.warn("El navegador remoto de WhatsApp Web se desconecto.");
        scheduleRuntimeRecovery("browser_disconnected")
          .then(recoveredPage => {
            if (!recoveredPage || !isPageHealthy(recoveredPage)) {
              markRuntimeDisconnected("browser_disconnected");
            }
          })
          .catch(() => {
            markRuntimeDisconnected("browser_disconnected");
          });
      });
    }
  } catch {
    // no bloqueamos el runtime por falta de observers del browser
  }
}

async function inspectWhatsAppPage(page) {
  if (!page) {
    return null;
  }

  try {
    const snapshot = await page.evaluate(() => ({
      href: window.location.href,
      hasPane: Boolean(document.querySelector("#pane-side")),
      hasStore: typeof window.Store !== "undefined",
      hasMain: Boolean(document.querySelector("#main")),
      bodyText: String(document.body?.innerText || "").slice(0, 500)
    }));

    const useHere = snapshot.bodyText.includes("Usar aquí") || snapshot.bodyText.includes("Usar aqui");
    const score =
      (snapshot.hasPane ? 100 : 0) +
      (snapshot.hasStore ? 50 : 0) +
      (snapshot.hasMain ? 20 : 0) -
      (useHere ? 200 : 0);

    return {
      page,
      href: String(snapshot.href || ""),
      hasPane: Boolean(snapshot.hasPane),
      hasStore: Boolean(snapshot.hasStore),
      hasMain: Boolean(snapshot.hasMain),
      useHere,
      score
    };
  } catch {
    return null;
  }
}

async function reconcileOperationalWhatsAppPage(options = {}) {
  const currentPage = client?.pupPage || null;
  let browser = null;

  if (isPageHealthy(currentPage)) {
    try {
      browser = typeof currentPage.browser === "function" ? currentPage.browser() : null;
    } catch {
      browser = null;
    }
  }

  if (!isBrowserHealthy(browser) && isBrowserHealthy(client?.pupBrowser)) {
    browser = client.pupBrowser;
  }

  if (!isBrowserHealthy(browser) && options.allowReconnect) {
    browser = await connectConfiguredBrowser().catch(() => null);
  }

  if (!isBrowserHealthy(browser)) {
    if (isPageHealthy(currentPage)) {
      bindRuntimeObservers(currentPage);
      await refreshConnectedBrowserRuntimeState(currentPage).catch(() => false);
      return currentPage;
    }
    return null;
  }

  if (client) {
    client.pupBrowser = browser;
  }

  const pages = await browser.pages().catch(() => []);
  const candidates = [];

  for (const page of pages) {
    const url = String(page.url() || "");
    if (!url.startsWith("https://web.whatsapp.com/")) {
      continue;
    }

    const inspected = await inspectWhatsAppPage(page);
    if (inspected) {
      candidates.push(inspected);
    }
  }

  if (!candidates.length) {
    if (isPageHealthy(currentPage)) {
      bindRuntimeObservers(currentPage);
      await refreshConnectedBrowserRuntimeState(currentPage).catch(() => false);
      return currentPage;
    }
    return null;
  }

  candidates.sort((left, right) => right.score - left.score);
  const operational = candidates[0];

  if (operational?.page && client.pupPage !== operational.page) {
    client.pupPage = operational.page;
    console.log("Se cambio automaticamente a la pestaña operativa de WhatsApp Web.");
  }

  if (client) {
    client.pupBrowser = browser;
  }

  bindRuntimeObservers(client.pupPage);
  await refreshConnectedBrowserRuntimeState(client.pupPage).catch(() => false);

  for (const candidate of candidates.slice(1)) {
    if (!candidate.useHere) {
      continue;
    }

    try {
      await candidate.page.close({ runBeforeUnload: false });
    } catch {
      // si no se puede cerrar, seguimos con la pagina buena
    }
  }

  return client.pupPage;
}

function isPageHealthy(page) {
  if (!page) {
    return false;
  }

  try {
    return typeof page.isClosed === "function" ? !page.isClosed() : true;
  } catch {
    return false;
  }
}

function shouldUseConnectedBrowser() {
  return config.whatsappWebAuthMode === "connected_browser";
}

function findInstalledBrowser() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function getExplicitExecutable() {
  if (config.whatsappWebExecutablePath && fs.existsSync(config.whatsappWebExecutablePath)) {
    return config.whatsappWebExecutablePath;
  }

  return findInstalledBrowser();
}

function getClient() {
  if (!shouldUseWebTransport()) {
    return null;
  }

  if (client) {
    return client;
  }

  const connectedBrowser = shouldUseConnectedBrowser();
  const explicitExecutable = connectedBrowser ? null : getExplicitExecutable();

  if (connectedBrowser) {
    console.log(
      `Adjuntando whatsapp-web.js a navegador existente: ${config.whatsappWebBrowserUrl || config.whatsappWebBrowserWsEndpoint}`
    );
  } else if (explicitExecutable) {
    console.log(`Usando navegador explicito para whatsapp-web.js: ${explicitExecutable}`);
  } else {
    console.log("Usando Chromium bundleado por puppeteer.");
  }

  if (!connectedBrowser) {
    console.log(`Usando auth data path: ${config.whatsappWebAuthDataPath}`);
  }

  client = new Client({
    authStrategy: connectedBrowser
      ? new NoAuth()
      : new LocalAuth({
          clientId: config.whatsappWebSessionName,
          dataPath: config.whatsappWebAuthDataPath
        }),
    authTimeoutMs: 120000,
    bypassCSP: true,
    deviceName: "Bot Delko",
    browserName: connectedBrowser || explicitExecutable ? "Chrome" : "Chromium",
    puppeteer: connectedBrowser
      ? {
          browserURL: config.whatsappWebBrowserUrl || undefined,
          browserWSEndpoint: config.whatsappWebBrowserWsEndpoint || undefined,
          defaultViewport: null
        }
      : {
          headless: config.whatsappWebHeadless,
          executablePath: explicitExecutable || undefined,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-session-crashed-bubble",
            "--disable-infobars"
          ]
        }
  });

  client.on("qr", qr => {
    latestQr = String(qr || "");
    console.log("Escanea este QR con el WhatsApp de la farmacia desde Dispositivos vinculados:");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    console.log("Cliente whatsapp-web.js listo y conectado.");
    isReady = true;
    isAuthenticated = true;
    latestQr = "";
    disconnectReason = "";
  });

  client.on("authenticated", () => {
    console.log("Sesion autenticada en whatsapp-web.js.");
    isAuthenticated = true;
    latestQr = "";
  });

  client.on("loading_screen", (percent, message) => {
    console.log(`Carga WhatsApp Web: ${percent}% ${message || ""}`.trim());
  });

  client.on("disconnected", reason => {
    console.error("Cliente whatsapp-web.js desconectado:", reason);
    isReady = false;
    isAuthenticated = false;
    latestQr = "";
    disconnectReason = String(reason || "");
    initializePromise = null;
    initialized = false;
  });

  client.on("auth_failure", message => {
    console.error("Fallo la autenticacion de whatsapp-web.js:", message);
    isReady = false;
    isAuthenticated = false;
    latestQr = "";
    disconnectReason = String(message || "auth_failure");
    initializePromise = null;
    initialized = false;
  });

  return client;
}

function initializeWhatsAppClient() {
  if (!shouldUseWebTransport()) {
    return null;
  }

  const activeClient = getClient();
  if (!activeClient) {
    return null;
  }

  if (initializePromise) {
    return activeClient;
  }

  const originalInject = activeClient.inject.bind(activeClient);
  activeClient.inject = async function injectWithRetry() {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        console.log(`Iniciando inject() de WhatsApp Web (${attempt}/4)...`);
        if (this.pupPage) {
          await reconcileOperationalWhatsAppPage().catch(() => null);
          bindRuntimeObservers(this.pupPage);
          await waitForStableWhatsAppPage(this.pupPage);
        }
        const result = await originalInject();

        if (this.pupPage) {
          await reconcileOperationalWhatsAppPage().catch(() => null);
          bindRuntimeObservers(this.pupPage);
          const syncSnapshot = await this.pupPage
            .evaluate(() => ({
              hasSynced: Boolean(window.AuthStore?.AppState?.hasSynced),
              hasStore: typeof window.Store !== "undefined",
              hasWWebJS: typeof window.WWebJS !== "undefined"
            }))
            .catch(() => null);

          if (syncSnapshot?.hasSynced && (!syncSnapshot.hasStore || !syncSnapshot.hasWWebJS)) {
            console.log("WhatsApp Web ya estaba sincronizado; disparando post-sync manual para completar la inyeccion...");
            try {
              await this.pupPage.evaluate(async () => {
                if (typeof window.onAppStateHasSyncedEvent === "function") {
                  await window.onAppStateHasSyncedEvent();
                }
              });
            } catch (manualSyncError) {
              const fallbackSnapshot = await this.pupPage
                .evaluate(() => ({
                  hasStore: typeof window.Store !== "undefined",
                  hasWWebJS: typeof window.WWebJS !== "undefined"
                }))
                .catch(() => null);

              if (fallbackSnapshot?.hasStore && fallbackSnapshot?.hasWWebJS) {
                console.warn(
                  "Post-sync manual completo con listeners parciales; se continua usando poller/store fallback para mensajes entrantes."
                );
              } else {
                throw manualSyncError;
              }
            }
          }

          await this.pupPage
            .evaluate(() => {
              if (
                window.Store?.User &&
                typeof window.Store.User.getMaybeMeUser !== "function" &&
                typeof window.Store.User.getMeUser === "function"
              ) {
                window.Store.User.getMaybeMeUser = (...args) => window.Store.User.getMeUser(...args);
              }
            })
            .catch(() => null);
        }

        console.log(`inject() de WhatsApp Web completado (${attempt}/4).`);
        return result;
      } catch (error) {
        if (!isExecutionContextError(error) || attempt === 4) {
          throw error;
        }

        console.warn(`Reintentando inject() de WhatsApp Web (${attempt}/4) por contexto inestable...`);

        try {
          if (this.pupPage) {
            await this.pupPage.waitForNavigation({ waitUntil: "load", timeout: 5000 }).catch(() => null);
          }
        } catch {
          // seguimos igual
        }

        await sleep(1500);
      }
    }
  };

  initialized = true;
  console.log(
    `Inicializando cliente whatsapp-web.js... authMode=${shouldUseConnectedBrowser() ? "connected_browser" : "local_auth"}`
  );

  initializePromise = activeClient.initialize().catch(error => {
    isReady = false;
    isAuthenticated = false;
    disconnectReason = String(error?.message || error || "initialize_failed");
    initialized = false;
    initializePromise = null;
    console.error("Fallo la inicializacion de whatsapp-web.js:", error);
  });

  return activeClient;
}

function getIsReady() {
  return isReady || isAuthenticated;
}

function getRuntimeStatus() {
  if (client?.pupPage || shouldUseConnectedBrowser()) {
    reconcileOperationalWhatsAppPage({ allowReconnect: shouldUseConnectedBrowser() }).catch(() => null);
  }
  const activePage = client?.pupPage || null;
  const pageHealthy = isPageHealthy(activePage);
  if (pageHealthy && shouldUseConnectedBrowser() && (!isAuthenticated || !isReady)) {
    refreshConnectedBrowserRuntimeState(activePage).catch(() => null);
  }
  const ready = Boolean((isReady || isAuthenticated) && pageHealthy);
  const authenticated = Boolean(isAuthenticated && pageHealthy);
  const fullyReady = Boolean(isReady && pageHealthy);
  const qrAvailable = Boolean(latestQr);
  const awaitingScan = Boolean(
    !authenticated &&
      qrAvailable &&
      (disconnectReason === "" || disconnectReason === "browser_page_closed" || disconnectReason === "auth_failure")
  );

  return {
    transport: config.whatsappTransport,
    enabled: shouldUseWebTransport(),
    authMode: shouldUseConnectedBrowser() ? "connected_browser" : "local_auth",
    initialized,
    ready,
    sessionReady: fullyReady,
    fullyReady,
    authenticated,
    qrAvailable,
    awaitingScan,
    pageHealthy,
    disconnectReason: pageHealthy ? disconnectReason : disconnectReason || "browser_page_closed"
  };
}

function getLatestQr() {
  return latestQr;
}

module.exports = {
  getClient,
  initializeWhatsAppClient,
  getIsReady,
  getRuntimeStatus,
  getLatestQr,
  reconcileOperationalWhatsAppPage
};
