import { useState, useMemo, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AnchorAvatar from "./AnchorAvatar";
import EvidenceSection from "./EvidenceSection";
import { sourceLocationLabel } from "../lib/sourceUtils";

// ─── Citation helpers ─────────────────────────────────────────────────────────

// Convert UTF-8 byte offset to JS string character offset
function byteToCharOffset(str, byteOff) {
  let bytePos = 0;
  let charPos = 0;
  for (const ch of str) {
    if (bytePos >= byteOff) break;
    const cp = ch.codePointAt(0);
    if      (cp < 0x80)    bytePos += 1;
    else if (cp < 0x800)   bytePos += 2;
    else if (cp < 0x10000) bytePos += 3;
    else                   bytePos += 4;
    charPos++;
  }
  return charPos;
}

// Insert `[cite:N]` markers at citation end-positions so ReactMarkdown
// renders them as inline code → picked up by the custom code component.
// We pre-compute all char offsets from the original text then insert
// right-to-left so earlier positions are unaffected.
function buildAnnotatedText(text, citations) {
  if (!text || !citations?.length) return text;

  const cits = citations.filter((c) => c.endIndex != null && c.endIndex > 0);
  if (!cits.length) return text;

  // Compute char positions from original (unmodified) text
  const positions = cits.map((c) => ({
    id:      c.id,
    charPos: byteToCharOffset(text, c.endIndex),
  }));

  // Bug fix #6: deduplicate by charPos to avoid overlapping markers when two
  // citations share the same endIndex. Keep the lowest citation id at each position.
  const byPos = new Map();
  for (const p of positions) {
    if (!byPos.has(p.charPos) || p.id < byPos.get(p.charPos).id) byPos.set(p.charPos, p);
  }

  // Sort descending so right-to-left insertion preserves earlier positions
  const deduped = [...byPos.values()].sort((a, b) => b.charPos - a.charPos);

  let result = text;
  for (const { id, charPos } of deduped) {
    // Snap to next word boundary so marker doesn't split mid-word
    let insertAt = Math.min(charPos, result.length);
    while (insertAt < result.length && !/[\s,;.!?\n]/.test(result[insertAt])) {
      insertAt++;
    }
    result = result.slice(0, insertAt) + `\`[cite:${id}]\`` + result.slice(insertAt);
  }

  return result;
}

// ─── CitationBadge ─────────────────────────────────────────────────────────────

function CitationBadge({ id, sources, onClick }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="relative inline-block align-baseline"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <button
        className="citation-badge select-none"
        onClick={onClick}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-label={`Apri citazione ${id}`}
      >
        {id}
      </button>
      {visible && sources?.length > 0 && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 z-50 mb-1.5
                     min-w-[180px] max-w-[280px] w-max
                     bg-surface-raised border border-border/70 rounded-lg p-2.5
                     text-xs text-text-primary shadow-xl pointer-events-none"
        >
          <span className="block text-[9px] text-text-muted uppercase tracking-wider mb-1.5 font-medium">
            Fonte
          </span>
          {sources.map((src, i) => (
            <span key={i} className="block text-[11px] leading-snug text-text-secondary mt-0.5 first:mt-0">
              {src.title || src.uri || "—"}
              {sourceLocationLabel(src) ? ` · ${sourceLocationLabel(src)}` : ""}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

// ─── AnnotatedAnswer ──────────────────────────────────────────────────────────

function AnnotatedAnswer({ text, citations, onCitationClick }) {
  const annotated = useMemo(
    () => buildAnnotatedText(text, citations),
    [text, citations]
  );

  return (
    <div className="prose-answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ children, className }) {
            const str = String(children).trim();
            const match = str.match(/^\[cite:(\d+)\]$/);
            if (match && !className) {
              const id = parseInt(match[1], 10);
              const cit = citations?.find((c) => c.id === id);
              return (
                <CitationBadge
                  id={id}
                  sources={cit?.sources ?? []}
                  onClick={cit ? () => onCitationClick?.(cit) : undefined}
                />
              );
            }
            return <code className={className}>{children}</code>;
          },
        }}
      >
        {annotated}
      </ReactMarkdown>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

export default function MessageBubble({ message, onCitationClick, onFollowUp, onRetry }) {
  const [showSteps,     setShowSteps]     = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [activeCitId,   setActiveCitId]   = useState(null);
  const evidenceRef = useRef(null);

  const handleBadgeClick = useCallback((cit) => {
    setActiveCitId(cit.id);
    // If the citation has no sources (missing from DE response), build them
    // from the evidence items that reference this citation via citationIds.
    let enriched = cit;
    if (!cit.sources?.length && message.evidence?.length > 0) {
          const related = message.evidence.filter(e => e.citationIds?.includes(cit.id));
          if (related.length > 0) {
            enriched = {
              ...cit,
              sources: related.map(e => ({
                title:         e.title         || null,
                uri:           e.uri           || null,
                snippet:       e.snippet       || null,
                pageIdentifier:e.pageIdentifier|| null,
                documentId:    e.documentId    || null,
                anchors:       e.anchors       || [],
              })),
            };
          }
        }
    onCitationClick?.(enriched);
  }, [onCitationClick, message.evidence]);

  const handleCopy = () => {
    let text = message.text;
    if (message.citations?.length) {
      const seen = new Set();
      const titles = message.citations
        .flatMap((c) => (c.sources || []).map((s) => s.title))
        .filter((t) => t && !seen.has(t) && seen.add(t));
      if (titles.length) text += `\n\nFonti: ${titles.join(" · ")}`;
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard API unavailable (HTTP context, Firefox private mode, etc.) — silently ignore
    });
  };

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
  // Use message.ts (ISO string) for the timestamp — message.id is a UUID, not a date
  const timestamp = message.ts
    ? (() => {
        const d = new Date(message.ts);
        return isNaN(d.getTime())
          ? null
          : d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      })()
    : null;

  const mightBeTruncated = !isStreaming
    && message.text.length > 600
    && !/[.!?»\u201d\u2019]$/.test(message.text.trimEnd());

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

          <AnnotatedAnswer
            text={message.text}
            citations={isStreaming ? [] : message.citations}
            onCitationClick={handleBadgeClick}
          />

          {isStreaming && (
            <span className="inline-block w-px h-[14px] bg-accent/80 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {mightBeTruncated && (
          <div className="flex items-center gap-2 flex-wrap">
            <p className="flex items-center gap-1 text-[10px] text-text-secondary italic">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              La risposta potrebbe essere incompleta.
            </p>
            {onFollowUp && (
              <button
                onClick={() => onFollowUp("Continua la risposta dal punto in cui ti sei interrotto.")}
                className="text-[10px] text-accent hover:text-accent-hover transition-colors"
              >
                Continua →
              </button>
            )}
          </div>
        )}

        {!isStreaming && (
          <EvidenceSection
            ref={evidenceRef}
            evidence={message.evidence}
            citations={message.citations}
            onCitationClick={onCitationClick}
            activeCitationId={activeCitId}
          />
        )}

        {!isStreaming && (
          <div className="flex items-center gap-3 print:hidden">
            {uniqueSources.length > 0 && (
              <button onClick={() => onCitationClick(message.citations?.[0])}
                      className="text-[11px] text-text-primary hover:text-accent transition-colors font-medium">
                {uniqueSources.length} {uniqueSources.length === 1 ? "fonte" : "fonti"}
              </button>
            )}
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                 style={{ transitionDelay: "60ms" }}>
              <span className="text-[11px] text-text-muted tabular-nums">
                {timestamp && <>{timestamp} · </>}{wordCount} parole · ~{readTime} min
              </span>
            </div>
          </div>
        )}

        {!isStreaming && uniqueSources.length > 0 && (
          <div className="hidden print:flex flex-wrap gap-x-3 text-[11px] text-text-muted">
            {uniqueSources.map(({ src }, i) => (
              <span key={i}>· {src.title}</span>
            ))}
          </div>
        )}

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
