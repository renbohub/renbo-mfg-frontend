(function () {
  "use strict";

  const root = document.getElementById("erp-ai-assistant");
  const model = window.ERP_AI_ASSISTANT_MODEL;
  if (!root || !model) return;
  if (window.__ERP_AI_ASSISTANT_INITIALIZED__) return;
  window.__ERP_AI_ASSISTANT_INITIALIZED__ = true;

  const nodes = {
    runtime: root.querySelector("[data-ai-runtime-state]"),
    contextLabel: root.querySelector("[data-ai-context-label]"),
    conversationList: root.querySelector("[data-ai-conversation-list]"),
    conversationCount: root.querySelector("[data-ai-conversation-count]"),
    messages: root.querySelector("[data-ai-messages]"),
    queue: root.querySelector("[data-ai-queue]"),
    queueText: root.querySelector("[data-ai-queue-text]"),
    promptContext: root.querySelector("[data-ai-prompt-context]"),
    prompt: root.querySelector("[data-ai-prompt]"),
    send: root.querySelector("[data-ai-send]"),
    cancel: root.querySelector("[data-ai-cancel-request]"),
    newConversation: root.querySelector("[data-ai-new-conversation]"),
    notice: root.querySelector("[data-ai-notice]"),
  };
  const state = {
    conversationId: null,
    requestId: null,
    conversations: [],
    context: {},
    contextualCapability: null,
    openedBy: null,
    permissionIdentity: null,
    conversationPromise: null,
    submitting: false,
  };

  function token() {
    return localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  }

  function authHeaders(json = false) {
    return {
      Authorization: `Bearer ${token()}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`/ai/api${path}`, {
      ...options,
      headers: { ...authHeaders(Boolean(options.body)), ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.message || "AI Assistant gagal diakses."), { status: response.status, code: payload.code });
    return payload;
  }

  function currentContext(extra = {}) {
    const page = window.ERP_PAGE_CONTEXT || {};
    return {
      moduleCode: extra.moduleCode || page.module || "system",
      pageCode: extra.pageCode || page.page || location.pathname,
      recordKey: extra.recordKey || page.record || null,
      period: extra.period || new URLSearchParams(location.search).get("month") || null,
      filters: extra.filters || {},
      selectedIds: Array.isArray(extra.selectedIds) ? extra.selectedIds : [],
    };
  }

  function contextText(context) {
    return [context.moduleCode, context.pageCode, context.recordKey, context.period].filter(Boolean).join(" · ");
  }

  function setRuntime(status = {}) {
    const value = String(status.state || "OFFLINE").toUpperCase();
    nodes.runtime.textContent = value.replace("LOADING_MODEL", "LOADING");
    nodes.runtime.dataset.state = value;
  }

  function showNotice(message, tone = "info") {
    nodes.notice.textContent = "";
    const strong = document.createElement("strong");
    strong.textContent = tone === "error" ? "Request gagal" : tone === "warning" ? "Perlu perhatian" : "Read & draft only";
    const span = document.createElement("span");
    span.textContent = message;
    nodes.notice.append(strong, span);
    nodes.notice.dataset.tone = tone;
  }

  function sourceLinks(sources = []) {
    if (!Array.isArray(sources) || !sources.length) return null;
    const wrapper = document.createElement("div");
    wrapper.className = "ai-message__sources";
    sources.slice(0, 20).forEach((source) => {
      const anchor = document.createElement("a");
      const href = model.safeSourceHref(source.href);
      anchor.href = href;
      if (href === "#") anchor.addEventListener("click", (event) => event.preventDefault());
      anchor.textContent = model.renderSourceLabel(source);
      wrapper.appendChild(anchor);
    });
    return wrapper;
  }

  function draftReviewHref(draft) {
    const id = encodeURIComponent(draft.id);
    if (draft.moduleCode === "purchasing") return `/modules/purchasing/purchase-suggestions?aiDraftId=${id}`;
    if (draft.moduleCode === "production") return `/modules/planning-ppic/daily-production-plans?aiDraftId=${id}`;
    if (draft.pageCode === "capacity-planning") return `/modules/planning-ppic/capacity-planning?aiDraftId=${id}`;
    return `#ai-draft-${id}`;
  }

  function draftCard(draft) {
    const card = document.createElement("div");
    card.className = "ai-draft-card";
    const title = document.createElement("strong");
    title.textContent = `AI GENERATED · ${String(draft.status || "WAITING_CONFIRMATION").replaceAll("_", " ")}`;
    const summary = document.createElement("span");
    summary.textContent = draft.draftType || "Draft perubahan";
    const link = document.createElement("a");
    link.href = draftReviewHref(draft);
    link.textContent = "Review Draft";
    card.append(title, summary, link);
    return card;
  }

  function messageArticle(message, drafts = []) {
    const article = document.createElement("article");
    const role = String(message.role || "assistant").toLowerCase();
    article.className = `ai-message ai-message--${role === "user" ? "user" : "assistant"}`;
    const badge = document.createElement("span");
    badge.className = "ai-message__role";
    badge.textContent = role === "user" ? "YOU" : "AI";
    const body = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = message.content || "";
    body.appendChild(text);
    const links = sourceLinks(message.citations || message.sources);
    if (links) body.appendChild(links);
    drafts.forEach((draft) => body.appendChild(draftCard(draft)));
    article.append(badge, body);
    return article;
  }

  function renderMessages(conversation) {
    nodes.messages.textContent = "";
    const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
    const drafts = Array.isArray(conversation?.drafts) ? conversation.drafts : [];
    if (!messages.length) {
      nodes.messages.appendChild(messageArticle({ role: "assistant", content: "Tanyakan data halaman ini atau minta saya menyiapkan draft untuk direview." }));
    } else {
      messages.forEach((message, index) => {
        const linkedDrafts = index === messages.length - 1 && message.role === "assistant" ? drafts.filter((draft) => draft.status === "WAITING_CONFIRMATION") : [];
        nodes.messages.appendChild(messageArticle(message, linkedDrafts));
      });
    }
    nodes.messages.scrollTop = nodes.messages.scrollHeight;
  }

  function renderConversations() {
    nodes.conversationList.textContent = "";
    nodes.conversationCount.textContent = String(state.conversations.length);
    if (!state.conversations.length) {
      const empty = document.createElement("p");
      empty.className = "ai-assistant__empty";
      empty.textContent = "Belum ada percakapan.";
      nodes.conversationList.appendChild(empty);
      return;
    }
    state.conversations.forEach((conversation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ai-assistant__conversation ${conversation.id === state.conversationId ? "is-active" : ""}`;
      const title = document.createElement("strong");
      title.textContent = conversation.title || conversation.pageCode || "Conversation";
      const meta = document.createElement("span");
      meta.textContent = [conversation.moduleCode, conversation.recordKey].filter(Boolean).join(" · ") || "ERP";
      button.append(title, meta);
      button.addEventListener("click", () => selectConversation(conversation.id));
      nodes.conversationList.appendChild(button);
    });
  }

  async function refreshStatus() {
    try { setRuntime(await requestJson("/status")); }
    catch (error) { setRuntime({ state: "OFFLINE" }); showNotice(error.message, "warning"); }
  }

  async function loadConversations() {
    try {
      const payload = await requestJson("/conversations");
      state.conversations = payload.items || [];
      const selected = state.conversations.find((conversation) => conversation.id === state.conversationId)
        || state.conversations.find((conversation) => conversation.title === contextText(state.context));
      if (selected) await selectConversation(selected.id);
      else renderConversations();
    } catch (error) {
      showNotice(error.message, "error");
    }
  }

  async function selectConversation(id) {
    state.conversationId = id;
    renderConversations();
    try { renderMessages(await requestJson(`/conversations/${encodeURIComponent(id)}`)); }
    catch (error) { showNotice(error.message, "error"); }
  }

  async function ensureConversation() {
    if (state.conversationId) return state.conversationId;
    if (state.conversationPromise) return state.conversationPromise;
    state.conversationPromise = (async () => {
      const conversation = await requestJson("/conversations", {
        method: "POST",
        body: JSON.stringify({ pageContext: state.context, title: contextText(state.context) }),
      });
      state.conversationId = conversation.id;
      if (!state.conversations.some((row) => row.id === conversation.id)) state.conversations.unshift(conversation);
      renderConversations();
      return conversation.id;
    })();
    try { return await state.conversationPromise; }
    finally { state.conversationPromise = null; }
  }

  function setQueue(row) {
    const normalized = model.normalizeRequestState(row);
    nodes.queue.classList.toggle("d-none", !normalized.busy);
    nodes.send.disabled = normalized.busy;
    if (normalized.busy) {
      nodes.queueText.textContent = normalized.status === "QUEUED"
        ? `Antrean lokal${row.position ? ` · posisi ${row.position}` : ""}`
        : "Qwen sedang membaca context terotorisasi...";
    }
  }

  async function pollRequest(requestId) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const row = await requestJson(`/requests/${encodeURIComponent(requestId)}`);
      setQueue(row);
      const normalized = model.normalizeRequestState(row);
      if (normalized.terminal) {
        state.requestId = null;
        setQueue({ status: row.status });
        if (row.status === "COMPLETED") await selectConversation(state.conversationId);
        else showNotice(row.errorMessage || `Request ${row.status.toLowerCase()}.`, "error");
        return row;
      }
      await new Promise((resolve) => setTimeout(resolve, model.nextPollDelay(attempt)));
    }
    throw new Error("Polling AI melewati batas waktu UI.");
  }

  async function send() {
    const content = nodes.prompt.value.trim();
    if (!content || state.requestId || state.submitting) return;
    state.submitting = true;
    nodes.send.disabled = true;
    try {
      const conversationId = await ensureConversation();
      nodes.messages.appendChild(messageArticle({ role: "user", content }));
      nodes.messages.scrollTop = nodes.messages.scrollHeight;
      nodes.prompt.value = "";
      const queued = await requestJson(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, pageContext: state.context, capabilityCode: state.contextualCapability }),
      });
      state.requestId = queued.requestId;
      state.submitting = false;
      setQueue(queued);
      await pollRequest(queued.requestId);
    } catch (error) {
      state.submitting = false;
      state.requestId = null;
      setQueue({ status: "FAILED" });
      showNotice(error.message, "error");
    }
  }

  function open(options = {}) {
    state.context = currentContext(options.context || {});
    state.contextualCapability = options.capabilityCode || null;
    nodes.contextLabel.textContent = contextText(state.context);
    nodes.promptContext.classList.toggle("d-none", !state.contextualCapability);
    nodes.promptContext.textContent = state.contextualCapability ? `Capability: ${state.contextualCapability}` : "";
    if (options.prompt) nodes.prompt.value = options.prompt;
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("ai-assistant-open");
    state.openedBy = document.activeElement;
    void Promise.all([refreshStatus(), loadConversations()]).finally(() => nodes.prompt.focus());
  }

  function close() {
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ai-assistant-open");
    state.openedBy?.focus?.();
  }

  function newConversation() {
    state.conversationId = null;
    state.contextualCapability = null;
    nodes.promptContext.classList.add("d-none");
    renderConversations();
    renderMessages(null);
    nodes.prompt.focus();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-ai-assistant-open]")) open();
    if (event.target.closest("[data-ai-assistant-close]")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("is-open")) close();
  });
  nodes.send.addEventListener("click", send);
  nodes.prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  });
  nodes.newConversation.addEventListener("click", newConversation);
  nodes.cancel.addEventListener("click", async () => {
    if (!state.requestId) return;
    try { await requestJson(`/requests/${encodeURIComponent(state.requestId)}`, { method: "DELETE" }); }
    catch (error) { showNotice(error.message, "error"); }
  });
  window.addEventListener("erp:permissions-ready", (event) => {
    const identity = `${event.detail?.id || ""}:${(event.detail?.roles || []).map((role) => role.id || role.roleCode).join(",")}`;
    if (state.permissionIdentity && state.permissionIdentity !== identity) newConversation();
    state.permissionIdentity = identity;
  });

  window.ERP_AI_ASSISTANT = { open, close, refreshContext: () => { state.context = currentContext(); nodes.contextLabel.textContent = contextText(state.context); } };
})();
