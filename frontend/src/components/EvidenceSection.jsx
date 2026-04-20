import { useState, useCallback } from "react";
import { getFilterValueLabel } from "../filters/schema";

const SNIPPET_LIMIT = 280;

// Metadata badge keys shown on evidence items (in display order)
const METADATA_BADGE_KEYS = ["documentType", "institution", "year", "legislature", "topic"];

// ─── DocumentChunksPanel ──────────────────────────────────────────────────────
// Lazily fetches all chunks for a document from GET /api/evidence/documents/:id/chunks.
// Only rendered when a documentId is available and the user expands the item.

function DocumentChunksPanel({ documentId }) {
  const [phase,  setPhase]  = useState("idle");   // idle | loading | done | error | unavailable
  const [chunks, setChunks] = useState([]);

  const load = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");
    try {
      const res = await fetch(`/api/evidence/documents/${encodeURIComponent(documentId)}/chunks`);
      if (res.status === 501) { setPhase("unavailable"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChunks(data.chunks || []);
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }, [documentId, phase]);

  if (phase === "idle") {
    return (
      <button
        onClick={load}
        className="mt-1.5 flex items-center gap-1 text-[10px] text-accent/70
                   hover:text-accent transition-colors"
      >
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5l7 7-7 7" />
        </svg>
        Tutti i frammenti del documento
      </button>
    );
  }

  if (phase === "loading") {
    return (
      <p className="mt-1.5 text-[10px] text-text-secondary animate-pulse">
        Caricamento frammenti…
      </p>
    );
  }

  if (phase === "unavailable") {
    return (
      <p className="mt-1.5 text-[10px] text-text-secondary italic">
        Drill-down non disponibile — DATA_STORE_ID non configurato.
      </p>
    );
  }

  if (phase === "error") {
    return (
      <p className="mt-1.5 text-[10px] text-red-400">
        Impossibile caricare i frammenti.
      </p>
    );
  }

  // phase === "done"
  if (chunks.length === 0) {
    return (
      <p className="mt-1.5 text-xs text-text-secondary italic bg-surface rounded-md px-2 py-1.5">
        Nessun frammento trovato.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-text-secondary">
          {chunks.length} {chunks.length === 1 ? "frammento" : "frammenti"}
        </span>
        <button
          onClick={() => setPhase("idle")}
          className="text-[10px] text-text-secondary hover:text-text-primary transition-colors"
        >
          chiudi
        </button>
      </div>
      <div className="space-y-1 max-h-52 overflow-y-auto pr-2">
        {chunks.map((chunk, i) => (
          <div key={chunk.id ?? i}
               className="text-[11px] text-text-primary bg-surface rounded-md p-2
                          border border-border/30 leading-relaxed">
            {chunk.pageIdentifier && (
              <span className="text-text-secondary font-mono text-[10px] mr-1.5">
                p.&nbsp;{chunk.pageIdentifier}
              </span>
            )}
            {chunk.content
              ? chunk.content.length > 220
                ? chunk.content.slice(0, 220) + "…"
                : chunk.content
              : <span className="italic text-text-secondary">nessun testo</span>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EvidenceItem ─────────────────────────────────────────────────────────────

function EvidenceItem({ item, citations, isActive, onCitationClick }) {
  const [expanded, setExpanded] = useState(false);

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

      {/* Struct metadata badges — visible only when corpus has metadata populated */}
      {item.metadata && METADATA_BADGE_KEYS.some(k => item.metadata[k] != null) && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {METADATA_BADGE_KEYS.map(key => {
            const val = item.metadata[key];
            if (val == null) return null;
            const isAccent = key === "documentType";
            return (
              <span key={key}
                    className={`inline-flex items-center px-1.5 py-px rounded text-[9px] font-medium
                                border ${isAccent
                                  ? "bg-accent/10 text-accent border-accent/20"
                                  : "bg-surface text-text-secondary border-border"}`}>
                {getFilterValueLabel(key, val)}
              </span>
            );
          })}
        </div>
      )}

      {/* Page identifier */}
      {item.pageIdentifier && (
        <p className="text-text-secondary font-mono mb-1.5">p.&nbsp;{item.pageIdentifier}</p>
      )}

      {/* Verbatim snippet */}
      {item.snippet && (
        <p className="text-text-primary leading-relaxed italic mb-1.5">
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
           className="text-accent hover:text-accent-hover transition-colors truncate block max-w-full mb-1">
          {hostname}
        </a>
      )}

      {/* Document chunk drill-down — only when documentId is available */}
      {item.documentId && (
        <DocumentChunksPanel documentId={item.documentId} />
      )}
    </div>
  );
}

// ─── EvidenceSection ──────────────────────────────────────────────────────────

export default function EvidenceSection({ evidence, citations, onCitationClick }) {
  const [open, setOpen] = useState(false);

  if (!evidence || evidence.length === 0) return null;

  const uniqueDocCount = new Set(
    evidence.map((e) => e.documentId || e.uri).filter(Boolean)
  ).size;

  return (
    <div className="mt-2 print:hidden">
      <button onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={`flex items-center gap-1.5 text-xs transition-colors ${
                open ? "text-accent" : "text-text-primary hover:text-accent"
              }`}>
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
              isActive={false}
              onCitationClick={onCitationClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
