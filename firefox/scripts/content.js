(function initContent(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.contentController) {
    return;
  }

  const utils = root.utils;
  const state = root.state;
  const storage = root.storage;
  const logger = root.logger.createLogger("content");
  const selectors = root.selectors;
  const filtersModule = root.filters;
  const api = root.api;
  const observerModule = root.observer;
  const exporter = root.exporter;
  const deletion = root.deletion;

  const controller = {
    runtimeState: state.createRuntimeState(),
    selectedIds: new Set(),
    scanInProgress: false,
    bodyObserver: null,
    lastMutationScanAt: 0,
    deletionController: null
  };

  function isOperationRunning() {
    return ["running", "paused", "cancelling"].includes(controller.runtimeState.operation.state);
  }

  function getSelectedChats(chatIds) {
    const ids = Array.isArray(chatIds) && chatIds.length ? chatIds : Array.from(controller.selectedIds);
    const idSet = new Set(ids);
    return controller.runtimeState.conversations.filter((chat) => idSet.has(chat.id));
  }

  function getFilteredConversations() {
    return filtersModule.applyConversationFilters(
      controller.runtimeState.conversations,
      controller.runtimeState.filters,
      Array.from(controller.selectedIds)
    );
  }

  function recomputeSummary(sourceLabel) {
    const filteredConversations = getFilteredConversations();
    const counts = {
      active: 0,
      archived: 0,
      empty: 0
    };

    controller.runtimeState.conversations.forEach((chat) => {
      if (chat.archivedStatus === "archived") {
        counts.archived += 1;
      } else {
        counts.active += 1;
      }

      if (chat.isEmpty) {
        counts.empty += 1;
      }
    });

    controller.runtimeState.selection.selectedIds = Array.from(controller.selectedIds);
    controller.runtimeState.selection.count = controller.selectedIds.size;
    controller.runtimeState.summary.total = controller.runtimeState.conversations.length;
    controller.runtimeState.summary.selected = controller.selectedIds.size;
    controller.runtimeState.summary.filtered = filteredConversations.length;
    controller.runtimeState.summary.active = counts.active;
    controller.runtimeState.summary.archived = counts.archived;
    controller.runtimeState.summary.empty = counts.empty;
    controller.runtimeState.summary.source = sourceLabel || controller.runtimeState.summary.source;
    controller.runtimeState.page.sidebarDetected = controller.runtimeState.summary.sidebarDetected;
    controller.runtimeState.page.apiAvailable = controller.runtimeState.summary.apiAvailable;
    controller.runtimeState.updatedAt = utils.nowIso();
  }

  async function persistAndBroadcast(reason) {
    recomputeSummary(reason);

    try {
      await storage.saveRuntimeState(controller.runtimeState);
    } catch (error) {
      console.warn("[ChatGPTCleaner][content] runtime state persistence failed", error);
    }

    try {
      await utils.safeRuntimeSendMessage({
        type: state.MESSAGE_TYPES.runtimeUpdated,
        payload: {
          reason: reason || "update",
          state: controller.runtimeState
        }
      });
    } catch (error) {
      console.warn("[ChatGPTCleaner][content] runtime update broadcast failed", error);
    }
  }

  function mergeConversationSources(apiConversations, domConversations) {
    const map = new Map();

    // Treat API data as the source of truth, then let the DOM fill in anything
    // the API does not give us cleanly, like row text or date labels.
    (apiConversations || []).forEach((chat) => {
      map.set(chat.id, Object.assign({}, chat));
    });

    (domConversations || []).forEach((chat) => {
      const existing = map.get(chat.id);

      if (!existing) {
        map.set(chat.id, Object.assign({}, chat));
        return;
      }

      map.set(
        chat.id,
        Object.assign({}, existing, {
          title: existing.title || chat.title,
          normalizedTitle: existing.normalizedTitle || chat.normalizedTitle,
          rowText: chat.rowText || existing.rowText,
          dateLabel: chat.dateLabel || existing.dateLabel,
          lastSeenAt: chat.lastSeenAt || existing.lastSeenAt,
          source: "merged"
        })
      );
    });

    return storage.sanitizeConversations(Array.from(map.values()));
  }

  async function scanSidebarDom(settings) {
    const sidebar = selectors.findSidebarRoot();

    if (!sidebar) {
      return {
        sidebarDetected: false,
        items: []
      };
    }

    const scrollContainer = selectors.findScrollContainer(sidebar) || sidebar;
    const originalScrollTop = scrollContainer.scrollTop;
    const itemsMap = new Map();
    let idleRounds = 0;
    let pass = 0;
    let previousCount = 0;
    const startedAt = Date.now();

    function collectVisibleRows() {
      selectors.findConversationLinks(sidebar).forEach((link) => {
        const record = selectors.extractConversationFromRow(link, global.location.origin);

        if (!record) {
          return;
        }

        itemsMap.set(record.id, record);
      });
    }

    collectVisibleRows();
    scrollContainer.scrollTop = 0;
    await utils.sleep(150);
    collectVisibleRows();

    // The sidebar lazy-loads aggressively, so we keep walking it until we stop
    // discovering new rows or hit the safety limits from settings.
    while (pass < settings.detection.maxScrollPasses && Date.now() - startedAt < settings.detection.scanTimeoutMs) {
      const maxScrollTop = Math.max(scrollContainer.scrollHeight - scrollContainer.clientHeight, 0);
      const nextScrollTop = Math.min(
        scrollContainer.scrollTop + Math.max(scrollContainer.clientHeight * 0.85, 240),
        maxScrollTop
      );

      scrollContainer.scrollTop = nextScrollTop;
      await utils.sleep(250);
      collectVisibleRows();

      if (itemsMap.size === previousCount || nextScrollTop >= maxScrollTop) {
        idleRounds += 1;
      } else {
        idleRounds = 0;
      }

      previousCount = itemsMap.size;
      pass += 1;

      if (idleRounds >= settings.detection.idleScrollRounds) {
        break;
      }
    }

    scrollContainer.scrollTop = originalScrollTop;

    return {
      sidebarDetected: true,
      items: Array.from(itemsMap.values())
    };
  }

  async function scanConversations(reason) {
    if (controller.scanInProgress) {
      return controller.runtimeState;
    }

    controller.scanInProgress = true;
    controller.runtimeState.page.lastError = "";

    try {
      const settings = await storage.getSettings();
      const filters = await storage.getFilters();
      controller.runtimeState.settings = settings;
      controller.runtimeState.filters = filters;

      let apiProbe = { status: "rejected" };
      let activeResult = { status: "rejected" };
      let archivedResult = { status: "rejected" };
      
      const domResult = await scanSidebarDom(settings);

      // Only aggressively hit the API if the user explicitly clicked "Scan"
      if (reason === "manual") {
        const results = await Promise.allSettled([
          api.probeApi(),
          api.fetchAllConversationMetadata({ isArchived: false }),
          api.fetchAllConversationMetadata({ isArchived: true })
        ]);
        apiProbe = results[0];
        activeResult = results[1];
        archivedResult = results[2];
      } else {
        // Just probe to see if API is available, no aggressive fetching
        const results = await Promise.allSettled([api.probeApi()]);
        apiProbe = results[0];
      }

      const apiAvailable = apiProbe.status === "fulfilled" && apiProbe.value === true;
      const activeItems = activeResult.status === "fulfilled" ? activeResult.value : [];
      const archivedItems = archivedResult.status === "fulfilled" ? archivedResult.value : [];
      const domItems = domResult.items || [];
      const sidebarDetected = domResult.sidebarDetected || false;
      const mergedConversations = mergeConversationSources(activeItems.concat(archivedItems), domItems);
      const availableIds = new Set(mergedConversations.map((chat) => chat.id));

      controller.selectedIds.forEach((chatId) => {
        if (!availableIds.has(chatId)) {
          controller.selectedIds.delete(chatId);
        }
      });

      controller.runtimeState.ready = true;
      controller.runtimeState.host = global.location.host;
      controller.runtimeState.pageUrl = global.location.href;
      controller.runtimeState.page.isChatPage = utils.isChatPage();
      controller.runtimeState.page.apiAvailable = apiAvailable;
      controller.runtimeState.page.authState = apiAvailable ? "authenticated" : "unknown";
      controller.runtimeState.page.sidebarDetected = sidebarDetected;
      controller.runtimeState.conversations = mergedConversations;
      controller.runtimeState.summary.apiAvailable = apiAvailable;
      controller.runtimeState.summary.sidebarDetected = sidebarDetected;
      controller.runtimeState.summary.lastScanAt = utils.nowIso();

      await persistAndBroadcast(reason || "scan");

      await logger.info("Scan complete", {
        reason: reason || "scan",
        total: mergedConversations.length,
        apiAvailable: apiAvailable,
        sidebarDetected: sidebarDetected
      });

      return controller.runtimeState;
    } catch (error) {
      controller.runtimeState.page.lastError = utils.getErrorMessage(error);
      await persistAndBroadcast("scan-error");
      await logger.error("Conversation scan failed", {
        error: utils.getErrorMessage(error)
      });
      throw error;
    } finally {
      controller.scanInProgress = false;
    }
  }

  async function ensureConversationVisible(chat) {
    const existingRow = selectors.findRowByConversationId(chat.id);

    if (existingRow) {
      existingRow.scrollIntoView({
        block: "center",
        behavior: "smooth"
      });
      await utils.sleep(250);
      return;
    }

    await scanConversations("ensure-visible");

    const secondAttempt = selectors.findRowByConversationId(chat.id);

    if (secondAttempt) {
      secondAttempt.scrollIntoView({
        block: "center",
        behavior: "smooth"
      });
      await utils.sleep(250);
    }
  }

  async function onConversationDeleted(chatId) {
    controller.runtimeState.conversations = controller.runtimeState.conversations.filter((chat) => chat.id !== chatId);
    controller.selectedIds.delete(chatId);
    await persistAndBroadcast("conversation-deleted");
  }

  async function onOperationUpdate(operation) {
    controller.runtimeState.operation = root.storage.sanitizeRuntimeState({
      operation: operation
    }).operation;
    await persistAndBroadcast("operation-update");
  }

  async function onOperationFinished(operation, metadata) {
    controller.runtimeState.operation = root.storage.sanitizeRuntimeState({
      operation: operation
    }).operation;

    await storage.appendHistory(state.createHistoryEntry(operation, metadata));
    await persistAndBroadcast("operation-finished");

    const title = operation.state === "completed" ? "Deletion complete" : "Deletion finished with issues";
    const message = operation.progress.succeeded + " succeeded, " + operation.progress.failed + " failed.";

    await utils.safeRuntimeSendMessage({
      type: state.MESSAGE_TYPES.notify,
      payload: {
        title,
        message
      }
    });
  }

  function createDeletionController() {
    return deletion.createDeletionController({
      logger,
      ensureConversationVisible,
      onConversationDeleted,
      onOperationUpdate,
      onOperationFinished
    });
  }

  async function updateFilters(input) {
    controller.runtimeState.filters = await storage.saveFilters(
      Object.assign({}, controller.runtimeState.filters, input || {})
    );
    await persistAndBroadcast("filters-updated");
    return controller.runtimeState;
  }

  async function updateSettings(input) {
    const nextSettings = Object.assign({}, controller.runtimeState.settings, input || {});

    if (input && input.operation) {
      nextSettings.operation = Object.assign({}, controller.runtimeState.settings.operation, input.operation);
    }

    if (input && input.detection) {
      nextSettings.detection = Object.assign({}, controller.runtimeState.settings.detection, input.detection);
    }

    if (input && input.ui) {
      nextSettings.ui = Object.assign({}, controller.runtimeState.settings.ui, input.ui);
    }

    if (input && input.safety) {
      nextSettings.safety = Object.assign({}, controller.runtimeState.settings.safety, input.safety);
    }

    controller.runtimeState.settings = await storage.saveSettings(nextSettings);
    await persistAndBroadcast("settings-updated");
    return controller.runtimeState;
  }

  async function setSelection(payload) {
    const mode = payload.mode;
    const ids = Array.isArray(payload.chatIds) ? payload.chatIds.filter(Boolean) : [];
    const idSet = new Set(ids);

    if (mode === "toggle" && payload.chatId) {
      if (controller.selectedIds.has(payload.chatId)) {
        controller.selectedIds.delete(payload.chatId);
      } else {
        controller.selectedIds.add(payload.chatId);
      }
    } else if (mode === "replace") {
      controller.selectedIds = new Set(ids);
    } else if (mode === "all") {
      controller.runtimeState.conversations.forEach((chat) => controller.selectedIds.add(chat.id));
    } else if (mode === "bulk-add") {
      ids.forEach((id) => controller.selectedIds.add(id));
    } else if (mode === "bulk-remove") {
      ids.forEach((id) => controller.selectedIds.delete(id));
    } else if (mode === "none") {
      controller.selectedIds.clear();
    } else if (mode === "invert") {
      const targetIds = ids.length ? ids : controller.runtimeState.conversations.map((chat) => chat.id);
      targetIds.forEach((id) => {
        if (controller.selectedIds.has(id)) {
          controller.selectedIds.delete(id);
        } else if (idSet.size === 0 || idSet.has(id)) {
          controller.selectedIds.add(id);
        }
      });
    }

    await persistAndBroadcast("selection-updated");
    return controller.runtimeState;
  }

  async function exportSelection(payload) {
    const candidates = getSelectedChats(payload && payload.chatIds);
    const fallbackItems = candidates.length ? candidates : getFilteredConversations();
    const items = fallbackItems.length ? fallbackItems : controller.runtimeState.conversations;
    const fileBaseName = utils.sanitizeFilename(
      "chatgpt-cleaner-export-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"),
      "chatgpt-cleaner-export"
    );
    const backupPayload = exporter.buildBackupPayload({
      scope: "manual",
      chats: items,
      settings: controller.runtimeState.settings,
      filters: controller.runtimeState.filters,
      metadata: {
        selectedCount: controller.selectedIds.size
      }
    });

    await exporter.downloadBackup(fileBaseName, backupPayload, "manual");
    await logger.info("Manual export completed", {
      count: items.length,
      fileBaseName: fileBaseName
    });

    return {
      exportedCount: items.length,
      fileName: fileBaseName + ".json"
    };
  }

  async function startDelete(payload) {
    const settings = await storage.getSettings();
    controller.runtimeState.settings = settings;
    const selectedChats = getSelectedChats(payload && payload.chatIds);
    const targetChats = selectedChats.length ? selectedChats : [];

    if (!targetChats.length) {
      throw new Error("Select at least one conversation before deleting");
    }

    if (targetChats.length > settings.safety.maxOperationSize) {
      throw new Error(
        "Selection exceeds the configured safety limit of " + settings.safety.maxOperationSize + " conversations"
      );
    }

    if (settings.operation.confirmationRequired && !(payload && payload.confirmed)) {
      throw new Error("Deletion confirmation is required");
    }

    const dryRunEnabled =
      payload && typeof payload.dryRunOverride === "boolean"
        ? payload.dryRunOverride
        : settings.operation.dryRun;
    const exportBeforeDelete =
      payload && typeof payload.exportBeforeDeleteOverride === "boolean"
        ? payload.exportBeforeDeleteOverride
        : settings.operation.exportBeforeDelete;
    let exportFileName = "";

    if (exportBeforeDelete) {
      const fileBaseName = utils.sanitizeFilename(
        "chatgpt-cleaner-backup-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"),
        "chatgpt-cleaner-backup"
      );
      const backupPayload = exporter.buildBackupPayload({
        scope: "pre-delete",
        chats: targetChats,
        settings: Object.assign({}, settings, {
          operation: Object.assign({}, settings.operation, {
            dryRun: dryRunEnabled
          })
        }),
        filters: controller.runtimeState.filters,
        metadata: {
          reason: "delete-operation"
        }
      });

      await exporter.downloadBackup(fileBaseName, backupPayload, "pre-delete");
      exportFileName = fileBaseName + ".json";
    }

    const effectiveSettings = Object.assign({}, settings, {
      operation: Object.assign({}, settings.operation, {
        dryRun: dryRunEnabled
      })
    });

    await controller.deletionController.start(targetChats, effectiveSettings, {
      exportFileName: exportFileName
    });

    return controller.runtimeState;
  }

  async function retryFailed() {
    const failedIds = controller.runtimeState.operation.failedChatIds || [];

    if (!failedIds.length) {
      throw new Error("There are no failed conversations to retry");
    }

    controller.selectedIds = new Set(failedIds);
    await persistAndBroadcast("retry-failed-selection");
    return startDelete({
      confirmed: true,
      dryRunOverride: false,
      exportBeforeDeleteOverride: false
    });
  }

  async function handleMutationScan() {
    if (!controller.runtimeState.settings.detection.rescanOnMutations || isOperationRunning()) {
      return;
    }

    const now = Date.now();

    if (now - controller.lastMutationScanAt < 3500) {
      return;
    }

    controller.lastMutationScanAt = now;
    await scanConversations("mutation");
  }

  function registerObservers() {
    if (controller.bodyObserver) {
      controller.bodyObserver.stop();
    }

    controller.bodyObserver = observerModule.createMutationObserver({
      target: global.document.body,
      debounceMs: controller.runtimeState.settings.detection.observerDebounceMs,
      callback: () => {
        handleMutationScan().catch((error) => {
          logger.warn("Mutation-triggered scan failed", {
            error: utils.getErrorMessage(error)
          });
        });
      }
    });

    controller.bodyObserver.start();
  }

  async function handleMessage(message) {
    if (!message || !message.type) {
      return controller.runtimeState;
    }

    if (message.type === state.MESSAGE_TYPES.ping) {
      return {
        ready: true,
        host: global.location.host
      };
    }

    if (message.type === state.MESSAGE_TYPES.getState) {
      return controller.runtimeState;
    }

    if (message.type === state.MESSAGE_TYPES.scan) {
      return scanConversations("manual");
    }

    if (message.type === state.MESSAGE_TYPES.updateFilters) {
      return updateFilters(message.payload);
    }

    if (message.type === state.MESSAGE_TYPES.updateSettings) {
      return updateSettings(message.payload);
    }

    if (message.type === state.MESSAGE_TYPES.setSelection) {
      return setSelection(message.payload || {});
    }

    if (message.type === state.MESSAGE_TYPES.exportSelection) {
      return exportSelection(message.payload || {});
    }

    if (message.type === state.MESSAGE_TYPES.startDelete) {
      return startDelete(message.payload || {});
    }

    if (message.type === state.MESSAGE_TYPES.pause) {
      await controller.deletionController.pause();
      return controller.runtimeState;
    }

    if (message.type === state.MESSAGE_TYPES.resume) {
      await controller.deletionController.resume();
      return controller.runtimeState;
    }

    if (message.type === state.MESSAGE_TYPES.stop) {
      await controller.deletionController.stop();
      return controller.runtimeState;
    }

    if (message.type === state.MESSAGE_TYPES.retryFailed) {
      return retryFailed();
    }

    return controller.runtimeState;
  }

  async function initialize() {
    if (!utils.isChatPage()) {
      return;
    }

    await storage.initializeStorage();
    const storedRuntime = await storage.getRuntimeState();
    controller.runtimeState = storedRuntime;
    controller.runtimeState.ready = true;
    controller.runtimeState.host = global.location.host;
    controller.runtimeState.pageUrl = global.location.href;
    controller.runtimeState.page.isChatPage = true;
    controller.runtimeState.settings = await storage.getSettings();
    controller.runtimeState.filters = await storage.getFilters();
    controller.selectedIds = new Set(controller.runtimeState.selection.selectedIds || []);
    controller.deletionController = createDeletionController();

    await scanConversations("initial");
    await logger.info("Content controller initialized", {
      host: global.location.host
    });
  }

  utils.browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
      .then((data) => sendResponse({ ok: true, data: data }))
      .catch((error) => sendResponse({ ok: false, error: utils.getErrorMessage(error) }));
    return true;
  });

  initialize().catch((error) => {
    logger.error("Content initialization failed", {
      error: utils.getErrorMessage(error)
    });
  });

  root.contentController = controller;
})(globalThis);
