import { useState, useCallback, useRef, useEffect } from "react";

const STREAM_CHUNK = 6;   // characters per tick
const STREAM_TICK_MS = 14; // ~70 chars/s — fast enough to feel live, slow enough to read

export function useChat({
  externalMessages,
  externalSessionId,
  activeConversationId,
  onAppend,
  onSessionUpdate,
} = {}) {
  const [internalMessages, setInternalMessages] = useState([]);
  const [internalSessionId, setInternalSessionId] = useState(null);
  const [loadingConvId, setLoadingConvId] = useState(null);
  const [streamingMessage, setStreamingMessage] = useState(null);
  // streamingMessage: null | { convId, text (partial), target (full), msgData }
  const abortRef = useRef(null);

  const messages = externalMessages !== undefined ? externalMessages : internalMessages;
  const sessionId = externalSessionId !== undefined ? externalSessionId : internalSessionId;
  const isLoading = loadingConvId !== null;

  const addMessage = useCallback((msg, targetId) => {
    if (onAppend) {
      onAppend(msg, targetId);
    } else {
      setInternalMessages((prev) => [...prev, msg]);
    }
  }, [onAppend]);

  const setSession = useCallback((id, targetId) => {
    if (onSessionUpdate) {
      onSessionUpdate(id, targetId);
    } else {
      setInternalSessionId(id);
    }
  }, [onSessionUpdate]);

  // Progressive text reveal: tick forward until target is reached, then commit to history
  useEffect(() => {
    if (!streamingMessage) return;

    if (streamingMessage.text.length >= streamingMessage.target.length) {
      addMessage(streamingMessage.msgData, streamingMessage.convId);
      setStreamingMessage(null);
      return;
    }

    const timerId = setTimeout(() => {
      setStreamingMessage((prev) => {
        if (!prev) return null;
        const nextLen = Math.min(prev.text.length + STREAM_CHUNK, prev.target.length);
        return { ...prev, text: prev.target.slice(0, nextLen) };
      });
    }, STREAM_TICK_MS);

    return () => clearTimeout(timerId);
  }, [streamingMessage, addMessage]);

  // explicitConvId: caller forces a target conversation (needed for new-conversation race condition).
  // silent: skip adding a user message (used by retry to avoid duplicates).
  const sendMessage = useCallback(
    async (queryText, explicitConvId, { silent = false } = {}) => {
      if (!queryText.trim() || isLoading) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const targetConvId = explicitConvId ?? activeConversationId;

      if (!silent) {
        addMessage({ id: Date.now(), role: "user", text: queryText.trim() }, targetConvId);
      }
      setLoadingConvId(targetConvId);

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryText.trim(), sessionId }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        if (data.session?.name) {
          const parts = data.session.name.split("/sessions/");
          if (parts[1]) setSession(parts[1], targetConvId);
        }

        const answer = data.answer || {};
        const msgData = {
          id: Date.now() + 1,
          role: "assistant",
          text: answer.answerText || "Nessuna risposta disponibile.",
          citations: buildCitations(answer),
          relatedQuestions: data.answer?.relatedQuestions || [],
          steps: answer.steps || [],
        };

        // Start streaming reveal instead of committing immediately
        setStreamingMessage({ convId: targetConvId, text: "", target: msgData.text, msgData });
      } catch (err) {
        if (err.name === "AbortError") return;
        addMessage(
          {
            id: Date.now() + 1,
            role: "error",
            text: `Errore: ${err.message}`,
            retryQuery: queryText.trim(),
          },
          targetConvId
        );
      } finally {
        clearTimeout(timeoutId);
        setLoadingConvId(null);
        abortRef.current = null;
      }
    },
    [isLoading, sessionId, addMessage, setSession, activeConversationId]
  );

  // Expose the partial streaming message only for the currently visible conversation
  const activeStreamingMessage =
    streamingMessage?.convId === activeConversationId
      ? { ...streamingMessage.msgData, text: streamingMessage.text, streaming: true }
      : null;

  return { messages, isLoading, loadingConvId, sendMessage, streamingMessage: activeStreamingMessage };
}

function buildCitations(answer) {
  if (!answer.citations || !answer.references) return [];

  return answer.citations.map((citation, idx) => {
    const sources = (citation.sources || [])
      .map((src) => {
        const ref = answer.references?.[parseInt(src.referenceIndex, 10)];
        if (!ref) return null;
        return {
          title:
            ref.unstructuredDocumentInfo?.title ||
            ref.chunkInfo?.documentMetadata?.title ||
            `Documento ${src.referenceIndex}`,
          uri:
            ref.unstructuredDocumentInfo?.uri ||
            ref.chunkInfo?.documentMetadata?.uri ||
            null,
          snippet:
            ref.unstructuredDocumentInfo?.chunkContents?.[0]?.content ||
            ref.chunkInfo?.content ||
            null,
          pageIdentifier:
            ref.unstructuredDocumentInfo?.chunkContents?.[0]?.pageIdentifier || null,
        };
      })
      .filter(Boolean);

    return {
      id: idx + 1,
      startIndex: citation.startIndex,
      endIndex: citation.endIndex,
      sources,
    };
  });
}
