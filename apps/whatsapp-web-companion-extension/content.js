const ROOT_ID = "taligent-wa-companion-host";
const PANEL_STYLE = `
  :host{all:initial}
  *{box-sizing:border-box}
  .shell{font-family:system-ui,sans-serif;display:flex;align-items:flex-end;gap:10px}
  .fab{border:1px solid rgba(65,111,161,.92);background:#0d223c;color:#eef6ff;border-radius:999px;padding:12px 16px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 16px 44px rgba(0,0,0,.28)}
  .fab:hover{border-color:#6aa7f0}
  .panel{width:340px;max-height:72vh;display:grid;grid-template-rows:auto auto auto 1fr;gap:10px;background:rgba(6,14,24,.98);color:#eff6ff;border:1px solid rgba(62,103,148,.84);border-radius:20px;padding:14px;box-shadow:0 26px 56px rgba(0,0,0,.42)}
  .shell.collapsed .panel{display:none}
  .shell:not(.collapsed) .fab{display:none}
  .top{display:grid;gap:8px}
  .line{display:flex;align-items:center;gap:8px}
  .line.space{justify-content:space-between}
  .kicker{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;background:rgba(57,167,255,.15);border:1px solid rgba(57,167,255,.35);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#a7dbff}
  .title{font-size:18px;font-weight:700}
  .meta{font-size:12px;color:#97aac5}
  .btn{border:1px solid rgba(67,106,146,.86);background:#10263f;color:#eff6ff;border-radius:10px;padding:8px 10px;font:inherit;cursor:pointer}
  .btn:hover{border-color:#6aa7f0}
  .search{width:100%;border:1px solid rgba(67,106,146,.86);background:#0f2138;color:#eff6ff;border-radius:12px;padding:10px 12px;font:inherit}
  .groups{display:grid;gap:10px}
  .group{display:grid;gap:6px}
  .group-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7d93b3}
  .chips{display:flex;gap:6px;flex-wrap:wrap}
  .chip{border:1px solid rgba(67,106,146,.86);background:#0d2138;color:#cfe8ff;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui,sans-serif;cursor:pointer}
  .chip.active{background:#173a63;border-color:#72b6ff;color:#fff}
  .chip small{opacity:.75}
  .list{overflow:auto;display:grid;gap:8px;padding-right:2px}
  .card{display:grid;gap:7px;border:1px solid rgba(55,83,116,.95);background:#0d1a2c;border-radius:14px;padding:11px}
  .card.focused{border-color:#4ec39b;box-shadow:0 0 0 1px rgba(78,195,155,.28) inset}
  .top-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:2px}
  .name{font-size:13px;font-weight:700}
  .status{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
  .status.open{background:rgba(70,167,255,.16);color:#a9dcff}
  .status.agent_pending{background:rgba(255,185,84,.16);color:#ffd18b}
  .status.closed{background:rgba(69,198,136,.16);color:#93e4bc}
  .summary{font-size:12px;line-height:1.45;color:#d6e6fa}
  .sub{font-size:11px;color:#90a4c0}
  .tags{display:flex;gap:6px;flex-wrap:wrap}
  .tag{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:rgba(19,46,76,.92);border:1px solid rgba(79,149,221,.42);font-size:10px;color:#d0e9ff;font-weight:700;letter-spacing:.02em}
  .tag.delivery{background:rgba(21,72,114,.94);border-color:rgba(90,175,255,.55);color:#d6efff}
  .tag.mostrador{background:rgba(86,53,17,.94);border-color:rgba(255,180,87,.55);color:#ffe1b3}
  .tag.particular{background:rgba(16,70,52,.94);border-color:rgba(88,214,162,.52);color:#cff8e7}
  .tag.programa_obesidad_y_diabetes{background:rgba(94,26,62,.94);border-color:rgba(233,96,164,.56);color:#ffd5e9}
  .tag.obra_social{background:rgba(43,46,110,.94);border-color:rgba(126,132,255,.56);color:#dce0ff}
  .tag.test_run{background:rgba(99,29,29,.94);border-color:rgba(255,122,122,.56);color:#ffd0d0}
  .taligent-wa-row-tags,.taligent-wa-header-tags{pointer-events:none;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.01em;color:#667781;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .taligent-wa-row-tags{display:inline-block;margin-inline-start:6px;max-width:180px;vertical-align:middle}
  .taligent-wa-header-tags{display:block;margin-top:6px;max-width:340px;color:#54656f}
  .empty{padding:14px 4px;color:#8ea3c0;font-size:12px;line-height:1.45}
  .error{padding:10px 12px;border-radius:12px;background:rgba(98,20,20,.42);border:1px solid rgba(255,121,121,.36);font-size:12px;color:#ffd7d7}
`;

const state = {
  payload: null,
  settings: null,
  modeFilter: "all",
  categoryFilter: "all",
  miscFilter: "all",
  search: "",
  collapsed: false,
  loading: false,
  error: "",
  focusedConversationId: "",
  refreshTimer: null,
  observer: null,
  decorateTimer: null,
  host: null,
  shadow: null
};

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function runtimeSend(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
}

function getPayload() {
  return state.payload && typeof state.payload === "object"
    ? state.payload
    : { conversations: [], filterGroups: [], summary: {} };
}

function matchesAllTags(conversation, tags) {
  const safeTags = Array.isArray(tags) ? tags : [];
  return safeTags.every(tag => Array.isArray(conversation.tagIds) && conversation.tagIds.includes(tag));
}

function getFilteredConversations() {
  const payload = getPayload();
  const term = normalize(state.search);

  return (payload.conversations || []).filter(conversation => {
    if (state.modeFilter !== "all" && !matchesAllTags(conversation, [state.modeFilter])) {
      return false;
    }
    if (state.categoryFilter !== "all" && !matchesAllTags(conversation, [state.categoryFilter])) {
      return false;
    }
    if (state.miscFilter !== "all" && !matchesAllTags(conversation, [state.miscFilter])) {
      return false;
    }
    if (!term) {
      return true;
    }

    const haystack = normalize(`${conversation.displayName} ${conversation.contactId} ${conversation.summary}`);
    return haystack.includes(term);
  });
}

function buildLookup(conversations) {
  const safe = Array.isArray(conversations) ? conversations : [];
  const latestByContactId = new Map();
  const names = new Map();
  const duplicatedNames = new Set();

  for (const conversation of safe) {
    const contactId = String(conversation.contactId || conversation.id || "").trim();
    if (!contactId) {
      continue;
    }

    const previous = latestByContactId.get(contactId) || null;
    const currentTime = Number(new Date(conversation.lastEventAt || 0).getTime() || 0);
    const previousTime = Number(new Date(previous?.lastEventAt || 0).getTime() || 0);
    if (!previous || currentTime >= previousTime) {
      latestByContactId.set(contactId, conversation);
    }
  }

  const phones = [];

  for (const conversation of latestByContactId.values()) {
    const phone = digitsOnly(conversation.contactId);
    if (phone.length >= 8) {
      phones.push({ key: phone, conversation });
    }
  }

  for (const conversation of safe) {
    const latestConversation = latestByContactId.get(String(conversation.contactId || conversation.id || "").trim()) || conversation;
    const aliases = [conversation.contactName, conversation.displayName, latestConversation.contactName, latestConversation.displayName];

    for (const alias of aliases) {
      const name = normalize(alias);
      if (name.length < 4) {
        continue;
      }

      const mappedConversation = names.get(name);
      if (mappedConversation && mappedConversation.contactId !== latestConversation.contactId) {
        duplicatedNames.add(name);
        continue;
      }

      names.set(name, latestConversation);
    }
  }

  duplicatedNames.forEach(name => names.delete(name));
  phones.sort((left, right) => right.key.length - left.key.length);

  return {
    phones,
    names: Array.from(names.entries()).sort((left, right) => right[0].length - left[0].length)
  };
}

function matchConversationFromText(text, lookup) {
  const safeLookup = lookup || buildLookup([]);
  const normalizedText = normalize(text);
  const digits = digitsOnly(text);

  if (digits.length >= 8) {
    for (const entry of safeLookup.phones) {
      if (digits.includes(entry.key) || entry.key.includes(digits)) {
        return entry.conversation;
      }
    }
  }

  for (const [name, conversation] of safeLookup.names) {
    if (normalizedText.includes(name)) {
      return conversation;
    }
  }

  return null;
}

function getFilterLabel(groupId, optionId) {
  const group = (getPayload().filterGroups || []).find(item => item.id === groupId);
  const option = (group?.options || []).find(item => item.id === optionId);
  return option?.label || "Todo";
}

function tagClassName(tagId) {
  return String(tagId || "")
    .trim()
    .replace(/\s+/g, "_");
}

function renderFilterGroup(group, activeId) {
  const safeGroup = group && typeof group === "object" ? group : { label: "", options: [] };
  const options = Array.isArray(safeGroup.options) ? safeGroup.options : [];
  return `
    <section class="group">
      <div class="group-label">${esc(safeGroup.label)}</div>
      <div class="chips">
        ${options.map(option => `
          <button class="chip ${option.id === activeId ? "active" : ""}" data-group="${esc(safeGroup.id)}" data-option="${esc(option.id)}">
            ${esc(option.label)} <small>${Number(option.count || 0)}</small>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderConversationCard(conversation) {
  const focused = conversation.id === state.focusedConversationId ? "focused" : "";
  return `
    <article class="card ${focused}" data-conversation-id="${esc(conversation.id)}">
      <div class="top-tags">
        ${(conversation.tags || []).map(tag => `<span class="tag ${esc(tagClassName(tag.id))}">${esc(tag.label)}</span>`).join("")}
      </div>
      <div class="line space">
        <div class="name">${esc(conversation.displayName)}</div>
        <span class="status ${esc(conversation.status)}">${esc(conversation.statusLabel)}</span>
      </div>
      <div class="sub">${esc(conversation.contactId || "Sin telefono visible")}</div>
      <div class="summary">${esc(conversation.summary || "Sin resumen todavia")}</div>
      <div class="sub">Ultima actividad: ${esc(conversation.lastEventAt ? new Date(conversation.lastEventAt).toLocaleString("es-AR") : "sin dato")}</div>
    </article>
  `;
}

function renderPanel() {
  const payload = getPayload();
  const filtered = getFilteredConversations();
  const groups = payload.filterGroups || [];
  const modeGroup = groups.find(group => group.id === "mode");
  const categoryGroup = groups.find(group => group.id === "category");
  const miscGroup = groups.find(group => group.id === "misc");
  const total = Number(payload.summary?.total || filtered.length || 0);
  const statusText = state.loading
    ? "Sincronizando..."
    : state.error
      ? "Error de sincronizacion"
      : `${filtered.length} visibles de ${total}`;

  state.shadow.innerHTML = `
    <style>${PANEL_STYLE}</style>
    <div class="shell ${state.collapsed ? "collapsed" : ""}">
      <button class="fab" data-action="toggle">${state.collapsed ? "Etiquetas" : "Ocultar"}</button>
      <section class="panel">
        <div class="top">
          <div class="line space">
            <span class="kicker">whatsapp web</span>
            <div class="line">
              <button class="btn" data-action="refresh">Actualizar</button>
              <button class="btn" data-action="toggle">Cerrar</button>
            </div>
          </div>
          <div class="title">Companion operativo</div>
          <div class="meta">${esc(statusText)}</div>
          <div class="meta">Modo: ${esc(getFilterLabel("mode", state.modeFilter))} · Categoria: ${esc(getFilterLabel("category", state.categoryFilter))}</div>
        </div>
        ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
        <input class="search" data-action="search" placeholder="Buscar por nombre o telefono" value="${esc(state.search)}" />
        <div class="groups">
          ${renderFilterGroup(modeGroup, state.modeFilter)}
          ${renderFilterGroup(categoryGroup, state.categoryFilter)}
          ${renderFilterGroup(miscGroup, state.miscFilter)}
        </div>
        <div class="list">
          ${filtered.length
            ? filtered.map(renderConversationCard).join("")
            : '<div class="empty">No hay conversaciones para ese filtro. Probá cambiando la modalidad o la categoria.</div>'}
        </div>
      </section>
    </div>
  `;

  bindPanelEvents();
}

function bindPanelEvents() {
  state.shadow.querySelectorAll("[data-action='toggle']").forEach(button => {
    button.onclick = () => {
      state.collapsed = !state.collapsed;
      renderPanel();
    };
  });

  const refreshButton = state.shadow.querySelector("[data-action='refresh']");
  if (refreshButton) {
    refreshButton.onclick = () => {
      refreshPayload(true).catch(() => {});
    };
  }

  const searchInput = state.shadow.querySelector("[data-action='search']");
  if (searchInput) {
    searchInput.oninput = event => {
      state.search = String(event.target.value || "");
      renderPanel();
      scheduleDecoration();
    };
  }

  state.shadow.querySelectorAll("[data-group][data-option]").forEach(button => {
    button.onclick = () => {
      const groupId = String(button.getAttribute("data-group") || "");
      const optionId = String(button.getAttribute("data-option") || "all");
      if (groupId === "mode") state.modeFilter = optionId;
      if (groupId === "category") state.categoryFilter = optionId;
      if (groupId === "misc") state.miscFilter = optionId;
      renderPanel();
      scheduleDecoration();
    };
  });

  state.shadow.querySelectorAll("[data-conversation-id]").forEach(card => {
    card.onclick = () => {
      state.focusedConversationId = String(card.getAttribute("data-conversation-id") || "");
      renderPanel();
      decorateVisibleRows();
      const focusedRow = document.querySelector("#pane-side .taligent-wa-focused");
      if (focusedRow) {
        focusedRow.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
  });
}

function clearDecorations(scope) {
  const root = scope || document;
  root.querySelectorAll(".taligent-wa-row-tags").forEach(node => node.remove());
  root.querySelectorAll(".taligent-wa-header-tags").forEach(node => node.remove());
  root.querySelectorAll(".taligent-wa-match,.taligent-wa-highlight,.taligent-wa-dim,.taligent-wa-focused").forEach(node => {
    node.classList.remove("taligent-wa-match", "taligent-wa-highlight", "taligent-wa-dim", "taligent-wa-focused");
  });
}

function collectChatRows() {
  const pane = document.querySelector("#pane-side");
  if (!pane) {
    return [];
  }

  const roleRows = Array.from(pane.querySelectorAll("[role='listitem']")).filter(node => normalize(node.innerText).length >= 4);
  if (roleRows.length) {
    return roleRows.slice(0, 80);
  }

  return Array.from(pane.querySelectorAll("div"))
    .filter(node => node.offsetHeight >= 56 && node.offsetWidth >= 220 && normalize(node.innerText).length >= 6)
    .slice(0, 80);
}

function buildTagsText(conversation) {
  return (Array.isArray(conversation?.tags) ? conversation.tags : [])
    .map(tag => String(tag?.label || "").trim())
    .filter(Boolean)
    .join(" | ");
}

function findRowAnchor(row) {
  if (!row) {
    return null;
  }

  const icon =
    row.querySelector("[data-icon='ic-label-filled']") ||
    row.querySelector("[data-icon='label-stack']");
  if (icon) {
    return icon.closest("div.x3nfvp2") || icon.parentElement?.parentElement || icon.parentElement || null;
  }

  const titleCandidate = Array.from(
    row.querySelectorAll("span[dir='auto'], div[dir='auto'], span[title], div[title]")
  ).find(node => normalize(node.textContent || node.getAttribute("title") || "").length >= 3);

  return titleCandidate?.parentElement || titleCandidate || null;
}

function appendRowTags(row, conversation, isMatchVisible) {
  if (!row || !conversation) {
    return;
  }

  row.classList.add("taligent-wa-match");
  if (state.focusedConversationId && conversation.id === state.focusedConversationId) {
    row.classList.add("taligent-wa-focused");
  }
  if (isMatchVisible) {
    row.classList.add("taligent-wa-highlight");
  } else {
    row.classList.add("taligent-wa-dim");
  }

  const tagsText = buildTagsText(conversation);
  if (!tagsText) {
    return;
  }

  const anchor = findRowAnchor(row);
  if (!anchor) {
    return;
  }
  if (row.querySelector(".taligent-wa-inline-label-names, .taligent-wa-row-tags")) {
    return;
  }

  const label = document.createElement("span");
  label.className = "taligent-wa-row-tags";
  label.textContent = tagsText;
  label.title = tagsText;
  anchor.appendChild(label);
}

function decorateHeader(lookup) {
  const header = document.querySelector("#main header");
  if (!header) {
    return;
  }
  if (header.querySelector(".taligent-wa-inline-header-label-names, .taligent-wa-header-tags")) {
    return;
  }

  const conversation = matchConversationFromText(header.innerText, lookup);
  const tagsText = buildTagsText(conversation);
  if (!tagsText) {
    return;
  }

  const label = document.createElement("div");
  label.className = "taligent-wa-header-tags";
  label.textContent = tagsText;
  label.title = tagsText;
  header.appendChild(label);
}

function decorateVisibleRows() {
  const payload = getPayload();
  if (!Array.isArray(payload.conversations) || !payload.conversations.length) {
    clearDecorations(document);
    return;
  }

  clearDecorations(document);
  const visibleConversations = getFilteredConversations();
  const visibleIds = new Set(visibleConversations.map(conversation => conversation.id));
  const lookup = buildLookup(payload.conversations);

  collectChatRows().forEach(row => {
    const conversation = matchConversationFromText(row.innerText, lookup);
    if (!conversation) {
      return;
    }
    appendRowTags(row, conversation, visibleIds.has(conversation.id));
  });

  decorateHeader(lookup);
}

function scheduleDecoration() {
  clearTimeout(state.decorateTimer);
  state.decorateTimer = setTimeout(() => decorateVisibleRows(), 180);
  scheduleBackendRefreshSoon();
}

function ensureRoot() {
  if (state.host) {
    return;
  }

  const host = document.createElement("div");
  host.id = ROOT_ID;
  const shadow = host.attachShadow({ mode: "open" });
  document.body.appendChild(host);

  state.host = host;
  state.shadow = shadow;
  renderPanel();
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  const interval = Math.max(3, Math.min(Number(state.settings?.refreshIntervalSeconds || 5), 180)) * 1000;
  state.refreshTimer = setTimeout(() => {
    refreshPayload(false).catch(() => {});
  }, interval);
}

function scheduleBackendRefreshSoon() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    refreshPayload(false).catch(() => {});
  }, 1200);
}

async function refreshPayload() {
  state.loading = true;
  renderPanel();

  const response = await runtimeSend({ type: "wa-companion:get-state" });
  if (!response?.ok) {
    state.loading = false;
    state.error = `No pude sincronizar con el backend: ${response?.error || "companion_fetch_failed"}`;
    renderPanel();
    return;
  }

  state.payload = response.payload;
  state.settings = response.settings;
  state.loading = false;
  state.error = "";
  renderPanel();
  scheduleDecoration();
  scheduleRefresh();
}

function ensureObserver() {
  if (state.observer) {
    return;
  }

  state.observer = new MutationObserver(() => {
    scheduleDecoration();
  });

  state.observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function boot() {
  if (!document.body) {
    setTimeout(boot, 250);
    return;
  }

  try {
    ensureRoot();
    ensureObserver();
    refreshPayload().catch(error => {
      state.loading = false;
      state.error = `No pude iniciar el companion: ${String(error?.message || "companion_boot_failed")}`;
      renderPanel();
    });
  } catch (error) {
    setTimeout(boot, 500);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
