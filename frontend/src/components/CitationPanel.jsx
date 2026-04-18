import { useEffect, useRef } from "react";

export default function CitationPanel({ citation, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => { panelRef.current?.focus(); }, []);

  if (!citation) return null;

  return (
    <>
      {/* Backdrop — visible on mobile, transparent click-catcher on desktop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:bg-transparent"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-surface-sidebar border-l border-border
                   z-50 flex flex-col shadow-2xl outline-none animate-slide-up lg:animate-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="citation-badge">{citation.id}</span>
            <span className="text-sm font-semibold text-text-primary">Fonti della citazione</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi pannello"
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sources */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {citation.sources.length === 0 && (
            <p className="text-sm text-text-muted italic">Nessuna fonte dettagliata disponibile.</p>
          )}
          {citation.sources.map((src, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-overlay p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-accent leading-snug flex-1">{src.title}</h4>
                {src.pageIdentifier && (
                  <span className="text-xs text-text-muted font-mono whitespace-nowrap">
                    p.&nbsp;{src.pageIdentifier}
                  </span>
                )}
              </div>
              {src.snippet && (
                <blockquote className="text-xs text-text-secondary leading-relaxed border-l-2 border-accent/40 pl-3 italic mb-3">
                  &ldquo;{src.snippet.slice(0, 400)}{src.snippet.length > 400 ? "…" : ""}&rdquo;
                </blockquote>
              )}
              {src.uri && (
                <a
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover
                             transition-colors underline underline-offset-2"
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Apri documento originale
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border">
          <p className="text-xs text-text-muted">Archivio Documentale · Commissione Parlamentare d&apos;Inchiesta · Camera dei Deputati</p>
        </div>
      </aside>
    </>
  );
}
