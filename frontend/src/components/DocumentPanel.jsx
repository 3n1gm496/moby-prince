import { useState, useEffect, useRef, useCallback } from "react";
import { getFilterValueLabel } from "../filters/schema";

const META_FIELDS = [
  { key: "documentType", label: "Tipo"         },
  { key: "institution",  label: "Istituzione"  },
  { key: "year",         label: "Anno"         },
  { key: "legislature",  label: "Legislatura"  },
  { key: "topic",        label: "Argomento"    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return null; }
}

// ── ChunksSection ─────────────────────────────────────────────────────────────
// Accepts a primary documentId plus optional candidateIds fallback list.
// Tries each candidate in order until one returns chunks.

function ChunksSection({ documentId, candidateIds = [] }) {
  const [phase,  setPhase]  = useState("idle");
  const [chunks, setChunks] = useState([]);

  // Deduplicated ordered list of IDs to try
  const candidates = [...new Set([documentId, ...candidateIds].filter(Boolean))];

  const load = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");
    for (const id of candidates) {
      try {
        const res = await fetch(
          `/api/evidence/documents/${encodeURIComponent(id)}/chunks`
        );
        if (res.status === 501) { setPhase("unavailable"); return; }
        if (res.status === 404) continue; // try next candidate
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setChunks(data.chunks || []);
        setPhase("done");
        return;
      } catch (err) {
        if (err.message?.startsWith("HTTP")) { setPhase("error"); return; }
      }
    }
    setPhase("notindexed");
  }, [candidates.join(","), phase]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return <p className="text-[11px] text-text-secondary animate-pulse">Caricamento frammenti…</p>;
  }

  if (phase === "unavailable") {
    return (
      <p className="text-[11px] text-text-secondary italic">
        Drill-down non disponibile — DATA_STORE_ID non configurato.
      </p>
    );
  }

  if (phase === "notindexed") {
    return (
      <p className="text-[11px] text-text-secondary italic">
        Documento non indicizzato in Discovery Engine.
      </p>
    );
  }

  if (phase === "error") {
    return <p className="text-[11px] text-red-400">Impossibile caricare i frammenti.</p>;
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

// ── Source badge config ───────────────────────────────────────────────────────

const SOURCE_LABELS = {
  listDocuments: { label: "Indice DE",         color: "bg-accent/10 text-accent border-accent/20",           dot: "bg-accent" },
  searchFallback:{ label: "Risultato ricerca", color: "bg-surface-raised text-text-secondary border-border",  dot: "bg-text-muted" },
  gcs:           { label: "Google Cloud Storage", color: "bg-blue-500/10 text-blue-400 border-blue-500/20",  dot: "bg-blue-400" },
};

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

  const isGcs = doc.source === "gcs";

  const hasAnyMetadata = !isGcs && doc.metadataAvailable &&
    Object.values(doc.metadataAvailable).some(Boolean);

  const displayTitle = isGcs
    ? doc.gcs?.name ?? doc.title ?? doc.id
    : (doc.title?.replace(/^moby\s+prince\s*[-–—:·]\s*/i, "").trim() || doc.title || doc.id);

  const srcConfig = SOURCE_LABELS[doc.source] || SOURCE_LABELS.searchFallback;

  const mimeLabel = doc.mimeType
    ? (doc.mimeType.split("/")[1]?.toUpperCase() || doc.mimeType)
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-[2px]" onClick={onClose} />

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
              {isGcs ? "File" : "Documento"}
            </p>
            <h2 className="text-[13px] font-medium text-text-primary leading-snug break-words">
              {displayTitle || "Documento senza titolo"}
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

          {/* Source badge + MIME */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${srcConfig.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${srcConfig.dot}`} />
              {srcConfig.label}
            </span>
            {mimeLabel && (
              <span className="text-[10px] text-text-muted font-mono">{mimeLabel}</span>
            )}
          </div>

          {/* GCS file info */}
          {isGcs && doc.gcs && (
            <section>
              <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
                Dettagli file
              </h3>
              <dl className="space-y-1.5">
                {doc.gcs.size != null && (
                  <div className="flex items-baseline gap-2">
                    <dt className="text-[10px] text-text-muted w-20 flex-shrink-0">Dimensione</dt>
                    <dd className="text-[11px] text-text-primary">{formatBytes(doc.gcs.size)}</dd>
                  </div>
                )}
                {doc.gcs.updated && (
                  <div className="flex items-baseline gap-2">
                    <dt className="text-[10px] text-text-muted w-20 flex-shrink-0">Modificato</dt>
                    <dd className="text-[11px] text-text-primary">{formatDate(doc.gcs.updated)}</dd>
                  </div>
                )}
                {doc.gcs.fullPath && (
                  <div className="flex items-baseline gap-2">
                    <dt className="text-[10px] text-text-muted w-20 flex-shrink-0">Percorso</dt>
                    <dd className="text-[11px] font-mono text-text-secondary break-all">{doc.gcs.fullPath}</dd>
                  </div>
                )}
              </dl>

              {/* Download link */}
              <a
                href={`/api/storage/file?name=${encodeURIComponent(doc.gcs.fullPath)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-accent
                           hover:text-accent-hover transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Apri / scarica documento
              </a>
            </section>
          )}

          {/* Structured metadata (non-GCS only) */}
          {!isGcs && (
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
                          {available ? getFilterValueLabel(key, value) : "—"}
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
          )}

          {/* Document ID (non-GCS only) */}
          {!isGcs && doc.id && (
            <section>
              <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                ID documento
              </h3>
              <p className="text-[11px] font-mono text-text-secondary break-all bg-surface rounded px-2 py-1.5 select-all">
                {doc.id}
              </p>
            </section>
          )}

          {/* URI (non-GCS only) */}
          {!isGcs && doc.uri && (
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
              <p className="text-[11px] text-text-primary leading-relaxed italic border-l-2 border-accent/30 pl-3">
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
              <ChunksSection
                documentId={doc.id}
                candidateIds={doc.gcs?.deIdCandidates}
              />
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
