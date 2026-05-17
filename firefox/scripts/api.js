(function initApi(global) {
  "use strict";

  const root = global.ChatGPTCleaner = global.ChatGPTCleaner || {};

  if (root.api) {
    return;
  }

  const utils = root.utils;
  const state = root.state;

  const sessionCache = {
    token: "",
    updatedAt: 0
  };

  function getOrigin() {
    return global.location.origin;
  }

  async function getAccessToken(forceRefresh) {
    if (!forceRefresh && sessionCache.token && Date.now() - sessionCache.updatedAt < 60 * 1000) {
      return sessionCache.token;
    }

    try {
      const response = await global.fetch(new URL("/api/auth/session", getOrigin()).toString(), {
        credentials: "include",
        cache: "no-store"
      });

      if (!response.ok) {
        return "";
      }

      const data = await response.json();
      sessionCache.token = data && data.accessToken ? data.accessToken : "";
      sessionCache.updatedAt = Date.now();
      return sessionCache.token;
    } catch (error) {
      return "";
    }
  }

  async function createHeaders(extraHeaders) {
    const headers = Object.assign(
      {
        Accept: "application/json"
      },
      extraHeaders || {}
    );
    const token = await getAccessToken(false);

    if (token) {
      headers.Authorization = "Bearer " + token;
    }

    return headers;
  }

  async function readResponseError(response) {
    const text = await response.text();
    const body = utils.safeJsonParse(text, null);
    const detail = body && (body.detail || body.message || body.error);
    return new Error(detail || ("API request failed with status " + response.status));
  }

  async function apiFetch(path, options, maxRetries = 4, baseDelayMs = 2500) {
    const requestOptions = Object.assign(
      {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      },
      options || {}
    );

    requestOptions.headers = await createHeaders(requestOptions.headers);
    const url = new URL(path, getOrigin()).toString();

    const response = await utils.browserApi.runtime.sendMessage({
      type: state.MESSAGE_TYPES.apiFetch,
      payload: {
        url,
        options: requestOptions,
        maxRetries,
        baseDelayMs
      }
    });

    if (!response || !response.ok) {
      throw new Error((response && response.error) || "API request failed in background");
    }

    return response.data;
  }

  function normalizeConversationItem(item, archivedOverride) {
    const id = item && item.id ? String(item.id) : "";

    if (!id) {
      return null;
    }

    const title = utils.normalizeWhitespace(item.title || item.name || "Untitled chat") || "Untitled chat";
    const archivedStatus =
      archivedOverride === true || item.is_archived === true
        ? "archived"
        : archivedOverride === false || item.is_archived === false
          ? "active"
          : "unknown";

    return {
      id,
      title,
      normalizedTitle: utils.normalizeTitle(title),
      url: utils.conversationUrlFromId(id, getOrigin()),
      updatedAt: item.update_time || item.updated_at || item.updatedAt || "",
      createdAt: item.create_time || item.created_at || item.createdAt || "",
      archivedStatus,
      isEmpty: /^untitled chat|^new chat$/i.test(title),
      source: "api",
      rowText: title,
      dateLabel: "",
      modelHint: item.model_slug || item.model || "",
      lastSeenAt: utils.nowIso()
    };
  }

  async function listConversations(options) {
    const offset = options && typeof options.offset === "number" ? options.offset : 0;
    const limit = options && typeof options.limit === "number" ? options.limit : 100;
    const isArchived = options && typeof options.isArchived === "boolean" ? options.isArchived : undefined;
    const query = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
      order: "updated"
    });

    if (typeof isArchived === "boolean") {
      query.set("is_archived", String(isArchived));
    }

    const payload = await apiFetch("/backend-api/conversations?" + query.toString());
    const items = Array.isArray(payload && payload.items) ? payload.items : [];

    return {
      items,
      total: typeof payload.total === "number" ? payload.total : null
    };
  }

  async function fetchAllConversationMetadata(options) {
    const limit = options && typeof options.limit === "number" ? options.limit : 100;
    const isArchived = options && typeof options.isArchived === "boolean" ? options.isArchived : undefined;
    const records = [];
    const seen = new Set();
    let offset = 0;
    let pageCount = 0;

    while (pageCount < 200) {
      const page = await listConversations({
        offset,
        limit,
        isArchived
      });

      if (!page.items.length) {
        break;
      }

      page.items.forEach((item) => {
        const normalized = normalizeConversationItem(item, isArchived);

        if (!normalized || seen.has(normalized.id)) {
          return;
        }

        seen.add(normalized.id);
        records.push(normalized);
      });

      if (page.items.length < limit) {
        break;
      }

      offset += page.items.length;
      pageCount += 1;

      if (pageCount < 200) {
        await utils.sleep(800);
      }
    }

    return records;
  }

  async function deleteConversation(conversationId) {
    return apiFetch("/backend-api/conversation/" + encodeURIComponent(conversationId), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        is_visible: false
      })
    });
  }

  async function archiveConversation(conversationId) {
    return apiFetch("/backend-api/conversation/" + encodeURIComponent(conversationId), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        is_archived: true
      })
    });
  }

  async function getConversationDetail(conversationId) {
    return apiFetch("/backend-api/conversation/" + encodeURIComponent(conversationId), {
      method: "GET"
    });
  }

  async function probeApi() {
    try {
      await listConversations({
        offset: 0,
        limit: 1
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  root.api = {
    getAccessToken,
    apiFetch,
    listConversations,
    fetchAllConversationMetadata,
    deleteConversation,
    archiveConversation,
    getConversationDetail,
    probeApi
  };
})(globalThis);
