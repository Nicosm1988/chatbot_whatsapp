function send(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
}

async function loadSettings() {
  const response = await send({ type: "wa-companion:get-settings" });
  if (!response?.ok) {
    throw new Error(response?.error || "settings_load_failed");
  }
  return response.settings;
}

function readForm() {
  return {
    apiBaseUrl: document.getElementById("api-base-url").value,
    apiToken: document.getElementById("api-token").value,
    refreshIntervalSeconds: document.getElementById("refresh-interval").value
  };
}

function paintStatus(text, tone) {
  const node = document.getElementById("status");
  node.textContent = text;
  node.className = tone === "error" ? "err" : tone === "ok" ? "ok" : "muted";
}

async function boot() {
  const saveButton = document.getElementById("save");
  const testButton = document.getElementById("test");
  const settings = await loadSettings();

  document.getElementById("api-base-url").value = settings.apiBaseUrl || "";
  document.getElementById("api-token").value = settings.apiToken || "";
  document.getElementById("refresh-interval").value = settings.refreshIntervalSeconds || 20;
  paintStatus("Configuracion cargada.", "ok");

  saveButton.onclick = async () => {
    paintStatus("Guardando...", "muted");
    const response = await send({
      type: "wa-companion:save-settings",
      settings: readForm()
    });

    if (!response?.ok) {
      paintStatus(`No pude guardar: ${response?.error || "save_failed"}`, "error");
      return;
    }

    paintStatus("Configuracion guardada.", "ok");
  };

  testButton.onclick = async () => {
    paintStatus("Probando conexion...", "muted");
    const saveResponse = await send({
      type: "wa-companion:save-settings",
      settings: readForm()
    });

    if (!saveResponse?.ok) {
      paintStatus(`No pude guardar antes de probar: ${saveResponse?.error || "save_failed"}`, "error");
      return;
    }

    const stateResponse = await send({ type: "wa-companion:get-state" });
    if (!stateResponse?.ok) {
      paintStatus(`Conexion fallida: ${stateResponse?.error || "fetch_failed"}`, "error");
      return;
    }

    const total = Number(stateResponse.payload?.summary?.total || 0);
    paintStatus(`Conexion OK. Conversaciones detectadas: ${total}.`, "ok");
  };
}

boot().catch(error => {
  paintStatus(`Error inicial: ${String(error?.message || "options_boot_failed")}`, "error");
});
