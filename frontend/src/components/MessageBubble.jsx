import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AnchorAvatar from "./AnchorAvatar";

const COLLAPSE_THRESHOLD = 1500; // chars before "Leggi tutto"

// ─── AnnotatedAnswer ─────────────────────────────────────────────────────────

function AnnotatedAnswer({ text, citations, onInlineCite }) {
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

  // Build segments with stable keys based on position
  const segments = [];
  let cursor = 0;
  let segIdx = 0;
  annotations.forEach((ann) => {
    if (ann.start > cursor) {
      segments.push({ type: "text", key: `s${segIdx++}`, content: text.slice(cursor, ann.start) });
    }
    segments.push({ type: "text", key: `s${segIdx++}`, content: text.slice(ann.start, ann.end) });
    segments.push({ type: "citation", key: `c${ann.id}`, citation: ann });
    cursor = ann.end;
  });
  if (cursor < text.length) {
    segments.push({ type: "text", key: `s${segIdx++}`, content: text.slice(cursor) });
  }

  return (
    <div className="prose-answer">
      {segments.map((seg) =>
        seg.type === "citation" ? (
          <button
            key={seg.key}
            onClick={() => onInlineCite(seg.citation)}
            className="citation-badge mx-0.5"
            title={`Fonte ${seg.citation.id}`}
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

// ─── InlineCitationCard ───────────────────────────────────────────────────────

function InlineCitationCard({ citation, onClose, onOpenPanel }) {
  const src = citation.sources?.[0];
  return (
    <div className="rounded-lg border border-border bg-surface-overlay shadow-lg p-3 mt-2 text-xs">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-semibold text-accent leading-snug flex-1">
          {src?.title || `Citazione ${citation.id}`}
        </span>
        <button
          onClick={onClose}
          aria-label="Chiudi"
          className="text-text-muted hover:text-text-secondary p-0.5 flex-shrink-0"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {src?.pageIdentifier && (
        <p className="text-text-muted font-mono mb-1.5">p.&nbsp;{src.pageIdentifier}</p>
      )}
      {src?.snippet && (
        <blockquote className="text-text-secondary italic border-l-2 border-accent/40 pl-2 mb-2 leading-relaxed">
          &ldquo;{src.snippet.slice(0, 240)}{src.snippet.length > 240 ? "…" : ""}&rdquo;
        </blockquote>
      )}
      {citation.sources.length > 0 && (
        <button
          onClick={onOpenPanel}
          className="text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
        >
          Vedi tutte le fonti
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Feedback buttons ─────────────────────────────────────────────────────────

function FeedbackBar({ messageId, currentFeedback, onFeedback }) {
  return (
    <div className="flex items-center gap-1 px-1 mt-0.5">
      <span className="text-xs text-text-muted mr-1">Risposta utile?</span>
      {[
        { value: "up", label: "Sì", path: "M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" },
        { value: "down", label: "No", path: "M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" },
      ].map(({ value, label, path }) => (
        <button
          key={value}
          onClick={() => onFeedback(messageId, currentFeedback === value ? null : value)}
          aria-label={label}
          className={`p-1 rounded transition-colors ${
            currentFeedback === value
              ? "text-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

export default function MessageBubble({ message, onCitationClick, onFollowUp, onRetry, onFeedback }) {
  const [showSteps, setShowSteps] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inlineCitation, setInlineCitation] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleInlineCite = (citation) => {
    setInlineCitation((prev) => (prev?.id === citation.id ? null : citation));
  };

  const handleOpenPanel = () => {
    if (inlineCitation) {
      onCitationClick(inlineCitation);
      setInlineCitation(null);
    }
  };

  // ── User bubble ─────────────────────────────────────────────────────────────
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-slide-up print:justify-start">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-3
                        bg-surface-raised border border-border text-text-primary
                        text-sm leading-relaxed shadow-md print:max-w-full print:rounded-none print:border-0 print:shadow-none print:bg-transparent print:font-semibold">
          {message.text}
        </div>
      </div>
    );
  }

  // ── Error bubble ─────────────────────────────────────────────────────────────
  if (message.role === "error") {
    return (
      <div className="flex justify-start animate-slide-up print:hidden">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3
                        bg-error-bg border border-error-border text-error-text text-sm space-y-2">
          <p>{message.text}</p>
          {message.retryQuery && onRetry && (
            <button
              onClick={() => onRetry(message.retryQuery)}
              className="flex items-center gap-1.5 text-xs text-error-text/80 hover:text-error-text
                         border border-error-border/60 rounded-lg px-2.5 py-1 transition-colors"
            >
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

  // ── Assistant bubble ──────────────────────────────────────────────────────────
  const isStreaming = message.streaming === true;
  const isLong = !isStreaming && message.text.length > COLLAPSE_THRESHOLD;
  const displayText = isLong && !expanded
    ? message.text.slice(0, COLLAPSE_THRESHOLD)
    : message.text;

  const wordCount = message.text.trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  // Deduplicate sources in summary bar by URI or title
  const uniqueSources = (() => {
    const seen = new Set();
    const out = [];
    message.citations?.forEach((cit) =>
      cit.sources.forEach((src) => {
        const key = src.uri || src.title;
        if (key && !seen.has(key)) { seen.add(key); out.push({ cit, src }); }
      })
    );
    return out;
  })();

  const timestamp = message.id
    ? new Date(message.id).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex justify-start gap-3 animate-slide-up">
      <AnchorAvatar className="print:hidden" />

      <div className="flex-1 min-w-0 space-y-2">
        {/* Answer bubble */}
        <div className="relative group/bubble rounded-2xl rounded-tl-sm px-4 py-3
                        bg-surface-overlay border border-border shadow-md text-sm
                        print:rounded-none print:border-0 print:shadow-none print:bg-transparent">

          {/* Copy button — hidden during streaming, hidden on print */}
          {!isStreaming && (
            <button
              onClick={handleCopy}
              aria-label={copied ? "Copiato" : "Copia risposta"}
              className="absolute top-2.5 right-2.5 p-1 rounded
                         opacity-0 group-hover/bubble:opacity-100 transition-all duration-150
                         text-text-muted hover:text-text-secondary hover:bg-surface-raised
                         print:hidden"
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}

          <AnnotatedAnswer
            text={displayText}
            citations={isStreaming ? null : message.citations}
            onInlineCite={handleInlineCite}
          />

          {/* Streaming cursor */}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5 align-text-bottom" />
          )}

          {/* Collapse toggle */}
          {isLong && !isStreaming && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              {expanded ? (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  Comprimi
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  Leggi tutto ({Math.ceil(message.text.length / 1000)}k caratteri)
                </>
              )}
            </button>
          )}
        </div>

        {/* Inline citation popover */}
        {inlineCitation && !isStreaming && (
          <InlineCitationCard
            citation={inlineCitation}
            onClose={() => setInlineCitation(null)}
            onOpenPanel={handleOpenPanel}
          />
        )}

        {/* Metadata bar: timestamp + word count — visible on hover */}
        {!isStreaming && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-3 px-1 print:hidden"
               style={{ transitionDelay: "100ms" }}>
            {timestamp && (
              <span className="text-[10px] text-text-muted font-mono">{timestamp}</span>
            )}
            <span className="text-[10px] text-text-muted">
              {wordCount} parole · ~{readTime} min
            </span>
          </div>
        )}

        {/* Citation summary bar — clicking opens full CitationPanel */}
        {!isStreaming && uniqueSources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 print:hidden">
            <span className="text-xs text-text-muted">Fonti:</span>
            {message.citations?.map((cit) => (
              <button
                key={cit.id}
                onClick={() => onCitationClick(cit)}
                className="citation-badge !align-middle"
                title="Apri pannello fonti"
              >
                {cit.id}
              </button>
            ))}
            {uniqueSources.slice(0, 2).map(({ cit, src }, i) => (
              <span key={i} className="text-xs text-text-muted truncate max-w-[180px]">
                · {src.title}
              </span>
            ))}
            {uniqueSources.length > 2 && (
              <span className="text-xs text-text-muted">+{uniqueSources.length - 2}</span>
            )}
          </div>
        )}

        {/* Feedback */}
        {!isStreaming && onFeedback && (
          <FeedbackBar
            messageId={message.id}
            currentFeedback={message.feedback || null}
            onFeedback={onFeedback}
          />
        )}

        {/* Reasoning steps */}
        {!isStreaming && message.steps?.length > 0 && (
          <div className="px-1 print:hidden">
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
        {!isStreaming && message.relatedQuestions?.length > 0 && (
          <div className="px-1 print:hidden">
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
