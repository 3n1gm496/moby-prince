import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const STORAGE_KEY = "moby-prince-history";
const DEBOUNCE_MS = 300;

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("Chat history load failed:", err);
  }
  return { conversations: [], activeConversationId: null };
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => x.toString(16).padStart(2, "0")).join("");
}

function makeTitle(text) {
  const t = text.trim();
  return t.length <= 42 ? t : t.slice(0, 42) + "…";
}

function groupByDate(conversations) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);

  const groups = { today: [], yesterday: [], thisWeek: [], older: [] };

  // Pinned conversations are excluded from date groups — shown separately
  [...conversations]
    .filter((c) => !c.pinned)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .forEach((conv) => {
      const d = new Date(conv.updatedAt);
      if (d >= startOfToday) groups.today.push(conv);
      else if (d >= startOfYesterday) groups.yesterday.push(conv);
      else if (d >= startOfWeek) groups.thisWeek.push(conv);
      else groups.older.push(conv);
    });

  return groups;
}

// Persist to localStorage, evicting oldest non-pinned conversations on quota
// errors rather than silently dropping the write.
function _saveWithEviction(state) {
  let current = state;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      return;
    } catch (err) {
      if (err.name !== "QuotaExceededError" && err.name !== "NS_ERROR_DOM_QUOTA_REACHED") {
        console.warn("Chat history save failed:", err);
        return;
      }
      // Evict the oldest non-pinned conversation and retry
      const unpinned = current.conversations
        .filter((c) => !c.pinned)
        .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
      if (unpinned.length === 0) {
        console.warn("Chat history: localStorage full, cannot evict pinned conversations");
        return;
      }
      const removeId = unpinned[0].id;
      current = {
        ...current,
        conversations: current.conversations.filter((c) => c.id !== removeId),
      };
    }
  }
}

export function useChatHistory() {
  const [state, setState] = useState(loadFromStorage);
  const debounceRef = useRef(null);

  // Debounced persistence with quota-aware eviction
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => _saveWithEviction(state), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [state]);

  // Multi-tab sync: when another tab writes to localStorage, reload state here
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        setState(JSON.parse(e.newValue));
      } catch {
        // ignore parse errors from other tabs
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const activeConversation = useMemo(
    () => state.conversations.find((c) => c.id === state.activeConversationId) || null,
    [state.conversations, state.activeConversationId]
  );

  const groupedConversations = useMemo(
    () => groupByDate(state.conversations),
    [state.conversations]
  );

  const pinnedConversations = useMemo(
    () =>
      state.conversations
        .filter((c) => c.pinned)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [state.conversations]
  );

  const createConversation = useCallback(() => {
    // If an empty (unstarted) conversation already exists, select it instead of creating a duplicate
    const emptyConv = state.conversations.find((c) => c.messages.length === 0);
    if (emptyConv) {
      setState((prev) => ({ ...prev, activeConversationId: emptyConv.id }));
      return emptyConv.id;
    }

    const id = makeId();
    const now = new Date().toISOString();
    setState((prev) => ({
      conversations: [
        {
          id,
          title: "Nuova chat",
          messages: [],
          sessionId: null,
          sessionUpdatedAt: null,
          pinned: false,
          createdAt: now,
          updatedAt: now,
        },
        ...prev.conversations,
      ],
      activeConversationId: id,
    }));
    return id;
  }, [state.conversations]);

  const selectConversation = useCallback((id) => {
    setState((prev) => ({ ...prev, activeConversationId: id }));
  }, []);

  const deleteConversation = useCallback((id) => {
    setState((prev) => {
      const remaining = prev.conversations.filter((c) => c.id !== id);
      let nextActive = prev.activeConversationId;
      if (nextActive === id) {
        const sorted = [...remaining].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        nextActive = sorted.length > 0 ? sorted[0].id : null;
      }
      return { conversations: remaining, activeConversationId: nextActive };
    });
  }, []);

  const restoreConversation = useCallback((conv) => {
    setState((prev) => {
      if (prev.conversations.find((c) => c.id === conv.id)) return prev;
      const restored = [...prev.conversations, conv].sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      );
      return { conversations: restored, activeConversationId: conv.id };
    });
  }, []);

  const renameConversation = useCallback((id, title) => {
    const t = title.trim();
    if (!t) return;
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === id ? { ...c, title: t.length <= 60 ? t : t.slice(0, 60) + "…" } : c
      ),
    }));
  }, []);

  const togglePin = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c
      ),
    }));
  }, []);

  const appendMessage = useCallback((message, targetId) => {
    setState((prev) => {
      const id = targetId ?? prev.activeConversationId;
      const now = new Date().toISOString();
      return {
        ...prev,
        conversations: prev.conversations.map((c) => {
          if (c.id !== id) return c;
          const isFirstUser =
            message.role === "user" &&
            c.messages.filter((m) => m.role === "user").length === 0;
          return {
            ...c,
            messages: [...c.messages, message],
            title: isFirstUser ? makeTitle(message.text) : c.title,
            updatedAt: now,
          };
        }),
      };
    });
  }, []);

  const updateSessionId = useCallback((sessionId, targetId) => {
    const now = new Date().toISOString();
    setState((prev) => {
      const id = targetId ?? prev.activeConversationId;
      return {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === id ? { ...c, sessionId, sessionUpdatedAt: now } : c
        ),
      };
    });
  }, []);

  const ensureActiveConversation = useCallback(() => {
    if (!state.activeConversationId) {
      return createConversation();
    }
    return state.activeConversationId;
  }, [state.activeConversationId, createConversation]);

  return {
    conversations: state.conversations,
    activeConversation,
    activeConversationId: state.activeConversationId,
    groupedConversations,
    pinnedConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    restoreConversation,
    renameConversation,
    togglePin,
    appendMessage,
    updateSessionId,
    ensureActiveConversation,
  };
}
