import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AnchorAvatar from "./AnchorAvatar";
import EvidenceSection from "./EvidenceSection";

// ─── AnnotatedAnswer ──────────────────────────────────────────────────────────
// Renders the answer as clean prose. Citations are surfaced via the "N fonti"
// bar and EvidenceSection below — never by splitting the text mid-word.

function AnnotatedAnswer({ text }) {
  return (
    <div className="prose-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

export default function MessageBubble({ message, onCitationClick, onFollowUp, onRetry }) {
  const [showSteps, setShowSteps] = useState(false);
  const [copied,    setCopied]    = useState(false);

  const handleCopy = () =>
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  // ── User ─────────────────────────────────────────────────────────────────────
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-slide-right print:justify-start">
        <div className="max-w-[88%] sm:max-w-[72%] rounded-2xl rounded-tr-sm px-4 py-2.5
                        bg-surface-raised text-text-primary text-sm leading-relaxed surface-depth
                        print:max-w-full print:bg-transparent print:font-semibold print:px-0">
          {message.text}
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (message.role === "error") {
    return (
      <div className="flex justify-start animate-slide-up print:hidden">
        <div className="max-w-[80%] rounded-xl px-4 py-3
                        bg-error-bg border border-error-border text-error-text text-sm space-y-2">
          <p>{message.text}</p>
          {message.retryQuery && onRetry && (
            <button onClick={() => onRetry(message.retryQuery)}
                    className="flex items-center gap-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Riprova
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Assistant ─────────────────────────────────────────────────────────────────
  const isStreaming = message.streaming === true;

  const wordCount = message.text.trim().split(/\s+/).filter(Boolean).length;
  const readTime  = Math.max(1, Math.ceil(wordCount / 200));
  const timestamp = message.id
    ? new Date(message.id).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Heuristic: text > 600 chars ending without sentence punctuation may be truncated
  const mightBeTruncated = !isStreaming
    && message.text.length > 600
    && !/[.!?»\u201d\u2019]$/.test(message.text.trimEnd());

  // Deduplicated sources for the summary bar
  const uniqueSources = (() => {
    const seen = new Set(), out = [];
    message.citations?.forEach((cit) =>
      (cit.sources || []).forEach((src) => {
        const k = src.uri || src.title;
        if (k && !seen.has(k)) { seen.add(k); out.push({ cit, src }); }
      })
    );
    return out;
  })();

  return (
    <div className="group flex justify-start gap-3 animate-slide-up">
      <AnchorAvatar className="print:hidden" />

      <div className="flex-1 min-w-0 space-y-1.5">

        {/* Answer text */}
        <div className="relative">
          {/* Copy button */}
          {!isStreaming && (
            <button onClick={handleCopy} aria-label={copied ? "Copiato" : "Copia"}
                    className="absolute -top-1 -right-1 p-1.5 rounded-lg
                               opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100
                               transition-opacity duration-150 animate-fade-in
                               text-text-muted hover:text-text-secondary hover:bg-surface-raised
                               print:hidden">
              {copied
                ? <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
              }
            </button>
          )}

          <AnnotatedAnswer text={message.text} />

          {/* Streaming cursor */}
          {isStreaming && (
            <span className="inline-block w-px h-[14px] bg-accent/80 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {/* Truncation warning */}
        {mightBeTruncated && (
          <p className="flex items-center gap-1 text-[10px] text-text-secondary italic">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            La risposta potrebbe essere incompleta.
          </p>
        )}

        {/* Evidence drawer */}
        {!isStreaming && (
          <EvidenceSection
            evidence={message.evidence}
            citations={message.citations}
            onCitationClick={onCitationClick}
          />
        )}

        {/* Metadata + actions bar */}
        {!isStreaming && (
          <div className="flex items-center gap-3 print:hidden">
            {/* Fonti — always visible */}
            {uniqueSources.length > 0 && (
              <button onClick={() => onCitationClick(message.citations?.[0])}
                      className="text-[11px] text-text-primary hover:text-accent transition-colors font-medium">
                {uniqueSources.length} {uniqueSources.length === 1 ? "fonte" : "fonti"}
              </button>
            )}
            {/* Timestamp + stats — visible only on hover */}
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                 style={{ transitionDelay: "60ms" }}>
              <span className="text-[11px] text-text-muted tabular-nums">
                {timestamp && <>{timestamp} · </>}{wordCount} parole · ~{readTime} min
              </span>
            </div>
          </div>
        )}

        {/* Source titles — print only */}
        {!isStreaming && uniqueSources.length > 0 && (
          <div className="hidden print:flex flex-wrap gap-x-3 text-[11px] text-text-muted">
            {uniqueSources.map(({ src }, i) => (
              <span key={i}>· {src.title}</span>
            ))}
          </div>
        )}

        {/* Reasoning steps */}
        {!isStreaming && message.steps?.length > 0 && (() => {
          const TRIVIAL = /rephrase|reformula|riformula|expand query/i;
          const visibleSteps = message.steps.filter(
            (s) => !TRIVIAL.test(s.description || s.type || "")
          );
          if (visibleSteps.length === 0) return null;
          return (
            <div className="print:hidden">
              <button onClick={() => setShowSteps((v) => !v)}
                      aria-expanded={showSteps}
                      className="flex items-center gap-1 text-xs text-text-primary hover:text-accent transition-colors">
                <svg className={`w-3 h-3 transition-transform ${showSteps ? "rotate-90" : ""}`}
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showSteps ? "Nascondi" : "Mostra"} ragionamento ({visibleSteps.length} {visibleSteps.length === 1 ? "passo" : "passi"})
              </button>
              {showSteps && (
                <div className="mt-1.5 space-y-1">
                  {visibleSteps.map((step, i) => (
                    <div key={i} className="text-xs text-text-secondary font-mono leading-relaxed
                                            bg-surface-raised rounded-lg px-2.5 py-1.5">
                      {step.description || JSON.stringify(step)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Related questions */}
        {!isStreaming && message.relatedQuestions?.length > 0 && (
          <div className="pt-1 print:hidden">
            <div className="flex flex-col gap-0.5">
              {message.relatedQuestions.map((q, i) => (
                <button key={i} onClick={() => onFollowUp(q)}
                        className="text-left text-xs text-text-primary hover:text-accent
                                   transition-colors flex items-start gap-1.5 group/q py-0.5">
                  <span className="mt-px opacity-50 group-hover/q:opacity-100 transition-opacity flex-shrink-0">→</span>
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
