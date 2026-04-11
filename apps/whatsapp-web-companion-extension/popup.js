function send(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
}

async function boot() {
  const status = document.getElementById("status");
  const openWhatsapp = document.getElementById("open-whatsapp");
  const openOptions = document.getElementById("open-options");

  openWhatsapp.onclick = () => {
    chrome.tabs.create({ url: "https://web.whatsapp.com/" });
  };

  openOptions.onclick = () => {
    chrome.runtime.openOptionsPage();
  };

  const response = await send({ type: "wa-companion:get-settings" });
  if (!response?.ok) {
    status.textContent = "No pude leer la configuracion.";
    return;
  }

  status.textContent = `Backend: ${response.settings.apiBaseUrl}`;
}

boot().catch(error => {
  const status = document.getElementById("status");
  status.textContent = `Error: ${String(error?.message || "popup_failed")}`;
});
