import { useState, useEffect, useRef, useCallback } from "react";
import { getFilterValueLabel } from "../filters/schema";

// ── Metadata field definitions (display order + labels) ───────────────────────

const META_FIELDS = [
  { key: "documentType", label: "Tipo"         },
  { key: "institution",  label: "Istituzione"  },
  { key: "year",         label: "Anno"         },
  { key: "legislature",  label: "Legislatura"  },
  { key: "topic",        label: "Argomento"    },
];

// ── ChunksSection ─────────────────────────────────────────────────────────────
// Loads document chunks on demand from GET /api/evidence/documents/:id/chunks.

function ChunksSection({ documentId }) {
  const [phase,  setPhase]  = useState("idle");
  const [chunks, setChunks] = useState([]);

  const load = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");
    try {
      const res = await fetch(
        `/api/evidence/documents/${encodeURIComponent(documentId)}/chunks`
      );
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
        className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Carica frammenti indicizzati
      </button>
    );
  }

  if (phase === "loading") {
    return (
      <p className="text-[11px] text-text-secondary animate-pulse">Caricamento frammenti…</p>
    );
  }

  if (phase === "unavailable") {
    return (
      <p className="text-[11px] text-text-secondary italic">
        Drill-down non disponibile — DATA_STORE_ID non configurato.
      </p>
    );
  }

  if (phase === "error") {
    return (
      <p className="text-[11px] text-red-400">Impossibile caricare i frammenti.</p>
    );
  }

  if (chunks.length === 0) {
    return (
      <p className="text-[11px] text-text-secondary italic bg-surface rounded-md px-2 py-1.5">
        Nessun frammento trovato per questo documento.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-text-secondary">
          {chunks.length} {chunks.length === 1 ? "frammento" : "frammenti"} indicizzati
        </span>
        <button
          onClick={() => setPhase("idle")}
          className="text-[10px] text-text-secondary hover:text-text-primary transition-colors"
        >
          chiudi
        </button>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {chunks.map((chunk, i) => (
          <div
            key={chunk.id ?? i}
            className="text-[11px] text-text-primary bg-surface rounded-md p-2.5
                       border border-border/30 leading-relaxed"
          >
            {chunk.pageIdentifier && (
              <span className="text-text-secondary font-mono text-[10px] mr-1.5 select-none">
                p.&nbsp;{chunk.pageIdentifier}
              </span>
            )}
            {chunk.content || <span className="italic text-text-secondary">nessun testo</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DocumentPanel ─────────────────────────────────────────────────────────────

export default function DocumentPanel({ doc, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => { panelRef.current?.focus(); }, [doc]);

  if (!doc) return null;

  const hasAnyMetadata = doc.metadataAvailable &&
    Object.values(doc.metadataAvailable).some(Boolean);

  const cleanTitle = doc.title
    ? doc.title.replace(/^moby\s+prince\s*[-–—:·]\s*/i, "").trim() || doc.title
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="fixed right-0 top-0 bottom-0 w-full max-w-[26rem]
                   bg-surface-sidebar border-l border-border/50
                   z-50 flex flex-col outline-none animate-slide-right print:hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/30">
          <div className="min-w-0">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
              Documento
            </p>
            <h2 className="text-[13px] font-medium text-text-primary leading-snug break-words">
              {cleanTitle || doc.id || "Documento senza titolo"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi pannello"
            className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors flex-shrink-0 mt-0.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Source badge */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border
              ${doc.source === "listDocuments"
                ? "bg-accent/10 text-accent border-accent/20"
                : "bg-surface-raised text-text-secondary border-border"}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                doc.source === "listDocuments" ? "bg-accent" : "bg-text-muted"
              }`} />
              {doc.source === "listDocuments" ? "Lista completa" : "Risultato di ricerca"}
            </span>
            {doc.mimeType && (
              <span className="text-[10px] text-text-muted font-mono">
                {doc.mimeType.split("/")[1]?.toUpperCase() || doc.mimeType}
              </span>
            )}
          </div>

          {/* Metadata */}
          <section>
            <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
              Metadati
            </h3>
            {hasAnyMetadata ? (
              <dl className="space-y-1.5">
                {META_FIELDS.map(({ key, label }) => {
                  const value     = doc.metadata?.[key];
                  const available = doc.metadataAvailable?.[key];
                  return (
                    <div key={key} className="flex items-baseline gap-2">
                      <dt className="text-[10px] text-text-muted w-20 flex-shrink-0">{label}</dt>
                      <dd className={`text-[11px] leading-snug ${available ? "text-text-primary" : "text-text-muted italic"}`}>
                        {available
                          ? getFilterValueLabel(key, value)
                          : "—"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="text-[11px] text-text-muted italic">
                Metadati strutturati non disponibili per questo documento.
              </p>
            )}
          </section>

          {/* Document ID */}
          {doc.id && (
            <section>
              <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                ID documento
              </h3>
              <p className="text-[11px] font-mono text-text-secondary break-all bg-surface rounded px-2 py-1.5 select-all">
                {doc.id}
              </p>
            </section>
          )}

          {/* URI */}
          {doc.uri && (
            <section>
              <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                Percorso originale
              </h3>
              <p className="text-[11px] font-mono text-text-secondary break-all bg-surface rounded px-2 py-1.5 select-all">
                {doc.uri}
              </p>
            </section>
          )}

          {/* Snippet (searchFallback only) */}
          {doc.snippet && (
            <section>
              <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                Estratto
              </h3>
              <p className="text-[11px] text-text-primary leading-relaxed italic
                             border-l-2 border-accent/30 pl-3">
                &ldquo;{doc.snippet}&rdquo;
              </p>
            </section>
          )}

          {/* Chunks drill-down */}
          {doc.id && (
            <section>
              <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
                Frammenti indicizzati
              </h3>
              <ChunksSection documentId={doc.id} />
            </section>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/30">
          <p className="text-[10px] text-text-muted">
            Archivio Documentale · Camera dei Deputati
          </p>
        </div>
      </aside>
    </>
  );
}
