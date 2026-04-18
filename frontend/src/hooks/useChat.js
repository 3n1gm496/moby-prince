import { useState, useCallback } from "react";

/**
 * Accepts optional external state controllers from useChatHistory.
 * Falls back to internal state when not provided (standalone mode).
 */
export function useChat({ externalMessages, externalSessionId, onAppend, onSessionUpdate } = {}) {
  const [internalMessages, setInternalMessages] = useState([]);
  const [internalSessionId, setInternalSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const messages = externalMessages !== undefined ? externalMessages : internalMessages;
  const sessionId = externalSessionId !== undefined ? externalSessionId : internalSessionId;

  const addMessage = useCallback((msg) => {
    if (onAppend) {
      onAppend(msg);
    } else {
      setInternalMessages((prev) => [...prev, msg]);
    }
  }, [onAppend]);

  const setSession = useCallback((id) => {
    if (onSessionUpdate) {
      onSessionUpdate(id);
    } else {
      setInternalSessionId(id);
    }
  }, [onSessionUpdate]);

  const sendMessage = useCallback(
    async (queryText) => {
      if (!queryText.trim() || isLoading) return;

      const userMessage = { id: Date.now(), role: "user", text: queryText.trim() };
      addMessage(userMessage);
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryText.trim(), sessionId }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        if (data.session?.name) {
          const parts = data.session.name.split("/sessions/");
          if (parts[1]) setSession(parts[1]);
        }

        const answer = data.answer || {};
        const citations = buildCitations(answer);

        addMessage({
          id: Date.now() + 1,
          role: "assistant",
          text: answer.answerText || "Nessuna risposta disponibile.",
          citations,
          relatedQuestions: data.answer?.relatedQuestions || [],
          steps: answer.steps || [],
        });
      } catch (err) {
        setError(err.message);
        addMessage({ id: Date.now() + 1, role: "error", text: `Errore: ${err.message}` });
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, sessionId, addMessage, setSession]
  );

  return { messages, isLoading, error, sendMessage };
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
