import { useState, useCallback } from "react";

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(
    async (queryText) => {
      if (!queryText.trim() || isLoading) return;

      const userMessage = {
        id: Date.now(),
        role: "user",
        text: queryText.trim(),
      };

      setMessages((prev) => [...prev, userMessage]);
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

        // Extract session ID for multi-turn conversation continuity
        if (data.session?.name) {
          const parts = data.session.name.split("/sessions/");
          if (parts[1]) setSessionId(parts[1]);
        }

        const answer = data.answer || {};
        const answerText =
          answer.answerText || "Nessuna risposta disponibile.";
        const citations = buildCitations(answer);
        const relatedQuestions = data.answer?.relatedQuestions || [];

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "assistant",
            text: answerText,
            citations,
            relatedQuestions,
            steps: answer.steps || [],
          },
        ]);
      } catch (err) {
        setError(err.message);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "error",
            text: `Errore: ${err.message}`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, sessionId]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }, []);

  return { messages, isLoading, error, sendMessage, clearChat };
}

function buildCitations(answer) {
  if (!answer.citations || !answer.references) return [];

  return answer.citations.map((citation, idx) => {
    const sources = (citation.sources || []).map((src) => {
      const ref = answer.references?.[parseInt(src.referenceIndex, 10)];
      return ref
        ? {
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
              ref.unstructuredDocumentInfo?.chunkContents?.[0]
                ?.pageIdentifier || null,
          }
        : null;
    }).filter(Boolean);

    return {
      id: idx + 1,
      startIndex: citation.startIndex,
      endIndex: citation.endIndex,
      sources,
    };
  });
}
