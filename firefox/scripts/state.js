(function initState(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.state) {
    return;
  }

  const utils = root.utils;

  const STORAGE_KEYS = {
    settings: "cleaner.settings",
    filters: "cleaner.filters",
    runtimeState: "cleaner.runtimeState",
    logs: "cleaner.logs",
    history: "cleaner.history",
    backups: "cleaner.backups"
  };

  const MESSAGE_TYPES = {
    ping: "cleaner/ping",
    getState: "cleaner/get-state",
    scan: "cleaner/scan",
    updateFilters: "cleaner/update-filters",
    updateSettings: "cleaner/update-settings",
    setSelection: "cleaner/set-selection",
    startDelete: "cleaner/start-delete",
    pause: "cleaner/pause",
    resume: "cleaner/resume",
    stop: "cleaner/stop",
    retryFailed: "cleaner/retry-failed",
    exportSelection: "cleaner/export-selection",
    getExtensionState: "cleaner/get-extension-state",
    downloadJson: "cleaner/download-json",
    notify: "cleaner/notify",
    runtimeUpdated: "cleaner/runtime-updated",
    logAdded: "cleaner/log-added",
    apiFetch: "cleaner/api-fetch"
  };

  const LIMITS = {
    maxLogs: 250,
    maxHistory: 100,
    maxBackups: 40,
    maxConversations: 5000
  };

  const DEFAULT_SETTINGS = {
    operation: {
      batchSize: 3,
      delayMs: 1200,
      batchCooldownMs: 3000,
      retries: 3,
      retryBaseDelayMs: 2000,
      dryRun: false,
      exportBeforeDelete: true,
      confirmationRequired: true
    },
    detection: {
      observerDebounceMs: 900,
      rescanOnMutations: true,
      maxScrollPasses: 50,
      idleScrollRounds: 3,
      scanTimeoutMs: 45000
    },
    ui: {
      logLevel: "info",
      compactRows: false
    },
    safety: {
      maxOperationSize: 2000
    }
  };

  const DEFAULT_FILTERS = {
    keyword: "",
    sort: "newest",
    archiveMode: "all",
    emptyOnly: false,
    selectedOnly: false
  };

  function createOperationState() {
    return {
      id: "",
      kind: "delete",
      state: "idle",
      dryRun: false,
      startedAt: "",
      updatedAt: "",
      currentChatId: "",
      lastMessage: "",
      exportFileName: "",
      progress: {
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        remaining: 0,
        percent: 0
      },
      failedChatIds: [],
      results: []
    };
  }

  function createSummary() {
    return {
      total: 0,
      selected: 0,
      filtered: 0,
      active: 0,
      archived: 0,
      empty: 0,
      lastScanAt: "",
      source: "none",
      apiAvailable: false,
      sidebarDetected: false
    };
  }

  function createRuntimeState(overrides) {
    const base = {
      ready: false,
      host: "",
      pageUrl: "",
      updatedAt: utils.nowIso(),
      page: {
        isChatPage: false,
        sidebarDetected: false,
        apiAvailable: false,
        authState: "unknown",
        lastError: ""
      },
      settings: utils.deepClone(DEFAULT_SETTINGS),
      filters: utils.deepClone(DEFAULT_FILTERS),
      conversations: [],
      summary: createSummary(),
      selection: {
        selectedIds: [],
        count: 0
      },
      operation: createOperationState()
    };

    if (!overrides) {
      return base;
    }

    return Object.assign(base, overrides);
  }

  function calculateProgress(results, total) {
    const progress = {
      total: total || 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      remaining: 0,
      percent: 0
    };

    (results || []).forEach((result) => {
      progress.processed += 1;

      if (result.status === "success") {
        progress.succeeded += 1;
      } else if (result.status === "failed") {
        progress.failed += 1;
      } else {
        progress.skipped += 1;
      }
    });

    progress.remaining = Math.max(progress.total - progress.processed, 0);
    progress.percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
    return progress;
  }

  function createHistoryEntry(operation, metadata) {
    return {
      id: utils.createId("history"),
      operationId: operation.id,
      kind: operation.kind,
      state: operation.state,
      dryRun: operation.dryRun,
      startedAt: operation.startedAt,
      finishedAt: utils.nowIso(),
      progress: utils.deepClone(operation.progress),
      exportFileName: operation.exportFileName || "",
      metadata: metadata || {}
    };
  }

  root.state = {
    STORAGE_KEYS,
    MESSAGE_TYPES,
    LIMITS,
    DEFAULT_SETTINGS,
    DEFAULT_FILTERS,
    createOperationState,
    createRuntimeState,
    createSummary,
    calculateProgress,
    createHistoryEntry
  };
})(globalThis);
