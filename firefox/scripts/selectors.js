(function initSelectors(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.selectors) {
    return;
  }

  const utils = root.utils;

  // Keep the brittle ChatGPT UI selectors in one place so DOM changes
  // are easier to fix without chasing them through the whole project.
  const registry = {
    sidebar: [
      "nav[aria-label*='Chat history']",
      "nav[aria-label*='Chat History']",
      "aside nav",
      "aside"
    ],
    sidebarScrollContainer: [
      "nav[aria-label*='Chat history']",
      "nav[aria-label*='Chat History']",
      "aside [data-testid*='history']",
      "aside .overflow-y-auto",
      "aside"
    ],
    conversationLinks: [
      "a[href^='/c/']",
      "a[href*='/c/']",
      "a[href*='chatgpt.com/c/']",
      "a[href*='chat.openai.com/c/']"
    ],
    menuButtons: [
      "button[aria-haspopup='menu']",
      "button[aria-label*='More']",
      "button[data-testid*='conversation']",
      "button"
    ],
    menuItems: [
      "[role='menuitem']",
      "button",
      "[data-radix-collection-item]"
    ],
    dialogs: [
      "[role='dialog']",
      "[aria-modal='true']"
    ],
    dialogButtons: [
      "[role='dialog'] button",
      "[aria-modal='true'] button",
      "button"
    ]
  };

  function queryAll(rootNode, selectorNames) {
    const selectors = Array.isArray(selectorNames) ? selectorNames : registry[selectorNames] || [];
    const seen = new Set();
    const results = [];

    selectors.forEach((selector) => {
      rootNode.querySelectorAll(selector).forEach((element) => {
        if (seen.has(element)) {
          return;
        }

        seen.add(element);
        results.push(element);
      });
    });

    return results;
  }

  function queryFirst(rootNode, selectorNames, validator) {
    return queryAll(rootNode, selectorNames).find((element) => {
      if (!validator) {
        return true;
      }

      return validator(element);
    }) || null;
  }

  function isVisible(element) {
    if (!element || !element.isConnected) {
      return false;
    }

    const style = global.getComputedStyle(element);

    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isScrollable(element) {
    if (!element) {
      return false;
    }

    const style = global.getComputedStyle(element);
    const overflowY = style.overflowY || style.overflow;
    return /(auto|scroll|overlay)/i.test(overflowY) && element.scrollHeight > element.clientHeight;
  }

  function findSidebarRoot() {
    return queryFirst(global.document, "sidebar", (element) => element && element.querySelector("a[href*='/c/']"));
  }

  function findScrollContainer(sidebarRoot) {
    if (!sidebarRoot) {
      return null;
    }

    const directMatch = queryFirst(sidebarRoot, "sidebarScrollContainer", isScrollable);

    if (directMatch) {
      return directMatch;
    }

    let node = sidebarRoot;

    while (node && node !== global.document.body) {
      if (isScrollable(node)) {
        return node;
      }

      node = node.parentElement;
    }

    return sidebarRoot;
  }

  function findConversationLinks(rootNode) {
    return queryAll(rootNode || global.document, "conversationLinks").filter((link) => {
      return Boolean(utils.extractConversationId(link.href));
    });
  }

  function resolveRowElement(link) {
    return link.closest("li, article, div, a") || link;
  }

  function resolveDateLabel(row) {
    let cursor = row;

    while (cursor && cursor !== global.document.body) {
      const previous = cursor.previousElementSibling;

      if (previous) {
        const headingText = utils.normalizeWhitespace(previous.textContent);

        if (headingText && headingText.length < 40) {
          return headingText;
        }
      }

      cursor = cursor.parentElement;
    }

    return "";
  }

  function extractConversationFromRow(link, fallbackOrigin) {
    const id = utils.extractConversationId(link.href);

    if (!id) {
      return null;
    }

    const row = resolveRowElement(link);
    const title =
      utils.normalizeWhitespace(
        link.getAttribute("aria-label") ||
          link.getAttribute("title") ||
          link.textContent ||
          row.textContent ||
          "Untitled chat"
      ) || "Untitled chat";
    const rowText = utils.normalizeWhitespace(row.textContent || title) || title;
    const archivedStatus = /archived/i.test(rowText) ? "archived" : "unknown";

    return {
      id,
      title,
      normalizedTitle: utils.normalizeTitle(title),
      url: link.href || utils.conversationUrlFromId(id, fallbackOrigin),
      updatedAt: "",
      createdAt: "",
      archivedStatus,
      isEmpty: /^untitled chat|^new chat$/i.test(title),
      source: "dom",
      rowText,
      dateLabel: resolveDateLabel(row),
      modelHint: "",
      lastSeenAt: utils.nowIso()
    };
  }

  function findRowByConversationId(conversationId) {
    const link = findConversationLinks(global.document).find((candidate) => {
      return utils.extractConversationId(candidate.href) === conversationId;
    });

    return link ? resolveRowElement(link) : null;
  }

  function findMenuButton(row) {
    if (!row) {
      return null;
    }

    return queryFirst(row, "menuButtons", (button) => {
      const label = utils.normalizeWhitespace(
        button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent
      );

      return isVisible(button) && (!label || /more|options|menu/i.test(label) || button.querySelector("svg"));
    });
  }

  function findVisibleMenuItem(labelPattern) {
    return queryFirst(global.document, "menuItems", (element) => {
      const text = utils.normalizeWhitespace(element.textContent);
      return isVisible(element) && labelPattern.test(text);
    });
  }

  function findDeleteMenuItem() {
    return findVisibleMenuItem(/^delete$/i);
  }

  function findArchiveMenuItem() {
    return findVisibleMenuItem(/^archive$/i);
  }

  function findVisibleDialog() {
    return queryFirst(global.document, "dialogs", isVisible);
  }

  function findConfirmDeleteButton() {
    const dialog = findVisibleDialog();

    if (!dialog) {
      return null;
    }

    return queryFirst(dialog, "dialogButtons", (button) => {
      const text = utils.normalizeWhitespace(button.textContent);
      return isVisible(button) && /^delete$/i.test(text);
    });
  }

  function findCancelButton() {
    const dialog = findVisibleDialog();

    if (!dialog) {
      return null;
    }

    return queryFirst(dialog, "dialogButtons", (button) => {
      const text = utils.normalizeWhitespace(button.textContent);
      return isVisible(button) && /^cancel$/i.test(text);
    });
  }

  root.selectors = {
    registry,
    queryAll,
    queryFirst,
    isVisible,
    isScrollable,
    findSidebarRoot,
    findScrollContainer,
    findConversationLinks,
    extractConversationFromRow,
    findRowByConversationId,
    findMenuButton,
    findDeleteMenuItem,
    findArchiveMenuItem,
    findVisibleDialog,
    findConfirmDeleteButton,
    findCancelButton
  };
})(globalThis);
