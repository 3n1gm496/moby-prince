import { useEffect, useRef } from "react";

function titleFromUri(uri) {
  if (!uri) return null;
  const filename = (uri.split("/").pop() || "").replace(/\.[^.]+$/, "");
  return filename.replace(/[_-]+/g, " ").trim() || null;
}

function resolveUri(uri) {
  if (!uri) return null;
  if (uri.startsWith("gs://")) {
    const withoutScheme = uri.slice(5);
    const slash = withoutScheme.indexOf("/");
    if (slash < 0) return null;
    const path = withoutScheme.slice(slash + 1);
    // Bug fix #4: decode first to avoid double-encoding paths that already
    // contain percent-encoded characters (e.g. %20 → %2520).
    let decoded;
    try { decoded = decodeURIComponent(path); } catch { decoded = path; }
    return `/api/storage/file?name=${encodeURIComponent(decoded)}`;
  }
  return uri;
}

export default function CitationPanel({ citation, onClose }) {
  const panelRef = useRef(null);
  const touchStartX = useRef(null);

  useEffect(() => {
    const handleKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => { panelRef.current?.focus(); }, []);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return;
    if (e.changedTouches[0].clientX - touchStartX.current > 80) onClose();
    touchStartX.current = null;
  };

  if (!citation) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40 lg:bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="fixed right-0 top-0 bottom-0 w-full max-w-[22rem]
                   bg-surface-sidebar border-l border-border/50
                   z-50 flex flex-col outline-none
                   translate-x-0 print:hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <div className="flex items-center gap-2.5">
            <span className="citation-badge">{citation.id}</span>
            <span className="text-[13px] font-medium text-text-primary">
              {citation.sources?.length === 1 ? "Fonte" : "Fonti"}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi pannello"
            className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sources */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {citation.sources.length === 0 && (
            <p className="text-xs text-text-secondary italic">Nessuna fonte disponibile.</p>
          )}
          {citation.sources.map((src, i) => (
            <div key={i} className="space-y-2">
              {/* Title + page */}
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-[13px] font-medium text-text-primary leading-snug flex-1">
                  {titleFromUri(src.uri) || src.title || "Documento"}
                </h4>
                {src.pageIdentifier && (
                  <span className="text-[11px] text-text-secondary font-mono whitespace-nowrap flex-shrink-0 mt-0.5">
                    p.&thinsp;{src.pageIdentifier}
                  </span>
                )}
              </div>

              {/* Snippet */}
              {src.snippet && (
                <p className="text-xs text-text-primary leading-relaxed italic
                               border-l border-border/60 pl-3">
                  &ldquo;{src.snippet.slice(0, 400)}{src.snippet.length > 400 ? "…" : ""}&rdquo;
                </p>
              )}

              {/* Link */}
              {resolveUri(src.uri) && (
                <a
                  href={resolveUri(src.uri)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-accent
                             hover:text-accent-hover transition-colors"
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {src.uri?.startsWith("gs://") ? "Apri documento" : "Documento originale"}
                </a>
              )}

              {/* Divider between sources */}
              {i < citation.sources.length - 1 && (
                <div className="border-b border-border/20 pt-1" />
              )}
            </div>
          ))}
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
