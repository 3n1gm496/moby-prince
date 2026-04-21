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

// ── InlinePdfPreview ──────────────────────────────────────────────────────────
// Fetches the PDF as a blob to avoid browser localhost/CORS iframe restrictions.

function InlinePdfPreview({ fullPath }) {
  const [open,    setOpen]    = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);
  const urlRef     = useRef(null);
  const mountedRef = useRef(true);

  // Bug fix #5: track mounted state so blob URLs created after unmount are
  // immediately revoked instead of leaking.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const handleToggle = useCallback(async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (blobUrl) return;
    setLoading(true); setError(false);
    try {
      const res = await fetch(`/api/storage/file?name=${encodeURIComponent(fullPath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      urlRef.current = url;
      if (!mountedRef.current) { URL.revokeObjectURL(url); return; }
      setBlobUrl(url);
    } catch { if (mountedRef.current) setError(true); }
    finally  { if (mountedRef.current) setLoading(false); }
  }, [open, blobUrl, fullPath]);

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary
                   hover:text-text-primary transition-colors disabled:opacity-50"
      >
        {loading
          ? <span className="w-3 h-3 rounded-full border-2 border-text-muted/30 border-t-accent animate-spin" />
          : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
        }
        {loading ? "Caricamento…" : open ? "Chiudi anteprima" : "Anteprima"}
      </button>
      {open && (
        <div className="mt-3 -mx-5 border-t border-border/30">
          {error   && <p className="text-[11px] text-red-400 px-5 py-3">Impossibile caricare l&apos;anteprima.</p>}
          {blobUrl && <iframe src={blobUrl} title="Anteprima documento" className="w-full" style={{ height: "420px" }} />}
        </div>
      )}
    </>
  );
}

// ── GcsMetadataSection ────────────────────────────────────────────────────────

function GcsMetadataSection({ fullPath }) {
  const [phase,    setPhase]    = useState("idle"); // idle | loading | done | error
  const [sysMeta,  setSysMeta]  = useState(null);
  const [custom,   setCustom]   = useState({});     // { key: value } being edited
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [newKey,   setNewKey]   = useState("");
  const [newVal,   setNewVal]   = useState("");

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await fetch(`/api/storage/metadata?name=${encodeURIComponent(fullPath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSysMeta(data);
      setCustom(data.metadata || {});
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }, [fullPath]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/storage/metadata", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: fullPath, metadata: custom }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCustom(data.metadata || {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const addPair = () => {
    const k = newKey.trim(), v = newVal.trim();
    if (!k) return;
    setCustom((prev) => ({ ...prev, [k]: v }));
    setNewKey(""); setNewVal("");
  };

  const removePair = (key) => setCustom((prev) => {
    const next = { ...prev };
    delete next[key];
    return next;
  });

  if (phase === "idle" || phase === "loading") {
    return <p className="text-[11px] text-text-muted animate-pulse">Caricamento metadati…</p>;
  }
  if (phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-red-400">Impossibile caricare i metadati.</p>
        <button onClick={load}
                className="text-[11px] text-accent hover:text-accent-hover transition-colors underline">
          Riprova
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* System metadata */}
      {sysMeta && (
        <div>
          <h4 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
            Sistema
          </h4>
          <dl className="space-y-1">
            {[
              ["Creato",    formatDate(sysMeta.timeCreated)],
              ["MD5",       sysMeta.md5Hash],
              ["Generaz.",  sysMeta.generation],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-2">
                <dt className="text-[10px] text-text-muted w-16 flex-shrink-0">{label}</dt>
                <dd className="text-[10px] font-mono text-text-secondary break-all select-all">{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Custom metadata */}
      <div>
        <h4 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
          Metadati personalizzati
        </h4>
        <div className="space-y-1">
          {Object.entries(custom).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5 group/pair">
              <input
                value={k}
                readOnly
                className="w-24 text-[10px] font-mono bg-surface border border-border/40 rounded px-1.5 py-1
                           text-text-muted focus:outline-none"
              />
              <input
                value={v}
                onChange={(e) => setCustom((prev) => ({ ...prev, [k]: e.target.value }))}
                className="flex-1 text-[10px] bg-surface border border-border/40 rounded px-1.5 py-1
                           text-text-primary focus:outline-none focus:border-accent/50"
              />
              <button onClick={() => removePair(k)}
                      className="text-text-muted hover:text-red-400 opacity-0 group-hover/pair:opacity-100 transition-opacity p-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {/* Add new pair */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="chiave"
              className="w-24 text-[10px] font-mono bg-surface border border-dashed border-border/50 rounded px-1.5 py-1
                         text-text-muted placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
            />
            <input
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPair()}
              placeholder="valore"
              className="flex-1 text-[10px] bg-surface border border-dashed border-border/50 rounded px-1.5 py-1
                         text-text-muted placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
            />
            <button onClick={addPair} disabled={!newKey.trim()}
                    className="text-[10px] text-accent hover:text-accent-hover disabled:opacity-30 transition-colors px-1">
              +
            </button>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`mt-2.5 flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-colors
                      ${saved
                        ? "border-green-500/40 text-green-400 bg-green-500/5"
                        : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"}
                      disabled:opacity-40`}
        >
          {saved ? (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Salvato
            </>
          ) : saving ? "Salvataggio…" : "Salva metadati"}
        </button>
      </div>
    </div>
  );
}

// ── ChunksSection ─────────────────────────────────────────────────────────────
// For GCS files: resolves via URI lookup (gcsPath → /chunks-by-gcs-path).
// For DE documents: direct lookup via documentId.

function ChunksSection({ documentId, gcsPath }) {
  const [phase,  setPhase]  = useState("idle");
  const [chunks, setChunks] = useState([]);

  const load = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");

    const url = gcsPath
      ? `/api/evidence/chunks-by-gcs-path?path=${encodeURIComponent(gcsPath)}`
      : `/api/evidence/documents/${encodeURIComponent(documentId)}/chunks`;

    try {
      const res = await fetch(url);
      if (res.status === 501) { setPhase("unavailable"); return; }
      if (res.status === 404) { setPhase("notindexed"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChunks(data.chunks || []);
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }, [gcsPath, documentId, phase]); // eslint-disable-line react-hooks/exhaustive-deps

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

              {/* Download + Preview links */}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <a
                  href={`/api/storage/file?name=${encodeURIComponent(doc.gcs.fullPath)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-accent hover:text-accent-hover transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Apri / scarica
                </a>
                {doc.mimeType?.includes("pdf") && <InlinePdfPreview fullPath={doc.gcs.fullPath} />}
              </div>
            </section>
          )}

          {/* GCS metadata (system + custom) */}
          {isGcs && doc.gcs?.fullPath && (
            <section>
              <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
                Metadati
              </h3>
              <GcsMetadataSection fullPath={doc.gcs.fullPath} />
            </section>
          )}

          {/* Structured metadata (non-GCS only) */}
          {!isGcs && (
            <section>
              <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
                Metadati
              </h3>
              <dl className="space-y-1.5">
                {hasAnyMetadata && META_FIELDS.map(({ key, label }) => {
                  const value     = doc.metadata?.[key];
                  const available = doc.metadataAvailable?.[key];
                  if (!available) return null;
                  return (
                    <div key={key} className="flex items-baseline gap-2">
                      <dt className="text-[10px] text-text-muted w-20 flex-shrink-0">{label}</dt>
                      <dd className="text-[11px] leading-snug text-text-primary">
                        {getFilterValueLabel(key, value)}
                      </dd>
                    </div>
                  );
                })}
                {!hasAnyMetadata && (
                  <div className="text-[11px] text-text-muted italic">
                    Nessun metadato strutturato indicizzato per questo documento.
                  </div>
                )}
              </dl>
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
                gcsPath={doc.gcs?.fullPath}
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
