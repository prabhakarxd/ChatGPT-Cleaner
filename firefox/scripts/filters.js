(function initFilters(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.filters) {
    return;
  }

  const utils = root.utils;
  const state = root.state;

  function normalizeFilters(filters) {
    return root.storage.sanitizeFilters(filters || state.DEFAULT_FILTERS);
  }

  function compareBySort(left, right, sortMode) {
    if (sortMode === "title") {
      return left.title.localeCompare(right.title);
    }

    const leftTime = Date.parse(left.updatedAt || left.createdAt || 0);
    const rightTime = Date.parse(right.updatedAt || right.createdAt || 0);

    if (sortMode === "oldest") {
      return leftTime - rightTime;
    }

    return rightTime - leftTime;
  }

  function matchesArchiveMode(chat, archiveMode) {
    if (archiveMode === "active") {
      return chat.archivedStatus !== "archived";
    }

    if (archiveMode === "archived") {
      return chat.archivedStatus === "archived";
    }

    return true;
  }

  function matchesKeyword(chat, keyword) {
    if (!keyword) {
      return true;
    }

    const haystack = [chat.title, chat.rowText, chat.id].map(utils.normalizeTitle).join(" ");
    return haystack.includes(utils.normalizeTitle(keyword));
  }

  function applyConversationFilters(conversations, filters, selectedIds) {
    const normalizedFilters = normalizeFilters(filters);
    const selectedIdSet = new Set(selectedIds || []);

    return (conversations || [])
      .filter((chat) => matchesArchiveMode(chat, normalizedFilters.archiveMode))
      .filter((chat) => matchesKeyword(chat, normalizedFilters.keyword))
      .filter((chat) => !normalizedFilters.emptyOnly || chat.isEmpty)
      .filter((chat) => !normalizedFilters.selectedOnly || selectedIdSet.has(chat.id))
      .sort((left, right) => compareBySort(left, right, normalizedFilters.sort));
  }

  root.filters = {
    normalizeFilters,
    applyConversationFilters
  };
})(globalThis);
