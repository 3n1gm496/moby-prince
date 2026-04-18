import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "moby-prince-history";

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { conversations: [], activeConversationId: null };
}

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now();
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

  [...conversations]
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

export function useChatHistory() {
  const [state, setState] = useState(loadFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const activeConversation = state.conversations.find(
    (c) => c.id === state.activeConversationId
  ) || null;

  const groupedConversations = groupByDate(state.conversations);

  const createConversation = useCallback(() => {
    const id = makeId();
    const now = new Date().toISOString();
    setState((prev) => ({
      conversations: [
        { id, title: "Nuova chat", messages: [], sessionId: null, createdAt: now, updatedAt: now },
        ...prev.conversations,
      ],
      activeConversationId: id,
    }));
    return id;
  }, []);

  const selectConversation = useCallback((id) => {
    setState((prev) => ({ ...prev, activeConversationId: id }));
  }, []);

  const deleteConversation = useCallback((id) => {
    setState((prev) => {
      const remaining = prev.conversations.filter((c) => c.id !== id);
      let nextActive = prev.activeConversationId;
      if (nextActive === id) {
        nextActive = remaining.length > 0 ? remaining[0].id : null;
      }
      return { conversations: remaining, activeConversationId: nextActive };
    });
  }, []);

  const appendMessage = useCallback((message) => {
    setState((prev) => {
      const now = new Date().toISOString();
      return {
        ...prev,
        conversations: prev.conversations.map((c) => {
          if (c.id !== prev.activeConversationId) return c;
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

  const updateSessionId = useCallback((sessionId) => {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === prev.activeConversationId ? { ...c, sessionId } : c
      ),
    }));
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
    createConversation,
    selectConversation,
    deleteConversation,
    appendMessage,
    updateSessionId,
    ensureActiveConversation,
  };
}
