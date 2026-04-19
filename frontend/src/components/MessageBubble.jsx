import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AnchorAvatar from "./AnchorAvatar";

const COLLAPSE_THRESHOLD = 1500;

// ─── AnnotatedAnswer ──────────────────────────────────────────────────────────

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

  const segments = [];
  let cursor = 0, idx = 0;
  annotations.forEach((ann) => {
    if (ann.start > cursor)
      segments.push({ type: "text", key: `s${idx++}`, content: text.slice(cursor, ann.start) });
    segments.push({ type: "text",     key: `s${idx++}`, content: text.slice(ann.start, ann.end) });
    segments.push({ type: "citation", key: `c${ann.id}`, citation: ann });
    cursor = ann.end;
  });
  if (cursor < text.length)
    segments.push({ type: "text", key: `s${idx++}`, content: text.slice(cursor) });

  return (
    <div className="prose-answer">
      {segments.map((seg) =>
        seg.type === "citation" ? (
          <button key={seg.key} onClick={() => onInlineCite(seg.citation)}
                  className="citation-badge mx-0.5" title={`Fonte ${seg.citation.id}`}>
            {seg.citation.id}
          </button>
        ) : (
          <ReactMarkdown key={seg.key} remarkPlugins={[remarkGfm]}>{seg.content}</ReactMarkdown>
        )
      )}
    </div>
  );
}

// ─── InlineCitationCard ───────────────────────────────────────────────────────

function InlineCitationCard({ citation, onClose, onOpenPanel }) {
  const src = citation.sources?.[0];
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3 mt-2 text-xs animate-fade-in">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-medium text-text-primary leading-snug flex-1">
          {src?.title || `Citazione ${citation.id}`}
        </span>
        <button onClick={onClose} aria-label="Chiudi"
                className="text-text-muted hover:text-text-secondary p-0.5 flex-shrink-0 transition-colors">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {src?.pageIdentifier && (
        <p className="text-text-muted font-mono mb-2">p.&nbsp;{src.pageIdentifier}</p>
      )}
      {src?.snippet && (
        <p className="text-text-secondary italic leading-relaxed mb-2 line-clamp-3">
          &ldquo;{src.snippet.slice(0, 220)}{src.snippet.length > 220 ? "…" : ""}&rdquo;
        </p>
      )}
      {citation.sources.length > 0 && (
        <button onClick={onOpenPanel}
                className="text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
          Vedi tutte le fonti
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

export default function MessageBubble({ message, onCitationClick, onFollowUp, onRetry, onFeedback }) {
  const [showSteps,    setShowSteps]    = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [inlineCit,    setInlineCit]    = useState(null);
  const [expanded,     setExpanded]     = useState(false);

  const handleCopy = () =>
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  const handleInlineCite = (c) => setInlineCit((p) => (p?.id === c.id ? null : c));

  const handleOpenPanel = () => {
    if (inlineCit) { onCitationClick(inlineCit); setInlineCit(null); }
  };

  // ── User ─────────────────────────────────────────────────────────────────────
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-slide-up print:justify-start">
        <div className="max-w-[72%] rounded-2xl rounded-tr-sm px-4 py-2.5
                        bg-surface-raised text-text-primary text-sm leading-relaxed
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
  const isLong      = !isStreaming && message.text.length > COLLAPSE_THRESHOLD;
  const displayText = isLong && !expanded ? message.text.slice(0, COLLAPSE_THRESHOLD) : message.text;

  const wordCount = message.text.trim().split(/\s+/).filter(Boolean).length;
  const readTime  = Math.max(1, Math.ceil(wordCount / 200));
  const timestamp = message.id
    ? new Date(message.id).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Deduplicated sources for the summary bar
  const uniqueSources = (() => {
    const seen = new Set(), out = [];
    message.citations?.forEach((cit) =>
      cit.sources.forEach((src) => {
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

        {/* Answer text — flat, borderless */}
        <div className="relative">
          {/* Copy button */}
          {!isStreaming && (
            <button onClick={handleCopy} aria-label={copied ? "Copiato" : "Copia"}
                    className="absolute -top-1 -right-1 p-1.5 rounded-lg
                               opacity-0 group-hover:opacity-100 transition-opacity duration-150
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

          <AnnotatedAnswer
            text={displayText}
            citations={isStreaming ? null : message.citations}
            onInlineCite={handleInlineCite}
          />

          {/* Streaming cursor */}
          {isStreaming && (
            <span className="inline-block w-px h-[14px] bg-accent/80 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {/* Collapse toggle */}
        {isLong && !isStreaming && (
          <button onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            {expanded
              ? <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>Comprimi</>
              : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>Continua a leggere ({Math.ceil(message.text.length / 1000)}k car.)</>
            }
          </button>
        )}

        {/* Inline citation popover */}
        {inlineCit && !isStreaming && (
          <InlineCitationCard citation={inlineCit} onClose={() => setInlineCit(null)} onOpenPanel={handleOpenPanel} />
        )}

        {/* Metadata + actions bar — hover only */}
        {!isStreaming && (
          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 print:hidden"
               style={{ transitionDelay: "60ms" }}>

            {/* Timestamp + word count */}
            <span className="text-[11px] text-text-muted tabular-nums">
              {timestamp && <>{timestamp} · </>}{wordCount} parole · ~{readTime} min
            </span>

            {/* Divider */}
            {uniqueSources.length > 0 && <span className="text-text-muted text-[11px]">·</span>}

            {/* Source count (opens panel on click) */}
            {uniqueSources.length > 0 && (
              <button onClick={() => onCitationClick(message.citations?.[0])}
                      className="text-[11px] text-text-muted hover:text-accent transition-colors">
                {uniqueSources.length} {uniqueSources.length === 1 ? "fonte" : "fonti"}
              </button>
            )}

            {/* Feedback */}
            {onFeedback && (
              <>
                <span className="text-text-muted text-[11px]">·</span>
                {[
                  { v: "up",   path: "M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" },
                  { v: "down", path: "M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" },
                ].map(({ v, path }) => (
                  <button key={v}
                          onClick={() => onFeedback(message.id, message.feedback === v ? null : v)}
                          aria-label={v === "up" ? "Utile" : "Non utile"}
                          className={`transition-colors ${message.feedback === v ? "text-accent" : "text-text-muted hover:text-text-secondary"}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
                    </svg>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Source titles — subtle text, below metadata, print-visible */}
        {!isStreaming && uniqueSources.length > 0 && (
          <div className="hidden print:flex flex-wrap gap-x-3 text-[11px] text-text-muted">
            {uniqueSources.map(({ src }, i) => (
              <span key={i}>· {src.title}</span>
            ))}
          </div>
        )}

        {/* Reasoning steps */}
        {!isStreaming && message.steps?.length > 0 && (
          <div className="print:hidden">
            <button onClick={() => setShowSteps((v) => !v)}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
              <svg className={`w-3 h-3 transition-transform ${showSteps ? "rotate-90" : ""}`}
                   fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showSteps ? "Nascondi" : "Mostra"} ragionamento ({message.steps.length} passi)
            </button>
            {showSteps && (
              <div className="mt-1.5 space-y-1">
                {message.steps.map((step, i) => (
                  <div key={i} className="text-[11px] text-text-muted font-mono
                                          bg-surface-raised rounded-lg px-2.5 py-1.5">
                    {step.description || JSON.stringify(step)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Related questions */}
        {!isStreaming && message.relatedQuestions?.length > 0 && (
          <div className="pt-1 print:hidden">
            <div className="flex flex-col gap-0.5">
              {message.relatedQuestions.map((q, i) => (
                <button key={i} onClick={() => onFollowUp(q)}
                        className="text-left text-xs text-text-muted hover:text-accent
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
