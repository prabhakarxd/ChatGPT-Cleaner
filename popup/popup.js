(function initPopup(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};
  const utils = root.utils;
  const state = root.state;
  const filtersModule = root.filters;
  const logger = root.logger.createLogger("popup");

  const refs = {};
  const popupState = {
    runtimeState: state.createRuntimeState(),
    activeTabId: null
  };
  const CONTENT_STYLE_FILES = ["styles/shared.css"];
  const CONTENT_SCRIPT_FILES = [
    "scripts/utils.js",
    "scripts/state.js",
    "scripts/storage.js",
    "scripts/logger.js",
    "scripts/selectors.js",
    "scripts/filters.js",
    "scripts/queue.js",
    "scripts/export.js",
    "scripts/api.js",
    "scripts/observer.js",
    "scripts/deletion.js",
    "scripts/content.js"
  ];

  function $(id) {
    return global.document.getElementById(id);
  }

  function cacheDom() {
    refs.connectionBadge = $("connectionBadge");
    refs.totalChatsStat = $("totalChatsStat");
    refs.selectedChatsStat = $("selectedChatsStat");
    refs.processedStat = $("processedStat");
    refs.failedStat = $("failedStat");
    refs.keywordInput = $("keywordInput");
    refs.sortSelect = $("sortSelect");
    refs.archiveModeSelect = $("archiveModeSelect");
    refs.scanButton = $("scanButton");
    refs.deleteButton = $("deleteButton");
    refs.deleteAllButton = $("deleteAllButton");
    refs.pauseButton = $("pauseButton");
    refs.resumeButton = $("resumeButton");
    refs.stopButton = $("stopButton");
    refs.invertSelectionButton = $("invertSelectionButton");
    refs.clearSelectionButton = $("clearSelectionButton");
    refs.retryFailedButton = $("retryFailedButton");
    refs.operationStateLabel = $("operationStateLabel");
    refs.scanMetaText = $("scanMetaText");
    refs.progressPercent = $("progressPercent");
    refs.progressBarFill = $("progressBarFill");
    refs.progressSummaryText = $("progressSummaryText");
    refs.successFailureText = $("successFailureText");
    refs.conversationCountPill = $("conversationCountPill");
    refs.chatList = $("chatList");
    refs.confirmModal = $("confirmModal");
    refs.confirmMessage = $("confirmMessage");
    refs.confirmDeleteButton = $("confirmDeleteButton");
    refs.cancelDeleteButton = $("cancelDeleteButton");
  }

  async function getActiveChatTab() {
    let tabs = await utils.tabsQuery({
      active: true,
      currentWindow: true
    });
    const tab = tabs && tabs.length ? tabs[0] : null;

    if (!tab) {
      tabs = await utils.tabsQuery({
        active: true,
        lastFocusedWindow: true
      });
    }

    if (!tabs || !tabs.length) {
      tabs = await utils.tabsQuery({
        active: true
      });
    }

    if (!tabs || !tabs.length) {
      tabs = await utils.tabsQuery({});
    }

    const resolvedTab = (tabs || []).find((candidate) => utils.isChatPage(candidate && candidate.url)) || null;

    if (!resolvedTab || !utils.isChatPage(resolvedTab.url)) {
      return null;
    }

    popupState.activeTabId = resolvedTab.id;
    return resolvedTab;
  }

  async function pingContent(tabId) {
    try {
      const response = await utils.tabsSendMessage(tabId, {
        type: state.MESSAGE_TYPES.ping
      });
      return Boolean(response && response.ok);
    } catch (error) {
      return false;
    }
  }

  async function ensureContentScriptReady(tab) {
    if (!tab || !tab.id) {
      throw new Error("Open chatgpt.com in the active tab to use this extension");
    }

    if (await pingContent(tab.id)) {
      return;
    }

    const scripting = utils.browserApi && utils.browserApi.scripting;

    if (!scripting) {
      throw new Error("Refresh the ChatGPT tab after reloading the extension");
    }

    await scripting
      .insertCSS({
        target: {
          tabId: tab.id
        },
        files: CONTENT_STYLE_FILES
      })
      .catch(() => null);

    await scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: CONTENT_SCRIPT_FILES
    });

    const ready = await utils.waitFor(() => pingContent(tab.id), {
      timeoutMs: 3000,
      intervalMs: 150
    }).catch(() => false);

    if (!ready) {
      throw new Error("Refresh the ChatGPT tab after reloading the extension");
    }
  }

  async function sendToContent(message) {
    const tab = await getActiveChatTab();

    if (!tab) {
      throw new Error("Open chatgpt.com in the active tab to use this extension");
    }

    await ensureContentScriptReady(tab);

    const response = await utils.tabsSendMessage(tab.id, message);

    if (!response || !response.ok) {
      throw new Error((response && response.error) || "Request failed");
    }

    return response.data;
  }

  async function loadBackgroundSnapshot() {
    const response = await utils.runtimeSendMessage({
      type: state.MESSAGE_TYPES.getExtensionState
    });

    if (!response || !response.ok) {
      throw new Error((response && response.error) || "Could not load extension state");
    }

    popupState.runtimeState = response.data.runtimeState || popupState.runtimeState;
  }

  function getFilteredConversations() {
    return filtersModule.applyConversationFilters(
      popupState.runtimeState.conversations,
      popupState.runtimeState.filters,
      popupState.runtimeState.selection.selectedIds
    );
  }

  function setConnectionBadge(kind, text) {
    refs.connectionBadge.className = "status-badge";

    if (kind === "live") {
      refs.connectionBadge.classList.add("status-live");
    } else if (kind === "warn") {
      refs.connectionBadge.classList.add("status-warn");
    } else if (kind === "error") {
      refs.connectionBadge.classList.add("status-error");
    } else {
      refs.connectionBadge.classList.add("status-muted");
    }

    refs.connectionBadge.textContent = text;
  }

  function renderStats() {
    const runtime = popupState.runtimeState;
    const operation = runtime.operation;
    const filtered = getFilteredConversations();

    refs.totalChatsStat.textContent = utils.formatNumber(runtime.summary.total);
    refs.selectedChatsStat.textContent = utils.formatNumber(runtime.selection.count);
    refs.processedStat.textContent = utils.formatNumber(operation.progress.processed);
    refs.failedStat.textContent = utils.formatNumber(operation.progress.failed);
    refs.operationStateLabel.textContent = operation.state.toUpperCase();
    refs.scanMetaText.textContent = runtime.page.lastError
      ? runtime.page.lastError
      : runtime.summary.lastScanAt
        ? "Last scan: " + new Date(runtime.summary.lastScanAt).toLocaleString()
        : "No scan completed yet";
    refs.progressPercent.textContent = operation.progress.percent + "%";
    refs.progressBarFill.style.width = operation.progress.percent + "%";
    refs.progressSummaryText.textContent =
      operation.progress.processed + " / " + operation.progress.total + " processed";
    refs.successFailureText.textContent =
      operation.progress.succeeded +
      " success / " +
      operation.progress.failed +
      " failed" +
      (operation.progress.skipped ? " / " + operation.progress.skipped + " skipped" : "");
    refs.conversationCountPill.textContent = filtered.length + " visible";

    if (popupState.activeTabId) {
      setConnectionBadge("live", "Connected");
    } else {
      setConnectionBadge(runtime.page.lastError ? "error" : "warn", runtime.page.lastError ? "Error" : "No tab");
    }
  }

  function renderControls() {
    const runtime = popupState.runtimeState;
    const operationState = runtime.operation.state;
    const running = operationState === "running";
    const paused = operationState === "paused";
    const filtered = getFilteredConversations();

    refs.keywordInput.value = runtime.filters.keyword || "";
    refs.sortSelect.value = runtime.filters.sort || "newest";
    refs.archiveModeSelect.value = runtime.filters.archiveMode || "all";
    refs.deleteButton.disabled = runtime.selection.count === 0 || running || paused;
    refs.deleteAllButton.disabled = !filtered.length || running || paused;
    refs.pauseButton.disabled = !running;
    refs.resumeButton.disabled = !paused;
    refs.stopButton.disabled = !(running || paused);
    refs.retryFailedButton.disabled = !(runtime.operation.failedChatIds || []).length || running || paused;
  }

  function renderChatList() {
    const selected = new Set(popupState.runtimeState.selection.selectedIds || []);
    const filtered = getFilteredConversations();

    refs.chatList.textContent = "";

    if (!filtered.length) {
      const emptyState = global.document.createElement("div");
      emptyState.className = "empty-state";
      emptyState.textContent = "No conversations match the current filter.";
      refs.chatList.appendChild(emptyState);
      return;
    }

    filtered.forEach((chat) => {
      const item = global.document.createElement("label");
      item.className = "chat-item";

      const checkbox = global.document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(chat.id);
      checkbox.addEventListener("change", () => {
        sendToContent({
          type: state.MESSAGE_TYPES.setSelection,
          payload: {
            mode: "toggle",
            chatId: chat.id
          }
        })
          .then((runtimeState) => {
            popupState.runtimeState = runtimeState;
            renderAll();
          })
          .catch(showError);
      });

      const content = global.document.createElement("div");

      const title = global.document.createElement("div");
      title.className = "chat-title";
      title.textContent = chat.title;
      content.appendChild(title);

      const meta = global.document.createElement("div");
      meta.className = "chat-meta";
      meta.textContent =
        [
          chat.archivedStatus !== "unknown" ? chat.archivedStatus : "",
          chat.dateLabel || "",
          chat.updatedAt ? new Date(chat.updatedAt).toLocaleDateString() : ""
        ]
          .filter(Boolean)
          .join(" • ") || "Metadata pending";
      content.appendChild(meta);

      const flags = global.document.createElement("div");
      flags.className = "chat-flags";

      if (chat.isEmpty) {
        const flag = global.document.createElement("span");
        flag.className = "flag";
        flag.textContent = "empty";
        flags.appendChild(flag);
      }

      if (chat.archivedStatus === "archived") {
        const flag = global.document.createElement("span");
        flag.className = "flag";
        flag.textContent = "archived";
        flags.appendChild(flag);
      }

      content.appendChild(flags);
      item.appendChild(checkbox);
      item.appendChild(content);
      refs.chatList.appendChild(item);
    });
  }

  function renderAll() {
    renderStats();
    renderControls();
    renderChatList();
  }

  function showModal(selectedCount) {
    refs.confirmMessage.textContent =
      "Delete " +
      selectedCount +
      " selected conversation" +
      (selectedCount === 1 ? "" : "s") +
      "?";
    refs.confirmModal.classList.remove("hidden");
    refs.confirmModal.setAttribute("aria-hidden", "false");
  }

  function hideModal() {
    refs.confirmModal.classList.add("hidden");
    refs.confirmModal.setAttribute("aria-hidden", "true");
  }

  function showError(error) {
    const message = utils.getErrorMessage(error);
    if (!popupState.activeTabId) {
      setConnectionBadge("error", "Error");
    }
    popupState.runtimeState.page.lastError = message;
    refs.scanMetaText.textContent = message;
    logger.error("Popup action failed", {
      error: message
    }).catch(() => null);
  }

  async function refreshFromContent() {
    try {
      popupState.runtimeState = await sendToContent({
        type: state.MESSAGE_TYPES.scan
      });
      renderAll();
    } catch (error) {
      await loadBackgroundSnapshot();
      popupState.runtimeState.page.lastError = utils.getErrorMessage(error);
      renderAll();
    }
  }

  function bindFilterInputs() {
    const debouncedKeywordUpdate = utils.debounce(() => {
      sendToContent({
        type: state.MESSAGE_TYPES.updateFilters,
        payload: {
          keyword: refs.keywordInput.value
        }
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    }, 250);

    refs.keywordInput.addEventListener("input", debouncedKeywordUpdate);

    refs.sortSelect.addEventListener("change", () => {
      sendToContent({
        type: state.MESSAGE_TYPES.updateFilters,
        payload: {
          sort: refs.sortSelect.value
        }
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

    refs.archiveModeSelect.addEventListener("change", () => {
      sendToContent({
        type: state.MESSAGE_TYPES.updateFilters,
        payload: {
          archiveMode: refs.archiveModeSelect.value
        }
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

  }

  function bindButtons() {
    refs.scanButton.addEventListener("click", () => {
      sendToContent({
        type: state.MESSAGE_TYPES.scan
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

    refs.deleteButton.addEventListener("click", () => {
      showModal(popupState.runtimeState.selection.count);
    });

    refs.deleteAllButton.addEventListener("click", () => {
      const ids = getFilteredConversations().map((chat) => chat.id);

      if (!ids.length) {
        return;
      }

      // "Delete all" still goes through the normal confirmation flow.
      // We just preselect every chat that is visible under the current filters.
      sendToContent({
        type: state.MESSAGE_TYPES.setSelection,
        payload: {
          mode: "replace",
          chatIds: ids
        }
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
          showModal(ids.length);
        })
        .catch(showError);
    });

    refs.pauseButton.addEventListener("click", () => {
      sendToContent({
        type: state.MESSAGE_TYPES.pause
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

    refs.resumeButton.addEventListener("click", () => {
      sendToContent({
        type: state.MESSAGE_TYPES.resume
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

    refs.stopButton.addEventListener("click", () => {
      sendToContent({
        type: state.MESSAGE_TYPES.stop
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

    refs.invertSelectionButton.addEventListener("click", () => {
      const ids = getFilteredConversations().map((chat) => chat.id);
      sendToContent({
        type: state.MESSAGE_TYPES.setSelection,
        payload: {
          mode: "invert",
          chatIds: ids
        }
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

    refs.clearSelectionButton.addEventListener("click", () => {
      sendToContent({
        type: state.MESSAGE_TYPES.setSelection,
        payload: {
          mode: "none"
        }
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

    refs.retryFailedButton.addEventListener("click", () => {
      sendToContent({
        type: state.MESSAGE_TYPES.retryFailed
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

    refs.confirmDeleteButton.addEventListener("click", () => {
      hideModal();
      sendToContent({
        type: state.MESSAGE_TYPES.startDelete,
        payload: {
          confirmed: true,
          dryRunOverride: false
        }
      })
        .then((runtimeState) => {
          popupState.runtimeState = runtimeState;
          renderAll();
        })
        .catch(showError);
    });

    refs.cancelDeleteButton.addEventListener("click", hideModal);
    refs.confirmModal.addEventListener("click", (event) => {
      if (event.target === refs.confirmModal) {
        hideModal();
      }
    });
  }

  function bindRuntimeListeners() {
    utils.browserApi.runtime.onMessage.addListener((message) => {
      if (!message || !message.type) {
        return;
      }

      if (message.type === state.MESSAGE_TYPES.runtimeUpdated && message.payload && message.payload.state) {
        popupState.runtimeState = message.payload.state;
        renderAll();
      }
    });
  }

  async function initialize() {
    cacheDom();
    bindFilterInputs();
    bindButtons();
    bindRuntimeListeners();
    await loadBackgroundSnapshot().catch(() => null);

    try {
      await refreshFromContent();
    } catch (error) {
      showError(error);
    }

    renderAll();
  }

  initialize().catch(showError);
})(window);
