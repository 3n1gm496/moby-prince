import { useState } from "react";

const SNIPPET_LIMIT = 280;

// ─── EvidenceItem ─────────────────────────────────────────────────────────────

function EvidenceItem({ item, citations, isActive, onCitationClick }) {
  const [expanded, setExpanded] = useState(false);

  // Find full citation objects that reference this evidence item
  const relatedCits = citations.filter((c) => item.citationIds?.includes(c.id));

  const hostname = (() => {
    if (!item.uri) return null;
    try { return new URL(item.uri).hostname; } catch { return null; }
  })();

  return (
    <div className={`rounded-lg border p-3 text-xs transition-colors ${
      isActive
        ? "border-l-2 border-accent bg-accent/5"
        : "border-border bg-surface-raised"
    }`}>

      {/* Citation chips */}
      {relatedCits.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {relatedCits.map((cit) => (
            <button key={cit.id} onClick={() => onCitationClick(cit)}
                    className="citation-badge text-[10px]" title={`Apri citazione ${cit.id}`}>
              {cit.id}
            </button>
          ))}
        </div>
      )}

      {/* Title */}
      <p className="font-medium text-text-primary leading-snug mb-1">{item.title}</p>

      {/* Page identifier */}
      {item.pageIdentifier && (
        <p className="text-text-muted font-mono mb-1.5">p.&nbsp;{item.pageIdentifier}</p>
      )}

      {/* Verbatim snippet */}
      {item.snippet && (
        <p className="text-text-secondary leading-relaxed italic mb-1.5">
          &ldquo;
          {expanded ? item.snippet : item.snippet.slice(0, SNIPPET_LIMIT)}
          {!expanded && item.snippet.length > SNIPPET_LIMIT ? "…" : ""}
          &rdquo;
          {item.snippet.length > SNIPPET_LIMIT && (
            <button onClick={() => setExpanded((v) => !v)}
                    className="ml-1 not-italic text-accent hover:text-accent-hover transition-colors">
              {expanded ? "meno" : "tutto"}
            </button>
          )}
        </p>
      )}

      {/* Source link */}
      {hostname && (
        <a href={item.uri} target="_blank" rel="noopener noreferrer"
           className="text-accent hover:text-accent-hover transition-colors truncate block max-w-full">
          {hostname}
        </a>
      )}
    </div>
  );
}

// ─── EvidenceSection ──────────────────────────────────────────────────────────

export default function EvidenceSection({ evidence, citations, activeCitationId, onCitationClick }) {
  const [open, setOpen] = useState(false);

  if (!evidence || evidence.length === 0) return null;

  const uniqueDocCount = new Set(
    evidence.map((e) => e.documentId || e.uri).filter(Boolean)
  ).size;

  return (
    <div className="mt-2 print:hidden">
      <button onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {evidence.length}&nbsp;{evidence.length === 1 ? "frammento recuperato" : "frammenti recuperati"}
        {uniqueDocCount > 0 && (
          <>&nbsp;·&nbsp;{uniqueDocCount}&nbsp;{uniqueDocCount === 1 ? "documento" : "documenti"}</>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {evidence.map((item) => (
            <EvidenceItem
              key={item.index}
              item={item}
              citations={citations || []}
              isActive={activeCitationId != null && item.citationIds?.includes(activeCitationId)}
              onCitationClick={onCitationClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
