(function initStorage(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.storage) {
    return;
  }

  const utils = root.utils;
  const state = root.state;

  function sanitizeBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  function sanitizeNumber(value, fallback, min, max) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return fallback;
    }

    return utils.clamp(Math.round(value), min, max);
  }

  function sanitizeString(value, fallback) {
    return typeof value === "string" ? value : fallback;
  }

  function sanitizeSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    const operation = source.operation && typeof source.operation === "object" ? source.operation : {};
    const detection = source.detection && typeof source.detection === "object" ? source.detection : {};
    const ui = source.ui && typeof source.ui === "object" ? source.ui : {};
    const safety = source.safety && typeof source.safety === "object" ? source.safety : {};

    return {
      operation: {
        batchSize: sanitizeNumber(operation.batchSize, state.DEFAULT_SETTINGS.operation.batchSize, 1, 50),
        delayMs: sanitizeNumber(operation.delayMs, state.DEFAULT_SETTINGS.operation.delayMs, 100, 10000),
        batchCooldownMs: sanitizeNumber(
          operation.batchCooldownMs,
          state.DEFAULT_SETTINGS.operation.batchCooldownMs,
          250,
          30000
        ),
        retries: sanitizeNumber(operation.retries, state.DEFAULT_SETTINGS.operation.retries, 0, 6),
        retryBaseDelayMs: sanitizeNumber(
          operation.retryBaseDelayMs,
          state.DEFAULT_SETTINGS.operation.retryBaseDelayMs,
          250,
          15000
        ),
        dryRun: sanitizeBoolean(operation.dryRun, state.DEFAULT_SETTINGS.operation.dryRun),
        exportBeforeDelete: sanitizeBoolean(
          operation.exportBeforeDelete,
          state.DEFAULT_SETTINGS.operation.exportBeforeDelete
        ),
        confirmationRequired: sanitizeBoolean(
          operation.confirmationRequired,
          state.DEFAULT_SETTINGS.operation.confirmationRequired
        )
      },
      detection: {
        observerDebounceMs: sanitizeNumber(
          detection.observerDebounceMs,
          state.DEFAULT_SETTINGS.detection.observerDebounceMs,
          200,
          5000
        ),
        rescanOnMutations: sanitizeBoolean(
          detection.rescanOnMutations,
          state.DEFAULT_SETTINGS.detection.rescanOnMutations
        ),
        maxScrollPasses: sanitizeNumber(
          detection.maxScrollPasses,
          state.DEFAULT_SETTINGS.detection.maxScrollPasses,
          5,
          100
        ),
        idleScrollRounds: sanitizeNumber(
          detection.idleScrollRounds,
          state.DEFAULT_SETTINGS.detection.idleScrollRounds,
          1,
          10
        ),
        scanTimeoutMs: sanitizeNumber(
          detection.scanTimeoutMs,
          state.DEFAULT_SETTINGS.detection.scanTimeoutMs,
          3000,
          120000
        )
      },
      ui: {
        logLevel: ["debug", "info", "warn", "error"].includes(ui.logLevel)
          ? ui.logLevel
          : state.DEFAULT_SETTINGS.ui.logLevel,
        compactRows: sanitizeBoolean(ui.compactRows, state.DEFAULT_SETTINGS.ui.compactRows)
      },
      safety: {
        maxOperationSize: sanitizeNumber(
          safety.maxOperationSize,
          state.DEFAULT_SETTINGS.safety.maxOperationSize,
          1,
          5000
        )
      }
    };
  }

  function sanitizeFilters(input) {
    const source = input && typeof input === "object" ? input : {};

    return {
      keyword: utils.normalizeWhitespace(sanitizeString(source.keyword, "")),
      sort: ["newest", "oldest", "title"].includes(source.sort) ? source.sort : state.DEFAULT_FILTERS.sort,
      archiveMode: ["all", "active", "archived"].includes(source.archiveMode)
        ? source.archiveMode
        : state.DEFAULT_FILTERS.archiveMode,
      emptyOnly: sanitizeBoolean(source.emptyOnly, state.DEFAULT_FILTERS.emptyOnly),
      selectedOnly: sanitizeBoolean(source.selectedOnly, state.DEFAULT_FILTERS.selectedOnly)
    };
  }

  function sanitizeConversation(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const id = sanitizeString(record.id, "");

    if (!id) {
      return null;
    }

    return {
      id,
      title: sanitizeString(record.title, "Untitled chat") || "Untitled chat",
      normalizedTitle: sanitizeString(record.normalizedTitle, utils.normalizeTitle(record.title || "Untitled chat")),
      url: sanitizeString(record.url, utils.conversationUrlFromId(id)),
      updatedAt: sanitizeString(record.updatedAt, ""),
      createdAt: sanitizeString(record.createdAt, ""),
      archivedStatus: ["active", "archived", "unknown"].includes(record.archivedStatus)
        ? record.archivedStatus
        : "unknown",
      isEmpty: sanitizeBoolean(record.isEmpty, false),
      source: sanitizeString(record.source, "unknown"),
      rowText: sanitizeString(record.rowText, sanitizeString(record.title, "Untitled chat")),
      dateLabel: sanitizeString(record.dateLabel, ""),
      modelHint: sanitizeString(record.modelHint, ""),
      lastSeenAt: sanitizeString(record.lastSeenAt, utils.nowIso())
    };
  }

  function sanitizeConversations(items) {
    const list = Array.isArray(items) ? items : [];

    return utils.uniqueBy(
      list.map(sanitizeConversation).filter(Boolean).slice(0, state.LIMITS.maxConversations),
      (item) => item.id
    );
  }

  function sanitizeOperationResult(item) {
    if (!item || typeof item !== "object") {
      return null;
    }

    if (!["success", "failed", "skipped"].includes(item.status)) {
      return null;
    }

    return {
      chatId: sanitizeString(item.chatId, ""),
      title: sanitizeString(item.title, "Untitled chat"),
      status: item.status,
      via: sanitizeString(item.via, ""),
      attempts: sanitizeNumber(item.attempts, 1, 1, 10),
      error: sanitizeString(item.error, ""),
      completedAt: sanitizeString(item.completedAt, utils.nowIso())
    };
  }

  function sanitizeOperation(operation) {
    const base = state.createOperationState();
    const source = operation && typeof operation === "object" ? operation : {};
    const results = Array.isArray(source.results)
      ? source.results.map(sanitizeOperationResult).filter(Boolean)
      : [];

    return {
      id: sanitizeString(source.id, ""),
      kind: sanitizeString(source.kind, "delete"),
      state: ["idle", "running", "paused", "cancelling", "cancelled", "completed", "failed"].includes(source.state)
        ? source.state
        : base.state,
      dryRun: sanitizeBoolean(source.dryRun, base.dryRun),
      startedAt: sanitizeString(source.startedAt, ""),
      updatedAt: sanitizeString(source.updatedAt, ""),
      currentChatId: sanitizeString(source.currentChatId, ""),
      lastMessage: sanitizeString(source.lastMessage, ""),
      exportFileName: sanitizeString(source.exportFileName, ""),
      progress: state.calculateProgress(
        results,
        sanitizeNumber(source.progress && source.progress.total, 0, 0, state.LIMITS.maxConversations)
      ),
      failedChatIds: utils.uniqueStrings(Array.isArray(source.failedChatIds) ? source.failedChatIds : []),
      results
    };
  }

  function sanitizeSummary(summary) {
    const base = state.createSummary();
    const source = summary && typeof summary === "object" ? summary : {};

    return {
      total: sanitizeNumber(source.total, base.total, 0, state.LIMITS.maxConversations),
      selected: sanitizeNumber(source.selected, base.selected, 0, state.LIMITS.maxConversations),
      filtered: sanitizeNumber(source.filtered, base.filtered, 0, state.LIMITS.maxConversations),
      active: sanitizeNumber(source.active, base.active, 0, state.LIMITS.maxConversations),
      archived: sanitizeNumber(source.archived, base.archived, 0, state.LIMITS.maxConversations),
      empty: sanitizeNumber(source.empty, base.empty, 0, state.LIMITS.maxConversations),
      lastScanAt: sanitizeString(source.lastScanAt, ""),
      source: sanitizeString(source.source, base.source),
      apiAvailable: sanitizeBoolean(source.apiAvailable, base.apiAvailable),
      sidebarDetected: sanitizeBoolean(source.sidebarDetected, base.sidebarDetected)
    };
  }

  function sanitizeRuntimeState(input) {
    const base = state.createRuntimeState();
    const source = input && typeof input === "object" ? input : {};
    const selection = source.selection && typeof source.selection === "object" ? source.selection : {};
    const page = source.page && typeof source.page === "object" ? source.page : {};
    const conversations = sanitizeConversations(source.conversations);

    return {
      ready: sanitizeBoolean(source.ready, base.ready),
      host: sanitizeString(source.host, base.host),
      pageUrl: sanitizeString(source.pageUrl, base.pageUrl),
      updatedAt: sanitizeString(source.updatedAt, utils.nowIso()),
      page: {
        isChatPage: sanitizeBoolean(page.isChatPage, base.page.isChatPage),
        sidebarDetected: sanitizeBoolean(page.sidebarDetected, base.page.sidebarDetected),
        apiAvailable: sanitizeBoolean(page.apiAvailable, base.page.apiAvailable),
        authState: sanitizeString(page.authState, base.page.authState),
        lastError: sanitizeString(page.lastError, base.page.lastError)
      },
      settings: sanitizeSettings(source.settings),
      filters: sanitizeFilters(source.filters),
      conversations,
      summary: sanitizeSummary(source.summary),
      selection: {
        selectedIds: utils.uniqueStrings(Array.isArray(selection.selectedIds) ? selection.selectedIds : []),
        count: sanitizeNumber(selection.count, 0, 0, state.LIMITS.maxConversations)
      },
      operation: sanitizeOperation(source.operation)
    };
  }

  function sanitizeLogEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    return {
      id: sanitizeString(entry.id, utils.createId("log")),
      level: ["debug", "info", "warn", "error"].includes(entry.level) ? entry.level : "info",
      context: sanitizeString(entry.context, "runtime"),
      message: sanitizeString(entry.message, ""),
      metadata: sanitizeString(entry.metadata, ""),
      createdAt: sanitizeString(entry.createdAt, utils.nowIso())
    };
  }

  function sanitizeLogs(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map(sanitizeLogEntry).filter(Boolean).slice(-state.LIMITS.maxLogs);
  }

  function sanitizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    return {
      id: sanitizeString(entry.id, utils.createId("history")),
      operationId: sanitizeString(entry.operationId, ""),
      kind: sanitizeString(entry.kind, "delete"),
      state: sanitizeString(entry.state, "completed"),
      dryRun: sanitizeBoolean(entry.dryRun, false),
      startedAt: sanitizeString(entry.startedAt, ""),
      finishedAt: sanitizeString(entry.finishedAt, utils.nowIso()),
      progress: entry.progress && typeof entry.progress === "object" ? entry.progress : {},
      exportFileName: sanitizeString(entry.exportFileName, ""),
      metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {}
    };
  }

  function sanitizeHistory(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map(sanitizeHistoryEntry).filter(Boolean).slice(-state.LIMITS.maxHistory);
  }

  function sanitizeBackupRecord(item) {
    if (!item || typeof item !== "object") {
      return null;
    }

    return {
      id: sanitizeString(item.id, utils.createId("backup")),
      fileName: sanitizeString(item.fileName, ""),
      count: sanitizeNumber(item.count, 0, 0, state.LIMITS.maxConversations),
      createdAt: sanitizeString(item.createdAt, utils.nowIso()),
      scope: sanitizeString(item.scope, "manual")
    };
  }

  function sanitizeBackups(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map(sanitizeBackupRecord).filter(Boolean).slice(-state.LIMITS.maxBackups);
  }

  async function initializeStorage() {
    const snapshot = await utils.storageGet(Object.values(state.STORAGE_KEYS));
    const runtimeState = sanitizeRuntimeState(snapshot[state.STORAGE_KEYS.runtimeState]);

    // A browser or extension refresh cannot safely resume an old queue job,
    // so we bring the operation panel back to its default idle state on startup.
    runtimeState.operation = state.createOperationState();

    await utils.storageSet({
      [state.STORAGE_KEYS.settings]: sanitizeSettings(snapshot[state.STORAGE_KEYS.settings]),
      [state.STORAGE_KEYS.filters]: sanitizeFilters(snapshot[state.STORAGE_KEYS.filters]),
      [state.STORAGE_KEYS.runtimeState]: runtimeState,
      [state.STORAGE_KEYS.logs]: sanitizeLogs(snapshot[state.STORAGE_KEYS.logs]),
      [state.STORAGE_KEYS.history]: sanitizeHistory(snapshot[state.STORAGE_KEYS.history]),
      [state.STORAGE_KEYS.backups]: sanitizeBackups(snapshot[state.STORAGE_KEYS.backups])
    });
  }

  async function getSettings() {
    const result = await utils.storageGet(state.STORAGE_KEYS.settings);
    return sanitizeSettings(result[state.STORAGE_KEYS.settings]);
  }

  async function saveSettings(settings) {
    const sanitized = sanitizeSettings(settings);
    await utils.storageSet({ [state.STORAGE_KEYS.settings]: sanitized });
    return sanitized;
  }

  async function getFilters() {
    const result = await utils.storageGet(state.STORAGE_KEYS.filters);
    return sanitizeFilters(result[state.STORAGE_KEYS.filters]);
  }

  async function saveFilters(filters) {
    const sanitized = sanitizeFilters(filters);
    await utils.storageSet({ [state.STORAGE_KEYS.filters]: sanitized });
    return sanitized;
  }

  async function getRuntimeState() {
    const result = await utils.storageGet(state.STORAGE_KEYS.runtimeState);
    return sanitizeRuntimeState(result[state.STORAGE_KEYS.runtimeState]);
  }

  async function saveRuntimeState(runtimeState) {
    const sanitized = sanitizeRuntimeState(runtimeState);
    await utils.storageSet({ [state.STORAGE_KEYS.runtimeState]: sanitized });
    return sanitized;
  }

  async function getLogs() {
    const result = await utils.storageGet(state.STORAGE_KEYS.logs);
    return sanitizeLogs(result[state.STORAGE_KEYS.logs]);
  }

  async function appendLog(entry) {
    const logs = await getLogs();
    logs.push(entry);
    await utils.storageSet({ [state.STORAGE_KEYS.logs]: sanitizeLogs(logs) });
  }

  async function getHistory() {
    const result = await utils.storageGet(state.STORAGE_KEYS.history);
    return sanitizeHistory(result[state.STORAGE_KEYS.history]);
  }

  async function appendHistory(entry) {
    const history = await getHistory();
    history.push(entry);
    await utils.storageSet({ [state.STORAGE_KEYS.history]: sanitizeHistory(history) });
  }

  async function getBackups() {
    const result = await utils.storageGet(state.STORAGE_KEYS.backups);
    return sanitizeBackups(result[state.STORAGE_KEYS.backups]);
  }

  async function appendBackup(record) {
    const backups = await getBackups();
    backups.push(record);
    await utils.storageSet({ [state.STORAGE_KEYS.backups]: sanitizeBackups(backups) });
  }

  async function getExtensionStateSnapshot() {
    const [runtimeState, settings, filters, logs, history, backups] = await Promise.all([
      getRuntimeState(),
      getSettings(),
      getFilters(),
      getLogs(),
      getHistory(),
      getBackups()
    ]);

    runtimeState.settings = settings;
    runtimeState.filters = filters;

    return {
      runtimeState,
      logs,
      history,
      backups
    };
  }

  root.storage = {
    initializeStorage,
    sanitizeSettings,
    sanitizeFilters,
    sanitizeRuntimeState,
    getSettings,
    saveSettings,
    getFilters,
    saveFilters,
    getRuntimeState,
    saveRuntimeState,
    getLogs,
    appendLog,
    getHistory,
    appendHistory,
    getBackups,
    appendBackup,
    getExtensionStateSnapshot,
    sanitizeConversations
  };
})(globalThis);
