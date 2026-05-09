(function initLogger(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.logger) {
    return;
  }

  const utils = root.utils;
  const storage = root.storage;
  const state = root.state;

  const levelRank = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
  };

  async function shouldPersist(level) {
    try {
      const settings = await storage.getSettings();
      return levelRank[level] >= levelRank[settings.ui.logLevel];
    } catch (error) {
      return true;
    }
  }

  function serializeMetadata(metadata) {
    if (metadata === undefined) {
      return "";
    }

    if (typeof metadata === "string") {
      return metadata;
    }

    try {
      return JSON.stringify(metadata);
    } catch (error) {
      return "[unserializable metadata]";
    }
  }

  function createLogger(context) {
    async function write(level, message, metadata) {
      const serializedMetadata = serializeMetadata(metadata);
      const entry = {
        id: utils.createId("log"),
        level,
        context,
        message,
        metadata: serializedMetadata,
        createdAt: utils.nowIso()
      };

      const consoleMethod =
        level === "error"
          ? console.error
          : level === "warn"
            ? console.warn
            : level === "info"
              ? console.info
              : console.debug;

      consoleMethod(
        "[ChatGPTCleaner][" +
          context +
          "] " +
          message +
          (serializedMetadata ? " " + serializedMetadata : "")
      );

      if (await shouldPersist(level)) {
        await storage.appendLog(entry);
      }

      await utils.safeRuntimeSendMessage({
        type: state.MESSAGE_TYPES.logAdded,
        payload: entry
      });
    }

    return {
      debug(message, metadata) {
        return write("debug", message, metadata);
      },
      info(message, metadata) {
        return write("info", message, metadata);
      },
      warn(message, metadata) {
        return write("warn", message, metadata);
      },
      error(message, metadata) {
        return write("error", message, metadata);
      }
    };
  }

  root.logger = {
    createLogger
  };
})(globalThis);
