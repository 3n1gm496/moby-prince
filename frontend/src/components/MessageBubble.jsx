import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Inserts clickable superscript citation badges inline within the answer text.
function AnnotatedAnswer({ text, citations, onCitationClick }) {
  if (!citations || citations.length === 0) {
    return (
      <div className="prose-answer">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  // Build sorted list of annotation positions
  const annotations = [];
  citations.forEach((cit) => {
    if (cit.startIndex != null && cit.endIndex != null) {
      annotations.push({ ...cit, start: Number(cit.startIndex), end: Number(cit.endIndex) });
    }
  });
  annotations.sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;

  annotations.forEach((ann) => {
    if (ann.start > cursor) {
      segments.push({ type: "text", content: text.slice(cursor, ann.start) });
    }
    segments.push({ type: "text", content: text.slice(ann.start, ann.end) });
    segments.push({ type: "citation", citation: ann });
    cursor = ann.end;
  });

  if (cursor < text.length) {
    segments.push({ type: "text", content: text.slice(cursor) });
  }

  return (
    <div className="prose-answer">
      {segments.map((seg, i) => {
        if (seg.type === "citation") {
          return (
            <button
              key={i}
              onClick={() => onCitationClick(seg.citation)}
              className="citation-badge mx-0.5"
              title={`Ver fonte ${seg.citation.id}`}
            >
              {seg.citation.id}
            </button>
          );
        }
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{ p: "span" }}>
            {seg.content}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

export default function MessageBubble({ message, onCitationClick, onFollowUp }) {
  const [showSteps, setShowSteps] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-3 bg-brand-600 text-white text-sm leading-relaxed shadow-lg">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="flex justify-start animate-slide-up">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 bg-red-900/40 border border-red-700/50 text-red-300 text-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-3 animate-slide-up">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-navy-700 border border-navy-600
                      flex items-center justify-center mt-1">
        <svg className="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        {/* Answer */}
        <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-navy-800 border border-navy-600 shadow-lg text-sm">
          <AnnotatedAnswer
            text={message.text}
            citations={message.citations}
            onCitationClick={onCitationClick}
          />
        </div>

        {/* Citations summary row */}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            <span className="text-xs text-slate-500">Fonti:</span>
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
                <span key={`${cit.id}-${i}`} className="text-xs text-slate-500 truncate max-w-[200px]">
                  · {src.title}
                </span>
              ))
            )}
          </div>
        )}

        {/* Reasoning steps (collapsed) */}
        {message.steps && message.steps.length > 0 && (
          <div className="px-1">
            <button
              onClick={() => setShowSteps((v) => !v)}
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
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
                  <div key={i} className="text-xs text-slate-500 font-mono bg-navy-900/40 rounded px-2 py-1">
                    {step.description || JSON.stringify(step)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Related questions */}
        {message.relatedQuestions && message.relatedQuestions.length > 0 && (
          <div className="px-1">
            <p className="text-xs text-slate-500 mb-1.5">Domande correlate:</p>
            <div className="flex flex-col gap-1">
              {message.relatedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => onFollowUp(q)}
                  className="text-left text-xs text-brand-400 hover:text-brand-300 transition-colors
                             flex items-center gap-1 group"
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
