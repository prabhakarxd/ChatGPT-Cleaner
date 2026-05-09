(function initDeletion(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.deletion) {
    return;
  }

  const utils = root.utils;
  const state = root.state;
  const selectors = root.selectors;
  const api = root.api;
  const queueModule = root.queue;

  function createDeletionController(options) {
    const log = options.logger;
    let activeQueue = null;
    let activeOperation = state.createOperationState();

    function updateProgress(results, total) {
      activeOperation.progress = state.calculateProgress(results, total);
      activeOperation.failedChatIds = results
        .filter((item) => item.status === "failed" && item.chatId)
        .map((item) => item.chatId);
      activeOperation.updatedAt = utils.nowIso();
    }

    async function deleteViaUi(chat) {
      await options.ensureConversationVisible(chat);
      const row = selectors.findRowByConversationId(chat.id);

      if (!row) {
        throw new Error("Conversation row not found for UI fallback");
      }

      const menuButton = selectors.findMenuButton(row);

      if (!menuButton) {
        throw new Error("Conversation menu button not found");
      }

      menuButton.click();

      const deleteItem = await utils.waitFor(() => selectors.findDeleteMenuItem(), {
        timeoutMs: 4000,
        intervalMs: 100
      });

      deleteItem.click();

      const confirmDeleteButton = await utils.waitFor(() => selectors.findConfirmDeleteButton(), {
        timeoutMs: 4000,
        intervalMs: 100
      });

      confirmDeleteButton.click();

      await utils.sleep(600);

      return {
        status: "success",
        chatId: chat.id,
        title: chat.title,
        via: "ui",
        completedAt: utils.nowIso()
      };
    }

    async function deleteSingleConversation(chat, attempt) {
      if (activeOperation.dryRun) {
        return {
          status: "skipped",
          chatId: chat.id,
          title: chat.title,
          via: "dry-run",
          completedAt: utils.nowIso()
        };
      }

      try {
        await api.deleteConversation(chat.id);
        return {
          status: "success",
          chatId: chat.id,
          title: chat.title,
          via: "api",
          completedAt: utils.nowIso()
        };
      } catch (apiError) {
        await log.warn("API delete failed, falling back to UI", {
          chatId: chat.id,
          attempt,
          error: utils.getErrorMessage(apiError)
        });

        return deleteViaUi(chat);
      }
    }

    async function finalizeOperation(finalState, metadata) {
      activeOperation.state = finalState;
      activeOperation.updatedAt = utils.nowIso();
      updateProgress(activeOperation.results, activeOperation.progress.total);
      await options.onOperationUpdate(activeOperation);
      await options.onOperationFinished(activeOperation, metadata || {});
      activeQueue = null;
    }

    async function start(chats, settings, metadata) {
      if (activeQueue) {
        throw new Error("A deletion operation is already running");
      }

      activeOperation = state.createOperationState();
      activeOperation.id = utils.createId("operation");
      activeOperation.kind = "delete";
      activeOperation.state = "running";
      activeOperation.startedAt = utils.nowIso();
      activeOperation.updatedAt = utils.nowIso();
      activeOperation.dryRun = Boolean(settings.operation.dryRun);
      activeOperation.exportFileName = metadata && metadata.exportFileName ? metadata.exportFileName : "";
      activeOperation.progress.total = chats.length;

      await options.onOperationUpdate(activeOperation);

      activeQueue = new queueModule.AsyncTaskQueue({
        items: chats,
        batchSize: settings.operation.batchSize,
        delayMs: settings.operation.delayMs,
        batchCooldownMs: settings.operation.batchCooldownMs,
        retries: settings.operation.retries,
        retryBaseDelayMs: settings.operation.retryBaseDelayMs,
        handler: async (chat, attempt) => {
          activeOperation.currentChatId = chat.id;
          activeOperation.lastMessage = "Deleting " + chat.title;
          activeOperation.updatedAt = utils.nowIso();
          await options.onOperationUpdate(activeOperation);
          return deleteSingleConversation(chat, attempt);
        },
        onStateChange: async ({ state: queueState }) => {
          if (queueState === "paused") {
            activeOperation.state = "paused";
          } else if (queueState === "running") {
            activeOperation.state = "running";
          } else if (queueState === "cancelling") {
            activeOperation.state = "cancelling";
          } else if (queueState === "cancelled") {
            activeOperation.state = "cancelled";
          }

          activeOperation.updatedAt = utils.nowIso();
          await options.onOperationUpdate(activeOperation);
        },
        onItemComplete: async (result, chat) => {
          const normalizedResult = Object.assign(
            {
              chatId: chat.id,
              title: chat.title,
              status: "failed",
              via: "",
              attempts: 1,
              error: "",
              completedAt: utils.nowIso()
            },
            result
          );
          activeOperation.results.push(normalizedResult);
          updateProgress(activeOperation.results, chats.length);

          if (normalizedResult.status === "success") {
            await options.onConversationDeleted(chat.id);
          }

          await options.onOperationUpdate(activeOperation);
        },
        onFinish: async ({ state: finalQueueState }) => {
          const finalState = finalQueueState === "cancelled"
            ? "cancelled"
            : activeOperation.failedChatIds.length
              ? "failed"
              : "completed";
          await finalizeOperation(finalState, metadata);
        }
      });

      activeQueue.start().catch(async (error) => {
        await log.error("Deletion queue crashed", {
          error: utils.getErrorMessage(error)
        });
        activeOperation.state = "failed";
        activeOperation.lastMessage = utils.getErrorMessage(error);
        activeOperation.updatedAt = utils.nowIso();
        await options.onOperationUpdate(activeOperation);
        await finalizeOperation("failed", metadata);
      });

      return activeOperation;
    }

    async function pause() {
      if (activeQueue) {
        activeQueue.pause();
      }
    }

    async function resume() {
      if (activeQueue) {
        activeQueue.resume();
      }
    }

    async function stop() {
      if (activeQueue) {
        activeQueue.stop();
      }
    }

    function getOperation() {
      return activeOperation;
    }

    return {
      start,
      pause,
      resume,
      stop,
      getOperation
    };
  }

  root.deletion = {
    createDeletionController
  };
})(globalThis);
