(function initUtils(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.utils) {
    return;
  }

  const hasBrowserPromises = typeof global.browser !== "undefined";
  const browserApi = global.browser || global.chrome;

  function nowIso() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    const random = Math.random().toString(36).slice(2, 10);
    return [prefix || "id", Date.now().toString(36), random].join("_");
  }

  function sleep(ms) {
    return new Promise((resolve) => global.setTimeout(resolve, ms));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function deepClone(value) {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value));
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeTitle(value) {
    return normalizeWhitespace(value).toLowerCase();
  }

  function sanitizeFilename(value, fallback) {
    const normalized = normalizeWhitespace(value)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\.+$/g, "")
      .slice(0, 120);

    return normalized || fallback || "chatgpt-cleaner";
  }

  function toError(error, fallbackMessage) {
    if (error instanceof Error) {
      return error;
    }

     if (error && typeof error === "object") {
      if (typeof error.message === "string" && error.message) {
        return new Error(error.message);
      }

      if (typeof error.error === "string" && error.error) {
        return new Error(error.error);
      }

      try {
        const serialized = JSON.stringify(error);

        if (serialized && serialized !== "{}") {
          return new Error(serialized);
        }
      } catch (serializationError) {
        // Fall through to the generic fallback below.
      }
    }

    return new Error(typeof error === "string" ? error : fallbackMessage || "Unknown error");
  }

  function getErrorMessage(error, fallbackMessage) {
    return toError(error, fallbackMessage).message;
  }

  function safeJsonParse(text, fallbackValue) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return fallbackValue;
    }
  }

  function debounce(fn, wait) {
    let timer = null;

    function debounced() {
      const context = this;
      const args = arguments;

      if (timer) {
        global.clearTimeout(timer);
      }

      timer = global.setTimeout(() => {
        timer = null;
        fn.apply(context, args);
      }, wait || 250);
    }

    debounced.cancel = function cancel() {
      if (timer) {
        global.clearTimeout(timer);
        timer = null;
      }
    };

    debounced.flush = function flush() {
      if (!timer) {
        return;
      }

      global.clearTimeout(timer);
      timer = null;
      fn();
    };

    return debounced;
  }

  function chunkArray(items, size) {
    const chunks = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
  }

  function uniqueBy(items, getKey) {
    const seen = new Set();
    const output = [];

    items.forEach((item) => {
      const key = getKey(item);

      if (!key || seen.has(key)) {
        return;
      }

      seen.add(key);
      output.push(item);
    });

    return output;
  }

  function uniqueStrings(items) {
    return Array.from(new Set((items || []).filter(Boolean)));
  }

  function isSupportedChatHost(hostname) {
    return /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$|(^|\.)chat\.com$/i.test(hostname || "");
  }

  function isChatPage(url) {
    try {
      const parsed = new URL(url || global.location.href);
      return isSupportedChatHost(parsed.hostname);
    } catch (error) {
      return false;
    }
  }

  function conversationUrlFromId(id, origin) {
    if (!id) {
      return "";
    }

    return new URL("/c/" + encodeURIComponent(id), origin || global.location.origin).toString();
  }

  function extractConversationId(input) {
    if (!input) {
      return "";
    }

    const normalized = String(input);
    const match = normalized.match(/\/c\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function promiseFromCallback(callbackInvoker) {
    return new Promise((resolve, reject) => {
      try {
        callbackInvoker((result) => {
          const runtimeError = browserApi && browserApi.runtime && browserApi.runtime.lastError;

          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }

          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageGet(keys) {
    if (hasBrowserPromises) {
      return browserApi.storage.local.get(keys);
    }

    return promiseFromCallback((done) => browserApi.storage.local.get(keys, done));
  }

  function storageSet(value) {
    if (hasBrowserPromises) {
      return browserApi.storage.local.set(value);
    }

    return promiseFromCallback((done) => browserApi.storage.local.set(value, done));
  }

  function storageRemove(keys) {
    if (hasBrowserPromises) {
      return browserApi.storage.local.remove(keys);
    }

    return promiseFromCallback((done) => browserApi.storage.local.remove(keys, done));
  }

  function runtimeSendMessage(message) {
    if (hasBrowserPromises) {
      return browserApi.runtime.sendMessage(message);
    }

    return promiseFromCallback((done) => browserApi.runtime.sendMessage(message, done));
  }

  function safeRuntimeSendMessage(message) {
    return runtimeSendMessage(message).catch(() => null);
  }

  function tabsQuery(queryInfo) {
    if (hasBrowserPromises) {
      return browserApi.tabs.query(queryInfo);
    }

    return promiseFromCallback((done) => browserApi.tabs.query(queryInfo, done));
  }

  function tabsSendMessage(tabId, message) {
    if (hasBrowserPromises) {
      return browserApi.tabs.sendMessage(tabId, message);
    }

    return promiseFromCallback((done) => browserApi.tabs.sendMessage(tabId, message, done));
  }

  function downloadsDownload(options) {
    if (hasBrowserPromises) {
      return browserApi.downloads.download(options);
    }

    return promiseFromCallback((done) => browserApi.downloads.download(options, done));
  }

  function notificationsCreate(id, options) {
    if (!browserApi.notifications) {
      return Promise.resolve(null);
    }

    if (hasBrowserPromises) {
      return browserApi.notifications.create(id, options);
    }

    return promiseFromCallback((done) => browserApi.notifications.create(id, options, done));
  }

  function waitFor(condition, options) {
    const timeoutMs = options && options.timeoutMs ? options.timeoutMs : 5000;
    const intervalMs = options && options.intervalMs ? options.intervalMs : 100;

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      async function poll() {
        try {
          const value = await condition();

          if (value) {
            resolve(value);
            return;
          }

          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error("Timed out while waiting for condition"));
            return;
          }

          global.setTimeout(poll, intervalMs);
        } catch (error) {
          reject(error);
        }
      }

      poll();
    });
  }

  function createEmitter() {
    const listeners = new Set();

    return {
      on(listener) {
        listeners.add(listener);
        return function unsubscribe() {
          listeners.delete(listener);
        };
      },
      emit(payload) {
        listeners.forEach((listener) => {
          try {
            listener(payload);
          } catch (error) {
            console.error("[ChatGPTCleaner emitter] listener failure", error);
          }
        });
      }
    };
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function sortByTimestampDesc(items, fieldName) {
    return items.slice().sort((left, right) => {
      const leftValue = Date.parse(left && left[fieldName] ? left[fieldName] : 0);
      const rightValue = Date.parse(right && right[fieldName] ? right[fieldName] : 0);
      return rightValue - leftValue;
    });
  }

  function toDataUrl(jsonString) {
    return "data:application/json;charset=utf-8," + encodeURIComponent(jsonString);
  }

  root.utils = {
    browserApi,
    hasBrowserPromises,
    nowIso,
    createId,
    sleep,
    clamp,
    deepClone,
    normalizeWhitespace,
    normalizeTitle,
    sanitizeFilename,
    toError,
    getErrorMessage,
    safeJsonParse,
    debounce,
    chunkArray,
    uniqueBy,
    uniqueStrings,
    isSupportedChatHost,
    isChatPage,
    conversationUrlFromId,
    extractConversationId,
    storageGet,
    storageSet,
    storageRemove,
    runtimeSendMessage,
    safeRuntimeSendMessage,
    tabsQuery,
    tabsSendMessage,
    downloadsDownload,
    notificationsCreate,
    waitFor,
    createEmitter,
    formatNumber,
    sortByTimestampDesc,
    toDataUrl
  };
})(globalThis);
