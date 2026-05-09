(function initExport(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.exporter) {
    return;
  }

  const utils = root.utils;
  const state = root.state;

  function buildBackupPayload(options) {
    const scope = options.scope || "manual";
    const chats = Array.isArray(options.chats) ? options.chats : [];

    return {
      exportedAt: utils.nowIso(),
      scope,
      host: global.location.host,
      pageUrl: global.location.href,
      totalChats: chats.length,
      settings: options.settings || null,
      filters: options.filters || null,
      metadata: options.metadata || {},
      chats: chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        url: chat.url,
        updatedAt: chat.updatedAt,
        createdAt: chat.createdAt,
        archivedStatus: chat.archivedStatus,
        isEmpty: chat.isEmpty,
        source: chat.source,
        rowText: chat.rowText,
        dateLabel: chat.dateLabel,
        modelHint: chat.modelHint
      }))
    };
  }

  async function downloadBackup(fileName, payload, scope) {
    await utils.runtimeSendMessage({
      type: state.MESSAGE_TYPES.downloadJson,
      payload: {
        fileName,
        data: payload,
        scope: scope || "manual"
      }
    });
  }

  root.exporter = {
    buildBackupPayload,
    downloadBackup
  };
})(globalThis);
