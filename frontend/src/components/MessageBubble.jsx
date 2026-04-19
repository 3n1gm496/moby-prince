import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AnchorAvatar from "./AnchorAvatar";

function AnnotatedAnswer({ text, citations, onCitationClick }) {
  if (!citations || citations.length === 0) {
    return (
      <div className="prose-answer">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  const annotations = citations
    .filter((c) => c.startIndex != null && c.endIndex != null)
    .map((c) => ({ ...c, start: Number(c.startIndex), end: Number(c.endIndex) }))
    .sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;
  annotations.forEach((ann) => {
    if (ann.start > cursor) segments.push({ type: "text", key: `t${cursor}`, content: text.slice(cursor, ann.start) });
    segments.push({ type: "text", key: `t${ann.start}`, content: text.slice(ann.start, ann.end) });
    segments.push({ type: "citation", key: `c${ann.id}`, citation: ann });
    cursor = ann.end;
  });
  if (cursor < text.length) segments.push({ type: "text", key: `t${cursor}`, content: text.slice(cursor) });

  return (
    <div className="prose-answer">
      {segments.map((seg) =>
        seg.type === "citation" ? (
          <button
            key={seg.key}
            onClick={() => onCitationClick(seg.citation)}
            className="citation-badge mx-0.5"
            title={`Vedi fonte ${seg.citation.id}`}
          >
            {seg.citation.id}
          </button>
        ) : (
          <ReactMarkdown key={seg.key} remarkPlugins={[remarkGfm]}>
            {seg.content}
          </ReactMarkdown>
        )
      )}
    </div>
  );
}

export default function MessageBubble({ message, onCitationClick, onFollowUp }) {
  const [showSteps, setShowSteps] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-3
                        bg-surface-raised border border-border text-text-primary
                        text-sm leading-relaxed shadow-md">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="flex justify-start animate-slide-up">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3
                        bg-error-bg border border-error-border text-error-text text-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-3 animate-slide-up">
      <AnchorAvatar />

      <div className="flex-1 min-w-0 space-y-2.5">
        {/* Answer bubble */}
        <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-surface-overlay border border-border shadow-md text-sm">
          <AnnotatedAnswer
            text={message.text}
            citations={message.citations}
            onCitationClick={onCitationClick}
          />
        </div>

        {/* Citation summary */}
        {message.citations?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            <span className="text-xs text-text-muted">Fonti:</span>
            {message.citations.map((cit) => (
              <button
                key={cit.id}
                onClick={() => onCitationClick(cit)}
                className="citation-badge !align-middle"
              >
                {cit.id}
              </button>
            ))}
            {message.citations.map((cit) =>
              cit.sources.slice(0, 1).map((src, i) => (
                <span key={`${cit.id}-${i}`} className="text-xs text-text-muted truncate max-w-[200px]">
                  · {src.title}
                </span>
              ))
            )}
          </div>
        )}

        {/* Reasoning steps */}
        {message.steps?.length > 0 && (
          <div className="px-1">
            <button
              onClick={() => setShowSteps((v) => !v)}
              className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showSteps ? "rotate-90" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showSteps ? "Nascondi" : "Mostra"} ragionamento AI ({message.steps.length} passi)
            </button>
            {showSteps && (
              <div className="mt-2 space-y-1">
                {message.steps.map((step, i) => (
                  <div key={i} className="text-xs text-text-muted font-mono bg-surface-overlay rounded px-2 py-1">
                    {step.description || JSON.stringify(step)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Related questions */}
        {message.relatedQuestions?.length > 0 && (
          <div className="px-1">
            <p className="text-xs text-text-muted mb-1.5">Domande correlate:</p>
            <div className="flex flex-col gap-1">
              {message.relatedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => onFollowUp(q)}
                  className="text-left text-xs text-accent hover:text-accent-hover
                             transition-colors flex items-center gap-1 group"
                >
                  <svg className="w-3 h-3 opacity-50 group-hover:opacity-100 flex-shrink-0"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
