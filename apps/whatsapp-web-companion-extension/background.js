const DEFAULT_SETTINGS = {
  apiBaseUrl: "http://localhost:3000",
  apiToken: "",
  refreshIntervalSeconds: 5
};

function sanitizeSettings(input) {
  const safe = input && typeof input === "object" ? input : {};
  const apiBaseUrl = String(safe.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl)
    .trim()
    .replace(/\/+$/, "");
  const apiToken = String(safe.apiToken || "").trim();
  const refreshIntervalSeconds = Math.max(3, Math.min(Number(safe.refreshIntervalSeconds || DEFAULT_SETTINGS.refreshIntervalSeconds), 180));

  return {
    apiBaseUrl: apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl,
    apiToken,
    refreshIntervalSeconds
  };
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return sanitizeSettings(stored);
}

async function saveSettings(nextSettings) {
  const sanitized = sanitizeSettings(nextSettings);
  await chrome.storage.sync.set(sanitized);
  return sanitized;
}

async function fetchCompanionPayload(settings) {
  const candidateBaseUrls = [DEFAULT_SETTINGS.apiBaseUrl];
  if (!candidateBaseUrls.includes(settings.apiBaseUrl)) {
    candidateBaseUrls.push(settings.apiBaseUrl);
  }
  if (!candidateBaseUrls.includes("https://whatsapp-bot-node-chatbot1.vercel.app")) {
    candidateBaseUrls.push("https://whatsapp-bot-node-chatbot1.vercel.app");
  }

  let lastError = null;

  for (const baseUrl of candidateBaseUrls) {
    const url = new URL("/api/companion/conversations", baseUrl);
    url.searchParams.set("limit", "180");

    const headers = {
      Accept: "application/json"
    };

    if (settings.apiToken) {
      headers.Authorization = `Bearer ${settings.apiToken}`;
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        headers
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`companion_fetch_failed:${response.status}:${detail}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("companion_fetch_failed");
}

async function buildState() {
  const settings = await getSettings();
  const payload = await fetchCompanionPayload(settings);
  return {
    ok: true,
    settings,
    payload
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await getSettings();
  await chrome.storage.sync.set(current);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = String(message?.type || "");

  if (type === "wa-companion:get-state") {
    buildState()
      .then(sendResponse)
      .catch(error => {
        sendResponse({
          ok: false,
          error: String(error?.message || "companion_unknown_error")
        });
      });
    return true;
  }

  if (type === "wa-companion:get-settings") {
    getSettings()
      .then(settings => sendResponse({ ok: true, settings }))
      .catch(error => sendResponse({ ok: false, error: String(error?.message || "settings_read_failed") }));
    return true;
  }

  if (type === "wa-companion:save-settings") {
    saveSettings(message?.settings)
      .then(settings => sendResponse({ ok: true, settings }))
      .catch(error => sendResponse({ ok: false, error: String(error?.message || "settings_save_failed") }));
    return true;
  }

  if (type === "wa-companion:open-options") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
