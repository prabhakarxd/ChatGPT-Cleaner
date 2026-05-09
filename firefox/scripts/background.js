(function initBackground(global) {
  "use strict";

  const root = global.ChatGPTCleaner;
  const utils = root.utils;
  const state = root.state;
  const storage = root.storage;

  storage.initializeStorage().catch((error) => {
    console.error("[ChatGPTCleaner][background] storage init failed", error);
  });

  async function handleDownloadJson(payload) {
    const jsonString = JSON.stringify(payload.data, null, 2);
    const fileName = utils.sanitizeFilename(payload.fileName, "chatgpt-cleaner-backup") + ".json";

    await utils.downloadsDownload({
      filename: fileName,
      saveAs: false,
      conflictAction: "uniquify",
      url: utils.toDataUrl(jsonString)
    });

    await storage.appendBackup({
      id: utils.createId("backup"),
      fileName,
      count: payload.data && payload.data.totalChats ? payload.data.totalChats : 0,
      createdAt: utils.nowIso(),
      scope: payload.scope || "manual"
    });

    return {
      fileName
    };
  }

  async function handleMessage(message) {
    if (!message || !message.type) {
      return null;
    }

    if (message.type === state.MESSAGE_TYPES.downloadJson) {
      return handleDownloadJson(message.payload || {});
    }

    if (message.type === state.MESSAGE_TYPES.getExtensionState) {
      return storage.getExtensionStateSnapshot();
    }

    if (message.type === state.MESSAGE_TYPES.runtimeUpdated && message.payload && message.payload.state) {
      await storage.saveRuntimeState(message.payload.state);
      return {
        saved: true
      };
    }

    if (message.type === state.MESSAGE_TYPES.notify) {
      const payload = message.payload || {};
      await utils.notificationsCreate(utils.createId("notification"), {
        type: "basic",
        iconUrl: utils.browserApi.runtime.getURL("assets/icons/icon-48.png"),
        title: payload.title || "ChatGPT Cleaner",
        message: payload.message || ""
      });
      return {
        shown: true
      };
    }

    return null;
  }

  utils.browserApi.runtime.onInstalled.addListener(() => {
    storage.initializeStorage().catch((error) => {
      console.error("[ChatGPTCleaner][background] install initialization failed", error);
    });
  });

  utils.browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
      .then((data) => sendResponse({ ok: true, data: data }))
      .catch((error) => sendResponse({ ok: false, error: utils.getErrorMessage(error) }));
    return true;
  });
})(globalThis);
