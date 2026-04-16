"use strict";

const { config } = require("./config");
const { getClient, reconcileOperationalWhatsAppPage } = require("./whatsappClient");
const {
  mergeConversationContextTags,
  getClientFacingConversationTags
} = require("./conversation_audit_tags");

const LABEL_CACHE_TTL_MS = 5000;

let cachedCatalogAt = 0;
let cachedCatalog = [];
let nativeLabelBootstrapPromise = null;
const warnedMissingLabels = new Set();

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toUniqueArray(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || "").trim()).filter(Boolean))];
}

function normalizeManagedLabelMap() {
  const source = config.whatsappWebNativeLabelMap || {};
  const output = {};

  for (const [tagId, rawNames] of Object.entries(source)) {
    const names = toUniqueArray(rawNames);
    if (names.length) {
      output[String(tagId || "").trim()] = names;
    }
  }

  return output;
}

function getManagedLabelNames() {
  return Object.values(normalizeManagedLabelMap()).flatMap(names => names);
}

function buildManagedTagIdByLabelName() {
  const managedMap = normalizeManagedLabelMap();
  const output = new Map();

  for (const [tagId, names] of Object.entries(managedMap)) {
    for (const name of names) {
      const normalizedName = normalize(name);
      if (normalizedName) {
        output.set(normalizedName, tagId);
      }
    }
  }

  return output;
}

function buildNormalizedCatalog(labels) {
  const byNormalizedName = new Map();

  for (const label of labels) {
    const normalizedName = normalize(label.name);
    if (normalizedName) {
      byNormalizedName.set(normalizedName, label);
    }
  }

  return { byNormalizedName };
}

async function getNativeLabelCatalog({ forceRefresh = false } = {}) {
  await reconcileOperationalWhatsAppPage().catch(() => null);
  const client = getClient();
  if (!client) {
    return [];
  }

  const shouldRefresh = forceRefresh || !cachedCatalog.length || Date.now() - cachedCatalogAt > LABEL_CACHE_TTL_MS;
  if (!shouldRefresh) {
    return cachedCatalog;
  }

  const labels = await client.getLabels();
  cachedCatalog = labels.map(label => ({
    id: String(label.id),
    name: String(label.name || "").trim(),
    hexColor: String(label.hexColor || "").trim()
  }));
  cachedCatalogAt = Date.now();
  return cachedCatalog;
}

function buildDesiredNativeLabelIds(tags, catalog) {
  const { byNormalizedName } = buildNormalizedCatalog(catalog);
  const managedMap = normalizeManagedLabelMap();
  const missing = [];
  const desiredLabelIds = [];

  for (const tag of getClientFacingConversationTags(tags)) {
    const candidateNames = managedMap[tag.id] || [];
    let matched = null;

    for (const candidateName of candidateNames) {
      matched = byNormalizedName.get(normalize(candidateName)) || null;
      if (matched) {
        desiredLabelIds.push(String(matched.id));
        break;
      }
    }

    if (!matched && candidateNames.length) {
      missing.push(...candidateNames);
    }
  }

  return {
    desiredLabelIds: toUniqueArray(desiredLabelIds),
    missingLabelNames: toUniqueArray(missing)
  };
}

function mapNativeLabelNamesToClientFacingTags(labelNames) {
  const tagIdByName = buildManagedTagIdByLabelName();
  const tagIds = toUniqueArray(
    (Array.isArray(labelNames) ? labelNames : [])
      .map(name => tagIdByName.get(normalize(name)) || "")
      .filter(Boolean)
  );

  return getClientFacingConversationTags(tagIds);
}

function buildChatIdCandidates(contactId) {
  const raw = String(contactId || "").trim();
  if (!raw) {
    return [];
  }

  if (raw.includes("@")) {
    return [raw];
  }

  return toUniqueArray([`${raw}@lid`, `${raw}@c.us`, raw]);
}

async function findChatByContactId(contactId) {
  await reconcileOperationalWhatsAppPage().catch(() => null);
  const client = getClient();
  if (!client) {
    return null;
  }

  for (const chatId of buildChatIdCandidates(contactId)) {
    try {
      const chat = await client.getChatById(chatId);
      if (chat) {
        return chat;
      }
    } catch {
      // seguimos con el siguiente formato posible
    }
  }

  return null;
}

async function ensureLabelsPageOpen(page) {
  await page.bringToFront().catch(() => null);

  const opened = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll("button,[role='button']"));
    const isLabelsScreen = () => {
      const titleCandidates = Array.from(document.querySelectorAll("h1,h2,header,[role='heading']"))
        .map(element => String(element.innerText || "").trim())
        .filter(Boolean);
      const addButton = Array.from(document.querySelectorAll("button,[role='button']")).find(element => {
        const aria = String(element.getAttribute("aria-label") || "");
        const normalized = aria.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return normalized.includes("etiqueta nueva") || normalized.includes("anadir etiqueta nueva");
      });
      return titleCandidates.includes("Etiquetas") && Boolean(addButton);
    };

    if (isLabelsScreen()) {
      return true;
    }

    const openToolsButton =
      allButtons.find(element => (element.getAttribute("aria-label") || "").trim() === "Herramientas") || null;
    if (openToolsButton) {
      openToolsButton.click();
    }

    const labelsButton =
      allButtons.find(element => {
        const value = `${element.getAttribute("aria-label") || ""} ${(element.innerText || "").trim()}`.toLowerCase();
        return value.includes("etiquetas") && value.includes("organiza chats y clientes");
      }) || null;

    if (labelsButton) {
      labelsButton.click();
      return true;
    }

    return false;
  });

  if (!opened) {
    throw new Error("native_labels_panel_unavailable");
  }

  await page.waitForFunction(
    () =>
      (document.body.innerText || "").includes("Etiquetas"),
    { timeout: 15000 }
  );
}

async function createNativeLabel(page, labelName) {
  await ensureLabelsPageOpen(page);

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button,[role='button']"));
    const addButton =
      buttons.find(element => {
        const value = `${element.getAttribute("aria-label") || ""} ${(element.innerText || "").trim()}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        return (
          value.includes("etiqueta nueva") ||
          value.includes("anadir etiqueta nueva") ||
          value.includes("nueva etiqueta") ||
          value.includes("crear etiqueta")
        );
      }) ||
      buttons
        .filter(element => {
          const rect = element.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) {
            return false;
          }
          const value = `${element.getAttribute("aria-label") || ""} ${(element.innerText || "").trim()}`.toLowerCase();
          if (value.includes("buscar") || value.includes("menu")) {
            return false;
          }
          return rect.top >= 0 && rect.top < 140 && rect.left > window.innerWidth * 0.55;
        })
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return rightRect.left - leftRect.left;
        })[0];

    if (!addButton) {
      return false;
    }
    addButton.click();
    return true;
  });

  if (!clicked) {
    throw new Error("native_label_add_button_unavailable");
  }

  await page.waitForFunction(() => Boolean(document.querySelector("[role='dialog'] [contenteditable='true']")), {
    timeout: 15000
  });

  await page.evaluate(() => {
    const editable = document.querySelector("[role='dialog'] [contenteditable='true']");
    if (editable) {
      editable.focus();
      editable.textContent = "";
    }
  });

  await page.keyboard.type(String(labelName || "").trim(), { delay: 12 });

  const saved = await page.evaluate(() => {
    const saveButton = Array.from(document.querySelectorAll("[role='dialog'] button,[role='dialog'] [role='button']")).find(
      element => (element.innerText || "").trim() === "Guardar"
    );
    if (!saveButton) {
      return false;
    }
    saveButton.click();
    return true;
  });

  if (!saved) {
    throw new Error("native_label_save_button_unavailable");
  }

  await page.waitForFunction(
    label =>
      (window.Store?.Label?.getModelsArray?.() || []).some(
        item => String(item?.name || "").trim().toLowerCase() === String(label || "").trim().toLowerCase()
      ),
    { timeout: 15000 },
    labelName
  );
}

async function bootstrapNativeLabels() {
  if (!config.whatsappWebNativeLabelsEnabled) {
    return { ok: false, reason: "disabled" };
  }

  if (nativeLabelBootstrapPromise) {
    return nativeLabelBootstrapPromise;
  }

  nativeLabelBootstrapPromise = (async () => {
    await reconcileOperationalWhatsAppPage().catch(() => null);
    const client = getClient();
    const page = client?.pupPage || null;

    if (!page) {
      return { ok: false, reason: "page_unavailable" };
    }

    const desiredNames = getManagedLabelNames();
    let catalog = await getNativeLabelCatalog();
    const created = [];

    for (const labelName of desiredNames) {
      const exists = catalog.some(label => normalize(label.name) === normalize(labelName));
      if (exists) {
        continue;
      }

      await createNativeLabel(page, labelName);
      created.push(labelName);
      cachedCatalogAt = 0;
      catalog = await getNativeLabelCatalog({ forceRefresh: true });
    }

    return {
      ok: true,
      created,
      labels: catalog
    };
  })()
    .catch(error => ({
      ok: false,
      reason: "bootstrap_failed",
      detail: String(error?.message || error)
    }))
    .finally(() => {
      nativeLabelBootstrapPromise = null;
    });

  return nativeLabelBootstrapPromise;
}

function buildNativeConversationSummary(tags) {
  const labels = getClientFacingConversationTags(tags).map(tag => tag.label).filter(Boolean);
  return labels.join(" | ");
}

async function listNativeLabelConversations({ limit = 180, contactId = "", status = "", tag = "" } = {}) {
  if (!config.whatsappWebNativeLabelsEnabled) {
    return [];
  }

  await reconcileOperationalWhatsAppPage().catch(() => null);
  const client = getClient();
  const page = client?.pupPage || null;
  if (!page) {
    return [];
  }

  const rows = await page.evaluate(innerLimit => {
    const labelCatalog = new Map(
      (window.Store?.Label?.getModelsArray?.() || []).map(label => [
        String(label?.id || ""),
        {
          id: String(label?.id || ""),
          name: String(label?.name || "").trim(),
          hexColor: String(label?.hexColor || "").trim()
        }
      ])
    );

    return (window.Store?.Chat?.getModelsArray?.() || [])
      .filter(chat => chat && !chat.isGroup && !chat.isStatus)
      .map(chat => {
        const rawId = chat?.id?._serialized || chat?.id || "";
        const labels = Array.isArray(chat?.labels)
          ? chat.labels
              .map(entry => {
                const labelId = String(entry?.id || entry || "");
                return labelCatalog.get(labelId) || null;
              })
              .filter(Boolean)
          : [];

        const lastTimestamp = Number(chat?.t || chat?.lastReceivedKey?.timestamp || 0);
        const previewText =
          String(chat?.lastMessage?.body || "") ||
          String(chat?.msgs?.models?.at?.(-1)?.body || "") ||
          "";

        return {
          id: String(rawId || ""),
          contactId: String(rawId || ""),
          contactName:
            String(chat?.formattedTitle || "") ||
            String(chat?.name || "") ||
            String(chat?.contact?.formattedName || "") ||
            String(chat?.contact?.name || "") ||
            "Cliente",
          labelNames: labels.map(label => label.name).filter(Boolean),
          labelIds: labels.map(label => label.id).filter(Boolean),
          lastEventAt: lastTimestamp > 0 ? new Date(lastTimestamp * 1000).toISOString() : null,
          previewText: String(previewText || "").trim()
        };
      })
      .sort((left, right) => {
        const leftTime = Number(new Date(left.lastEventAt || 0).getTime() || 0);
        const rightTime = Number(new Date(right.lastEventAt || 0).getTime() || 0);
        return rightTime - leftTime;
      })
      .slice(0, Math.max(1, Number(innerLimit || 180)));
  }, limit);

  const requiredTags = toUniqueArray(
    String(tag || "")
      .split(",")
      .map(value => String(value || "").trim())
      .filter(Boolean)
  );
  const normalizedContactId = String(contactId || "").trim().replace(/\D/g, "");
  const normalizedStatus = String(status || "").trim().toLowerCase();

  return rows
    .map(row => {
      const tags = mapNativeLabelNamesToClientFacingTags(row.labelNames);
      const tagIds = tags.map(tagItem => tagItem.id);
      const derivedStatus = tagIds.includes("esperando_asesor") ? "agent_pending" : "open";
      return {
        id: String(row.id || ""),
        contactId: String(row.contactId || ""),
        contactName: String(row.contactName || "").trim(),
        displayName: String(row.contactName || "").trim() || "Cliente",
        status: derivedStatus,
        summary: buildNativeConversationSummary(tagIds),
        previewText: String(row.previewText || "").trim(),
        previewSide: row.previewText ? "left" : "",
        currentStep: "",
        lastEventAt: row.lastEventAt || null,
        tags,
        tagIds
      };
    })
    .filter(conversation => conversation.tagIds.length > 0)
    .filter(conversation => {
      if (normalizedContactId) {
        const digits = String(conversation.contactId || "").replace(/\D/g, "");
        if (!digits.includes(normalizedContactId) && !normalizedContactId.includes(digits)) {
          return false;
        }
      }

      if (normalizedStatus && normalizedStatus !== "all" && conversation.status !== normalizedStatus) {
        return false;
      }

      if (requiredTags.length && !requiredTags.every(tagId => conversation.tagIds.includes(tagId))) {
        return false;
      }

      return true;
    })
    .slice(0, Math.max(1, Number(limit || 180)));
}

function getManagedLabelIds(catalog) {
  const managedNames = new Set(getManagedLabelNames().map(normalize));
  return new Set(
    catalog
      .filter(label => managedNames.has(normalize(label.name)))
      .map(label => String(label.id))
  );
}

async function syncNativeLabelsForTags(contactId, tags) {
  if (!config.whatsappWebNativeLabelsEnabled) {
    return { ok: false, reason: "disabled" };
  }

  const chat = await findChatByContactId(contactId);
  if (!chat) {
    return { ok: false, reason: "chat_not_found" };
  }

  const catalog = await getNativeLabelCatalog();
  const managedLabelIds = getManagedLabelIds(catalog);
  const { desiredLabelIds, missingLabelNames } = buildDesiredNativeLabelIds(tags, catalog);

  for (const labelName of missingLabelNames) {
    const key = normalize(labelName);
    if (!warnedMissingLabels.has(key)) {
      warnedMissingLabels.add(key);
      console.warn(`Etiqueta nativa faltante en WhatsApp Business: ${labelName}`);
    }
  }

  const currentLabels = await chat.getLabels();
  const keepIds = currentLabels
    .map(label => String(label.id))
    .filter(labelId => !managedLabelIds.has(labelId));
  const nextIds = toUniqueArray([...keepIds, ...desiredLabelIds]);
  const currentIds = toUniqueArray(currentLabels.map(label => String(label.id)));

  if (JSON.stringify(currentIds.slice().sort()) === JSON.stringify(nextIds.slice().sort())) {
    return { ok: true, changed: false, labelIds: nextIds, missingLabelNames };
  }

  await chat.changeLabels(nextIds);
  return { ok: true, changed: true, labelIds: nextIds, missingLabelNames };
}

async function syncNativeLabelsForSession(contactId, sessionData) {
  const tags = mergeConversationContextTags([], sessionData || {});
  return syncNativeLabelsForTags(contactId, tags);
}

async function getNativeLabelNamesForContact(contactId) {
  if (!config.whatsappWebNativeLabelsEnabled) {
    return [];
  }

  const chat = await findChatByContactId(contactId);
  if (!chat) {
    return [];
  }

  const labels = await chat.getLabels().catch(() => []);
  return toUniqueArray(labels.map(label => String(label?.name || "").trim()).filter(Boolean));
}

async function hasManagedNativeLabelForContact(contactId, tagId) {
  const managedLabelNames = normalizeManagedLabelMap()[String(tagId || "").trim()] || [];
  if (!managedLabelNames.length) {
    return false;
  }

  const nativeLabelNames = await getNativeLabelNamesForContact(contactId);
  const allowedNames = new Set(managedLabelNames.map(normalize));
  return nativeLabelNames.some(labelName => allowedNames.has(normalize(labelName)));
}

module.exports = {
  getNativeLabelCatalog,
  bootstrapNativeLabels,
  syncNativeLabelsForSession,
  listNativeLabelConversations,
  getNativeLabelNamesForContact,
  hasManagedNativeLabelForContact,
  _private: {
    normalize,
    buildDesiredNativeLabelIds,
    mapNativeLabelNamesToClientFacingTags,
    buildChatIdCandidates,
    getNativeLabelNamesForContact
  }
};
