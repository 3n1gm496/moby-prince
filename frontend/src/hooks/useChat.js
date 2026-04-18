import { useState, useCallback, useRef } from "react";

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

  // explicitConvId lets the caller force a target conversation,
  // needed when a new conversation was just created (state not yet committed).
  const sendMessage = useCallback(
    async (queryText, explicitConvId) => {
      if (!queryText.trim() || isLoading) return;

      // Cancel any previous in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Timeout after 60 s
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const targetConvId = explicitConvId ?? activeConversationId;

      addMessage({ id: Date.now(), role: "user", text: queryText.trim() }, targetConvId);
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
        addMessage(
          {
            id: Date.now() + 1,
            role: "assistant",
            text: answer.answerText || "Nessuna risposta disponibile.",
            citations: buildCitations(answer),
            relatedQuestions: data.answer?.relatedQuestions || [],
            steps: answer.steps || [],
          },
          targetConvId
        );
      } catch (err) {
        if (err.name === "AbortError") return; // cancelled — do not show error
        addMessage(
          { id: Date.now() + 1, role: "error", text: `Errore: ${err.message}` },
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

  return { messages, isLoading, loadingConvId, sendMessage };
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
