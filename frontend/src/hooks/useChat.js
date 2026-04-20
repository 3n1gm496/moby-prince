import { useState, useCallback, useRef, useEffect } from "react";

const STREAM_CHUNK   = 6;   // characters revealed per tick
const STREAM_TICK_MS = 14;  // ~70 chars/s reveal speed

// Client-side abort timeout for /api/answer fetches.
// Deliberately longer than the backend POST_TIMEOUT_MS (55 s) so that when
// Discovery Engine is slow the backend 504 arrives before the client aborts,
// giving the user a meaningful error message rather than a generic network
// failure. If you change this, keep CLIENT_TIMEOUT_MS > backend POST_TIMEOUT_MS.
const CLIENT_TIMEOUT_MS = 75_000;

export function useChat({
  externalMessages,
  externalSessionId,
  activeConversationId,
  onAppend,
  onSessionUpdate,
  filters,          // optional: active filter object sent to /api/answer
} = {}) {
  const [internalMessages,  setInternalMessages]  = useState([]);
  const [internalSessionId, setInternalSessionId] = useState(null);
  const [loadingConvId,     setLoadingConvId]     = useState(null);
  const [streamingMessage,  setStreamingMessage]  = useState(null);
  // streamingMessage shape: { convId, text (partial), target (full), msgData }

  const abortRef       = useRef(null);
  const streamingMsgRef = useRef(null); // stays in sync with streamingMessage for non-stale reads

  const messages  = externalMessages  !== undefined ? externalMessages  : internalMessages;
  const sessionId = externalSessionId !== undefined ? externalSessionId : internalSessionId;
  const isLoading = loadingConvId !== null;

  const addMessage = useCallback((msg, targetId) => {
    if (onAppend) onAppend(msg, targetId);
    else setInternalMessages(prev => [...prev, msg]);
  }, [onAppend]);

  const setSession = useCallback((id, targetId) => {
    if (onSessionUpdate) onSessionUpdate(id, targetId);
    else setInternalSessionId(id);
  }, [onSessionUpdate]);

  // Abort any in-flight request when the component unmounts
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Keep ref in sync so abort handlers can read current streaming state
  useEffect(() => {
    streamingMsgRef.current = streamingMessage;
  }, [streamingMessage]);

  // ── Progressive text reveal ────────────────────────────────────────────────

  useEffect(() => {
    if (!streamingMessage) return;

    if (streamingMessage.text.length >= streamingMessage.target.length) {
      addMessage(streamingMessage.msgData, streamingMessage.convId);
      setStreamingMessage(null);
      return;
    }

    const timerId = setTimeout(() => {
      setStreamingMessage(prev => {
        if (!prev) return null;
        const nextLen = Math.min(prev.text.length + STREAM_CHUNK, prev.target.length);
        return { ...prev, text: prev.target.slice(0, nextLen) };
      });
    }, STREAM_TICK_MS);

    return () => clearTimeout(timerId);
  }, [streamingMessage, addMessage]);

  // ── Stop streaming — commit full text immediately ──────────────────────────

  const stopStreaming = useCallback(() => {
    const current = streamingMsgRef.current;
    if (!current) return;
    setStreamingMessage(null);
    setTimeout(() => addMessage(current.msgData, current.convId), 0);
  }, [addMessage]);

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (queryText, explicitConvId, { silent = false } = {}) => {
      const targetConvId = explicitConvId ?? activeConversationId;
      // Guard is per-conversation: a request in flight for conv A must not
      // block a new message in conv B.
      if (!queryText.trim() || loadingConvId === targetConvId) return;

      // Commit any in-progress streaming animation before starting a new request
      const currentStreaming = streamingMsgRef.current;
      if (currentStreaming) {
        setStreamingMessage(null);
        addMessage(currentStreaming.msgData, currentStreaming.convId);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const timeoutId = setTimeout(() => controller.abort("timeout"), CLIENT_TIMEOUT_MS);

      if (!silent) {
        addMessage({ id: Date.now(), role: "user", text: queryText.trim() }, targetConvId);
      }
      setLoadingConvId(targetConvId);

      try {
        const res = await fetch("/api/answer", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            query:   queryText.trim(),
            sessionId,
            ...(filters && Object.keys(filters).length > 0 ? { filters } : {}),
          }),
          signal:  controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        // Session ID is now a plain string in data.session.id (no parsing needed)
        if (data.session?.id) {
          setSession(data.session.id, targetConvId);
        }

        // Citations and evidence are already normalised by the server
        const answer = data.answer || {};
        const msgData = {
          id:               Date.now() + 1,
          role:             "assistant",
          text:             answer.text || "Nessuna risposta disponibile.",
          citations:        Array.isArray(answer.citations)        ? answer.citations        : [],
          evidence:         Array.isArray(answer.evidence)         ? answer.evidence         : [],
          relatedQuestions: Array.isArray(answer.relatedQuestions) ? answer.relatedQuestions : [],
          steps:            Array.isArray(answer.steps)            ? answer.steps            : [],
          meta:             data.meta || {},
        };

        setStreamingMessage({
          convId:  targetConvId,
          text:    "",
          target:  msgData.text,
          msgData,
        });
      } catch (err) {
        // Distinguish user-triggered abort (switch conversation / new query)
        // from the 75s timeout, which should show an error message.
        if (err.name === "AbortError" && err.message !== "timeout") return;

        addMessage(
          {
            id:         Date.now() + 1,
            role:       "error",
            text:       err.name === "AbortError"
              ? "La richiesta ha impiegato troppo tempo. Riprova."
              : `Errore: ${err.message}`,
            retryQuery: queryText.trim(),
          },
          targetConvId,
        );
      } finally {
        clearTimeout(timeoutId);
        setLoadingConvId(null);
        abortRef.current = null;
      }
    },
    [loadingConvId, sessionId, filters, addMessage, setSession, activeConversationId],
  );

  // Only expose the streaming message for the currently active conversation
  const activeStreamingMessage = streamingMessage?.convId === activeConversationId
    ? { ...streamingMessage.msgData, text: streamingMessage.text, streaming: true }
    : null;

  return {
    messages,
    isLoading,
    loadingConvId,
    sendMessage,
    streamingMessage: activeStreamingMessage,
    stopStreaming,
  };
}
