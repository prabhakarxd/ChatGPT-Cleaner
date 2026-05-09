(function initQueue(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.queue) {
    return;
  }

  const utils = root.utils;

  class AsyncTaskQueue {
    constructor(options) {
      this.items = Array.isArray(options.items) ? options.items.slice() : [];
      this.handler = options.handler;
      this.batchSize = Math.max(1, options.batchSize || 1);
      this.delayMs = Math.max(0, options.delayMs || 0);
      this.batchCooldownMs = Math.max(0, options.batchCooldownMs || 0);
      this.retries = Math.max(0, options.retries || 0);
      this.retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs || 0);
      this.onStart = options.onStart || function noop() {};
      this.onProgress = options.onProgress || function noop() {};
      this.onItemComplete = options.onItemComplete || function noop() {};
      this.onFinish = options.onFinish || function noop() {};
      this.onStateChange = options.onStateChange || function noop() {};
      this.paused = false;
      this.cancelRequested = false;
      this.processed = 0;
      this.running = false;
      this.resumeResolver = null;
    }

    pause() {
      if (!this.running || this.paused) {
        return;
      }

      this.paused = true;
      this.onStateChange({ state: "paused" });
    }

    resume() {
      if (!this.paused) {
        return;
      }

      this.paused = false;
      this.onStateChange({ state: "running" });

      if (this.resumeResolver) {
        this.resumeResolver();
        this.resumeResolver = null;
      }
    }

    stop() {
      this.cancelRequested = true;
      this.resume();
      this.onStateChange({ state: "cancelling" });
    }

    async waitWhilePaused() {
      if (!this.paused) {
        return;
      }

      await new Promise((resolve) => {
        this.resumeResolver = resolve;
      });
    }

    async runItem(item) {
      let attempt = 0;

      while (attempt <= this.retries) {
        attempt += 1;

        try {
          const result = await this.handler(item, attempt);
          return Object.assign({}, result, { attempts: attempt });
        } catch (error) {
          if (attempt > this.retries) {
            throw Object.assign(utils.toError(error), { attempts: attempt });
          }

          // Back off a little between retries so one flaky request
          // does not turn into a fast loop of failures.
          const backoff = this.retryBaseDelayMs * Math.pow(2, attempt - 1);
          await utils.sleep(backoff);
        }
      }

      throw new Error("Queue handler exited unexpectedly");
    }

    async start() {
      if (this.running) {
        return;
      }

      this.running = true;
      this.onStart({ total: this.items.length });
      this.onStateChange({ state: "running" });

      const results = [];

      try {
        for (let index = 0; index < this.items.length; index += 1) {
          if (this.cancelRequested) {
            break;
          }

          await this.waitWhilePaused();

          if (this.cancelRequested) {
            break;
          }

          const item = this.items[index];

          try {
            const result = await this.runItem(item);
            results.push(result);
            this.onItemComplete(result, item);
          } catch (error) {
            const failedResult = {
              status: "failed",
              attempts: error.attempts || this.retries + 1,
              error: utils.getErrorMessage(error),
              completedAt: utils.nowIso()
            };
            results.push(failedResult);
            this.onItemComplete(failedResult, item);
          }

          this.processed += 1;
          this.onProgress({
            total: this.items.length,
            processed: this.processed,
            remaining: Math.max(this.items.length - this.processed, 0)
          });

          if (this.cancelRequested) {
            break;
          }

          const isBatchBoundary = this.processed % this.batchSize === 0;

          if (index < this.items.length - 1) {
            // Small spacing between items helps keep the extension polite,
            // while the bigger cooldown gives the page room after each batch.
            if (isBatchBoundary && this.batchCooldownMs > 0) {
              await utils.sleep(this.batchCooldownMs);
            } else if (this.delayMs > 0) {
              await utils.sleep(this.delayMs);
            }
          }
        }
      } finally {
        this.running = false;
        const finalState = this.cancelRequested ? "cancelled" : "completed";
        this.onStateChange({ state: finalState });
        this.onFinish({ results, state: finalState });
      }
    }
  }

  root.queue = {
    AsyncTaskQueue
  };
})(globalThis);
