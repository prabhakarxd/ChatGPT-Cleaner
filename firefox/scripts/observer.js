(function initObserver(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.observer) {
    return;
  }

  const utils = root.utils;

  function createMutationObserver(options) {
    const target = options.target;
    const callback = options.callback;
    const debounceMs = options.debounceMs || 500;
    const config = Object.assign(
      {
        childList: true,
        subtree: true,
        attributes: true
      },
      options.config || {}
    );
    const debounced = utils.debounce(() => callback(), debounceMs);
    const observer = new MutationObserver((mutations) => {
      if (!mutations || !mutations.length) {
        return;
      }

      debounced();
    });

    return {
      start() {
        if (target && target.isConnected) {
          observer.observe(target, config);
        }
      },
      stop() {
        debounced.cancel();
        observer.disconnect();
      }
    };
  }

  root.observer = {
    createMutationObserver
  };
})(globalThis);
