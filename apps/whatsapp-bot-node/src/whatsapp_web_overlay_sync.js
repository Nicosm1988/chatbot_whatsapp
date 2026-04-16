"use strict";

async function clearCompanionOverlayPage(page) {
  if (!page) {
    return false;
  }

  await page.evaluate(() => {
    document
      .querySelectorAll(
        ".taligent-wa-inline-row-tags, .taligent-wa-inline-header-tags, .taligent-wa-inline-label-names, .taligent-wa-inline-header-label-names, #taligent-wa-inline-overlay-style"
      )
      .forEach(node => node.remove());
  });

  return true;
}

async function syncCompanionOverlayPage(page, payload) {
  if (!page) {
    return false;
  }

  await page.evaluate(companionPayload => {
    const STYLE_ID = "taligent-wa-inline-overlay-style";
    const ROW_TEXT_CLASS = "taligent-wa-inline-label-names";
    const HEADER_TEXT_CLASS = "taligent-wa-inline-header-label-names";

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

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) {
        return;
      }

      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .${ROW_TEXT_CLASS}, .${HEADER_TEXT_CLASS} {
          pointer-events: none;
          font: 700 11px/1.25 system-ui, sans-serif;
          letter-spacing: .01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .${ROW_TEXT_CLASS} {
          display: inline-flex;
          align-items: center;
          margin-inline-start: 6px;
          max-width: 220px;
          vertical-align: middle;
          color: #1d4ed8;
        }
        .${HEADER_TEXT_CLASS} {
          display: block;
          margin-top: 6px;
          max-width: 320px;
          color: #1d4ed8;
        }
      `;
      document.head.appendChild(style);
    }

    function clearDecorations() {
      document
        .querySelectorAll(`.${ROW_TEXT_CLASS}, .${HEADER_TEXT_CLASS}`)
        .forEach(node => node.remove());
    }

    function buildLookup(conversations) {
      const latestByContactId = new Map();
      const names = new Map();
      const duplicatedNames = new Set();
      const phones = [];

      for (const conversation of conversations) {
        const contactId = String(conversation?.contactId || conversation?.id || "").trim();
        if (!contactId) {
          continue;
        }

        const previous = latestByContactId.get(contactId) || null;
        const currentTime = Number(new Date(conversation?.lastEventAt || 0).getTime() || 0);
        const previousTime = Number(new Date(previous?.lastEventAt || 0).getTime() || 0);
        if (!previous || currentTime >= previousTime) {
          latestByContactId.set(contactId, conversation);
        }
      }

      for (const conversation of latestByContactId.values()) {
        const phone = digitsOnly(conversation?.contactId);
        if (phone.length >= 8) {
          phones.push({ key: phone, conversation });
        }
      }

      for (const conversation of conversations) {
        const contactId = String(conversation?.contactId || conversation?.id || "").trim();
        const latestConversation = latestByContactId.get(contactId) || conversation;
        const aliases = [
          conversation?.contactName,
          conversation?.displayName,
          latestConversation?.contactName,
          latestConversation?.displayName
        ];

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

    function buildNativeChatLookup() {
      const chats = Array.isArray(window.Store?.Chat?.getModelsArray?.())
        ? window.Store.Chat.getModelsArray()
        : [];
      const labelCatalog = new Map(
        (window.Store?.Label?.getModelsArray?.() || []).map(label => [String(label?.id || ""), String(label?.name || "").trim()])
      );
      const names = new Map();
      const duplicatedNames = new Set();
      const phones = [];

      for (const chat of chats) {
        if (!chat || chat.isGroup || chat.isStatus) {
          continue;
        }

        const labelNames = Array.isArray(chat.labels)
          ? chat.labels
              .map(entry => labelCatalog.get(String(entry?.id || entry || "")) || "")
              .map(value => String(value || "").trim())
              .filter(Boolean)
          : [];

        if (!labelNames.length) {
          continue;
        }

        const rawId =
          String(chat?.id?._serialized || chat?.id || "")
            .trim();
        const phone = digitsOnly(rawId);
        if (phone.length >= 8) {
          phones.push({
            key: phone,
            chat: {
              id: rawId,
              title:
                String(chat?.formattedTitle || "") ||
                String(chat?.name || "") ||
                String(chat?.contact?.formattedName || "") ||
                String(chat?.contact?.name || "") ||
                "",
              labelNames
            }
          });
        }

        const aliases = [
          chat?.formattedTitle,
          chat?.name,
          chat?.contact?.formattedName,
          chat?.contact?.name
        ];

        for (const alias of aliases) {
          const name = normalize(alias);
          if (name.length < 4) {
            continue;
          }

          const payload = {
            id: rawId,
            title:
              String(chat?.formattedTitle || "") ||
              String(chat?.name || "") ||
              String(chat?.contact?.formattedName || "") ||
              String(chat?.contact?.name || "") ||
              "",
            labelNames
          };

          const previous = names.get(name);
          if (previous && previous.id !== payload.id) {
            duplicatedNames.add(name);
            continue;
          }

          names.set(name, payload);
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
      const normalizedText = normalize(text);
      const digits = digitsOnly(text);

      if (digits.length >= 8) {
        for (const entry of lookup.phones) {
          if (digits.includes(entry.key) || entry.key.includes(digits)) {
            return entry.conversation;
          }
        }
      }

      for (const [name, conversation] of lookup.names) {
        if (normalizedText.includes(name)) {
          return conversation;
        }
      }

      return null;
    }

    function matchNativeChatFromText(text, lookup) {
      const normalizedText = normalize(text);
      const digits = digitsOnly(text);

      if (digits.length >= 8) {
        for (const entry of lookup.phones) {
          if (digits.includes(entry.key) || entry.key.includes(digits)) {
            return entry.chat;
          }
        }
      }

      for (const [name, chat] of lookup.names) {
        if (normalizedText.includes(name)) {
          return chat;
        }
      }

      return null;
    }

    function collectRows() {
      const pane = document.querySelector("#pane-side");
      if (!pane) {
        return [];
      }

      const selectors = ["[role='listitem']", "[data-testid='cell-frame-container']", "[aria-selected]"];
      for (const selector of selectors) {
        const rows = Array.from(pane.querySelectorAll(selector)).filter(
          node => normalize(node.innerText).length >= 4
        );
        if (rows.length) {
          return rows.slice(0, 80);
        }
      }

      return [];
    }

    function buildTagsText(conversation, nativeChat) {
      const companionTagsText = (Array.isArray(conversation?.tags) ? conversation.tags : [])
        .map(tag => String(tag?.label || "").trim())
        .filter(Boolean)
        .join(" | ");

      if (companionTagsText) {
        return companionTagsText;
      }

      return (Array.isArray(nativeChat?.labelNames) ? nativeChat.labelNames : [])
        .map(label => String(label || "").trim())
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

    function findRowTitleAnchor(row) {
      if (!row) {
        return null;
      }

      const titleCandidate = Array.from(
        row.querySelectorAll("span[title], div[title], span[dir='auto'], div[dir='auto']")
      ).find(node => {
        const value = (node.getAttribute("title") || node.textContent || "").trim();
        if (!value || value.length < 2) {
          return false;
        }

        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      return titleCandidate || null;
    }

    function getRowLookupText(row) {
      const titleAnchor = findRowTitleAnchor(row);
      const directValue = (
        titleAnchor?.getAttribute("title") ||
        titleAnchor?.textContent ||
        row?.getAttribute?.("title") ||
        row?.innerText ||
        ""
      ).trim();

      return directValue || String(row?.innerText || "").trim();
    }

    function decorateRow(row, conversation, nativeChat) {
      const tagsText = buildTagsText(conversation, nativeChat);
      if (!row || !tagsText) {
        return;
      }

      const anchor = findRowTitleAnchor(row) || findRowAnchor(row);
      if (!anchor) {
        return;
      }

      const label = document.createElement("span");
      label.className = ROW_TEXT_CLASS;
      label.textContent = tagsText;
      label.title = tagsText;
      const parent = anchor.parentElement || anchor;
      const currentDisplay = window.getComputedStyle(parent).display;
      if (!["inline-flex", "flex"].includes(currentDisplay)) {
        parent.style.display = "inline-flex";
        parent.style.alignItems = "center";
        parent.style.gap = "6px";
      }
      parent.appendChild(label);
    }

    function decorateHeader(lookup, nativeLookup) {
      const header = document.querySelector("#main header");
      if (!header) {
        return;
      }

      const conversation = matchConversationFromText(header.innerText, lookup);
      const nativeChat = matchNativeChatFromText(header.innerText, nativeLookup);
      const tagsText = buildTagsText(conversation, nativeChat);
      if (!tagsText) {
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.className = HEADER_TEXT_CLASS;
      wrapper.textContent = tagsText;
      wrapper.title = tagsText;
      header.appendChild(wrapper);
    }

    ensureStyle();
    clearDecorations();

    const conversations = Array.isArray(companionPayload?.conversations) ? companionPayload.conversations : [];
    const lookup = buildLookup(conversations);
    const nativeLookup = buildNativeChatLookup();
    collectRows().forEach(row => {
      const rowLookupText = getRowLookupText(row);
      const conversation = matchConversationFromText(rowLookupText, lookup);
      const nativeChat = matchNativeChatFromText(rowLookupText, nativeLookup);
      decorateRow(row, conversation, nativeChat);
    });
    decorateHeader(lookup, nativeLookup);
  }, payload);

  return true;
}

module.exports = {
  syncCompanionOverlayPage,
  clearCompanionOverlayPage
};
