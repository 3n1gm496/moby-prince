import { useState, useCallback, useRef, useEffect } from "react";
import { apiFetch } from "../lib/apiFetch";

// Adaptive animation: short responses (<= 300 chars) appear instantly;
// longer responses animate at ~20 chars/8ms so a 3000-char answer
// completes in ~1.2 s instead of the previous 7 s.
const STREAM_CHUNK_SHORT = 9999; // show entire short text in one tick
const STREAM_CHUNK_LONG  = 20;
const STREAM_TICK_SHORT  = 0;
const STREAM_TICK_LONG   = 8;
const ANIMATION_THRESHOLD = 300; // chars — below this: instant render
const CLIENT_TIMEOUT_MS = 75_000; // must exceed backend POST_TIMEOUT_MS (55 s)
const MAX_AUTO_RETRIES  = 2;
const RETRY_DELAYS      = [2_000, 4_000]; // exponential backoff

// Improvement #7: sleep for `delayMs` while ticking down a visible countdown.
function _retryWithCountdown(delayMs, setCountdown) {
  const secs = Math.ceil(delayMs / 1000);
  setCountdown(secs);
  return new Promise((resolve) => {
    let remaining = secs;
    const tick = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(tick); resolve(); }
      else setCountdown(remaining);
    }, 1000);
  });
}

export function useChat({
  externalMessages,
  externalSessionId,
  activeConversationId,
  onAppend,
  onSessionUpdate,
  filters,
} = {}) {
  const [internalMessages,  setInternalMessages]  = useState([]);
  const [internalSessionId, setInternalSessionId] = useState(null);
  const [loadingConvId,     setLoadingConvId]     = useState(null);
  const [streamingMessage,  setStreamingMessage]  = useState(null);
  // 'searching' | 'retrying' | null — shown inside the skeleton loader
  const [loadingStage,      setLoadingStage]      = useState(null);
  // Improvement #7: seconds remaining in the current retry delay (null = not retrying)
  const [retryCountdown,    setRetryCountdown]    = useState(null);

  const abortRef        = useRef(null);
  const streamingMsgRef = useRef(null);

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

  // Abort any in-flight request on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Keep ref in sync for non-stale reads inside abort handlers
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

    const isLong   = streamingMessage.target.length > ANIMATION_THRESHOLD;
    const chunk    = isLong ? STREAM_CHUNK_LONG  : STREAM_CHUNK_SHORT;
    const tickMs   = isLong ? STREAM_TICK_LONG   : STREAM_TICK_SHORT;

    const timerId = setTimeout(() => {
      setStreamingMessage(prev => {
        if (!prev) return null;
        const nextLen = Math.min(prev.text.length + chunk, prev.target.length);
        return { ...prev, text: prev.target.slice(0, nextLen) };
      });
    }, tickMs);

    return () => clearTimeout(timerId);
  }, [streamingMessage, addMessage]);

  // ── Stop streaming ─────────────────────────────────────────────────────────

  const stopStreaming = useCallback(() => {
    const current = streamingMsgRef.current;
    if (!current) return;
    setStreamingMessage(null);
    setTimeout(() => addMessage(current.msgData, current.convId), 0);
  }, [addMessage]);

  // ── SSE reader ─────────────────────────────────────────────────────────────

  async function _readSSE(response, onThinking) {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = null;

    // Bug fix #9: helper to process complete SSE frames accumulated in buffer.
    const processBuffer = () => {
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.trim()) continue;
        let eventType = "message";
        let eventData = "";
        for (const line of part.split("\n")) {
          if (line.startsWith("event: "))     eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
        }
        if (eventType === "thinking") {
          onThinking?.();
        } else if (eventType === "answer") {
          result = JSON.parse(eventData);
        } else if (eventType === "contradictions") {
          // Merge contradiction data into the accumulated result
          const contrData = JSON.parse(eventData);
          result = { ...(result || {}), contradictions: contrData.contradictions || [] };
        } else if (eventType === "error") {
          const errData = JSON.parse(eventData);
          throw new Error(errData.message || "Errore dal server");
        }
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }
      // Flush decoder and process any remaining data after stream closes.
      buffer += decoder.decode();
      if (buffer.trim()) {
        buffer += "\n\n";
        processBuffer();
      }
    } finally {
      reader.releaseLock();
    }

    return result;
  }

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (queryText, explicitConvId, { silent = false } = {}) => {
      const targetConvId = explicitConvId ?? activeConversationId;
      if (!queryText.trim() || loadingConvId === targetConvId) return;

      // Commit any in-progress streaming animation immediately
      const currentStreaming = streamingMsgRef.current;
      if (currentStreaming) {
        setStreamingMessage(null);
        addMessage(currentStreaming.msgData, currentStreaming.convId);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current  = controller;
      const timeoutId   = setTimeout(() => controller.abort("timeout"), CLIENT_TIMEOUT_MS);

      if (!silent) {
        addMessage({ id: crypto.randomUUID(), role: "user", text: queryText.trim() }, targetConvId);
      }
      setLoadingConvId(targetConvId);
      setLoadingStage("searching");

      let attempt = 0;

      try {
        let data = null;

        while (true) {
          try {
            const res = await apiFetch("/api/answer", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                query:     queryText.trim(),
                sessionId,
                ...(filters && Object.keys(filters).length > 0 ? { filters } : {}),
              }),
              signal: controller.signal,
            });

            if (!res.ok) {
              const status  = res.status;
              const errData = await res.json().catch(() => ({}));
              if ((status === 502 || status === 503) && attempt < MAX_AUTO_RETRIES) {
                attempt++;
                setLoadingStage("retrying");
                await _retryWithCountdown(RETRY_DELAYS[attempt - 1], setRetryCountdown);
                setRetryCountdown(null);
                setLoadingStage("searching");
                continue;
              }
              throw new Error(errData.error || `HTTP ${status}`);
            }

            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("text/event-stream")) {
              data = await _readSSE(res, () => setLoadingStage("searching"));
            } else {
              // Fallback for plain JSON (backwards-compat with proxies that buffer SSE)
              data = await res.json();
            }
            break;

          } catch (fetchErr) {
            if (fetchErr.name === "AbortError") throw fetchErr;
            if (attempt < MAX_AUTO_RETRIES) {
              attempt++;
              setLoadingStage("retrying");
              await _retryWithCountdown(RETRY_DELAYS[attempt - 1], setRetryCountdown);
              setRetryCountdown(null);
              setLoadingStage("searching");
              continue;
            }
            throw fetchErr;
          }
        }

        if (!data) throw new Error("Nessuna risposta ricevuta");

        if (data.session?.id) {
          setSession(data.session.id, targetConvId);
        }

        const answer  = data.answer || {};
        const msgData = {
          id:               crypto.randomUUID(),
          role:             "assistant",
          text:             answer.text || "Nessuna risposta disponibile.",
          citations:        Array.isArray(answer.citations)        ? answer.citations        : [],
          evidence:         Array.isArray(answer.evidence)         ? answer.evidence         : [],
          grounding:        Array.isArray(answer.grounding)        ? answer.grounding        : [],
          relatedQuestions: Array.isArray(answer.relatedQuestions) ? answer.relatedQuestions : [],
          steps:            Array.isArray(answer.steps)            ? answer.steps            : [],
          meta:             data.meta || {},
          contradictions:   Array.isArray(data.contradictions)      ? data.contradictions      : [],
        };

        setStreamingMessage({ convId: targetConvId, text: "", target: msgData.text, msgData });

      } catch (err) {
        if (err.name === "AbortError" && err.message !== "timeout") return;

        addMessage(
          {
            id:         crypto.randomUUID(),
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
        setLoadingStage(null);
        abortRef.current = null;
      }
    },
    [loadingConvId, sessionId, filters, addMessage, setSession, activeConversationId],
  );

  const activeStreamingMessage = streamingMessage?.convId === activeConversationId
    ? { ...streamingMessage.msgData, text: streamingMessage.text, streaming: true }
    : null;

  return {
    messages,
    isLoading,
    loadingConvId,
    loadingStage,
    retryCountdown,
    sendMessage,
    streamingMessage: activeStreamingMessage,
    stopStreaming,
  };
}
