import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AnchorAvatar from "./AnchorAvatar";
import EvidenceSection from "./EvidenceSection";

// ─── CitationTooltip ──────────────────────────────────────────────────────────

function CitationTooltip({ citation }) {
  const src = citation.sources?.[0];
  if (!src) return null;
  // Prefer explicit title; fall back to document ID or URI filename
  const displayTitle =
    (src.title && !/^Documento \d+$/.test(src.title))
      ? src.title
      : src.documentId
        ?? src.uri?.split('/').pop()?.replace(/%20/g, ' ')
        ?? `Citazione ${citation.id}`;
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 z-50
                    bg-surface-raised border border-border rounded-xl p-3
                    shadow-2xl text-left pointer-events-none animate-fade-in surface-depth">
      <p className="text-[12px] font-medium text-text-primary mb-1 line-clamp-2 leading-snug">
        {displayTitle}
      </p>
      {src.pageIdentifier && (
        <p className="text-[10px] text-text-muted font-mono mb-1.5">p. {src.pageIdentifier}</p>
      )}
      {src.snippet && (
        <p className="text-[11px] text-text-secondary italic leading-relaxed line-clamp-3">
          &ldquo;{src.snippet.slice(0, 160)}{src.snippet.length > 160 ? "…" : ""}&rdquo;
        </p>
      )}
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
                      border-l-4 border-r-4 border-t-4
                      border-l-transparent border-r-transparent border-t-border" />
    </div>
  );
}

// ─── AnnotatedAnswer ──────────────────────────────────────────────────────────

function AnnotatedAnswer({ text, citations, onInlineCite }) {
  const [hoveredCitId, setHoveredCitId] = useState(null);
  const hoverTimerRef = useRef(null);

  const handleMouseEnter = (id) => {
    hoverTimerRef.current = setTimeout(() => setHoveredCitId(id), 280);
  };
  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    setHoveredCitId(null);
  };

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
    .filter((ann) => ann.start < text.length)
    .sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0, idx = 0;
  annotations.forEach((ann) => {
    if (ann.start < cursor) return;
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
          <button
            key={seg.key}
            onClick={() => onInlineCite(seg.citation)}
            onMouseEnter={() => handleMouseEnter(seg.citation.id)}
            onMouseLeave={handleMouseLeave}
            className="citation-badge mx-0.5 relative"
            title={`Fonte ${seg.citation.id}`}
          >
            {seg.citation.id}
            {hoveredCitId === seg.citation.id && (
              <CitationTooltip citation={seg.citation} />
            )}
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
    <div className="rounded-xl border border-border bg-surface-raised p-3 mt-2 text-xs animate-fade-in surface-depth">
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
        <p className="text-text-secondary font-mono mb-2">p.&nbsp;{src.pageIdentifier}</p>
      )}
      {src?.snippet && (
        <p className="text-text-secondary italic leading-relaxed mb-2 line-clamp-3">
          &ldquo;{src.snippet.slice(0, 220)}{src.snippet.length > 220 ? "…" : ""}&rdquo;
        </p>
      )}
      {(citation.sources?.length ?? 0) > 0 && (
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

export default function MessageBubble({ message, onCitationClick, onFollowUp, onRetry }) {
  const [showSteps, setShowSteps] = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [inlineCit, setInlineCit] = useState(null);

  const handleCopy = () =>
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  const handleInlineCite = (c) => setInlineCit((p) => (p?.id === c.id ? null : c));
  const handleOpenPanel  = () => {
    if (inlineCit) { onCitationClick(inlineCit); setInlineCit(null); }
  };

  // ── User ─────────────────────────────────────────────────────────────────────
  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-slide-right print:justify-start">
        <div className="max-w-[72%] rounded-2xl rounded-tr-sm px-4 py-2.5
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
                               transition-opacity duration-150
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
            text={message.text}
            citations={isStreaming ? null : message.citations}
            onInlineCite={handleInlineCite}
          />

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

        {/* Inline citation popover */}
        {inlineCit && !isStreaming && (
          <InlineCitationCard citation={inlineCit} onClose={() => setInlineCit(null)} onOpenPanel={handleOpenPanel} />
        )}

        {/* Evidence drawer */}
        {!isStreaming && (
          <EvidenceSection
            evidence={message.evidence}
            citations={message.citations}
            activeCitationId={inlineCit?.id}
            onCitationClick={(cit) => { onCitationClick(cit); setInlineCit(null); }}
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
                    <div key={i} className="text-[11px] text-text-secondary font-mono
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
