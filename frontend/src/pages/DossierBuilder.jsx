import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDossier } from "../hooks/useDossier";
import { getFilterValueLabel } from "../filters/schema";
import DocumentPanel from "../components/DocumentPanel";

// ── Metadata badge keys shown on each card ────────────────────────────────────
const CARD_META = ["documentType", "year", "institution"];

// ── DocumentCard ─────────────────────────────────────────────────────────────

function DocumentCard({ doc, onClick }) {
  const cleanTitle = doc.title
    ? doc.title.replace(/^moby\s+prince\s*[-–—:·]\s*/i, "").trim() || doc.title
    : null;

  const hasMeta = doc.metadataAvailable &&
    CARD_META.some((k) => doc.metadataAvailable[k]);

  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-xl border border-border bg-surface-raised
                 px-4 py-3.5 hover:border-accent/40 hover:bg-surface-raised
                 transition-colors duration-150 group flex flex-col gap-2"
    >
      {/* Title */}
      <p className="text-[13px] font-medium text-text-primary leading-snug
                    group-hover:text-accent transition-colors line-clamp-3">
        {cleanTitle || <span className="text-text-muted italic">{doc.id}</span>}
      </p>

      {/* Metadata badges */}
      {hasMeta && (
        <div className="flex flex-wrap gap-1">
          {CARD_META.map((key) => {
            if (!doc.metadataAvailable?.[key]) return null;
            const val = doc.metadata?.[key];
            return (
              <span key={key}
                    className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-medium
                               border bg-surface text-text-secondary border-border">
                {getFilterValueLabel(key, val)}
              </span>
            );
          })}
        </div>
      )}

      {/* Snippet (search fallback mode) */}
      {doc.snippet && (
        <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2 italic">
          {doc.snippet}
        </p>
      )}

      {/* Chunks indicator */}
      {doc.hasChunks && (
        <span className="text-[10px] text-accent/70 flex items-center gap-1 mt-auto">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Frammenti disponibili
        </span>
      )}
    </button>
  );
}

// ── Skeleton grid ─────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface-raised px-4 py-3.5 space-y-2.5">
          <div className="h-3 bg-surface rounded-full w-3/4 animate-shimmer" />
          <div className="h-3 bg-surface rounded-full w-1/2 animate-shimmer" />
          <div className="h-2.5 bg-surface rounded-full w-1/4 animate-shimmer" />
        </div>
      ))}
    </div>
  );
}

// ── DossierBuilder ────────────────────────────────────────────────────────────

export default function DossierBuilder() {
  const { documents, pagination, mode, warning, loading, error, initialized, load, loadMore } = useDossier();
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Load on mount
  useEffect(() => { load(); }, [load]);

  const totalLabel = pagination.total != null
    ? `${pagination.total} documenti`
    : initialized ? `${documents.length} documenti` : null;

  return (
    <div className="min-h-screen bg-surface flex flex-col">

      {/* Top bar */}
      <header className="flex-shrink-0 border-b border-border/30 bg-surface-sidebar/80
                         backdrop-blur-md sticky top-0 z-10 print:hidden">
        <div className="max-w-[1100px] mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-[11px] text-text-secondary
                         hover:text-text-primary transition-colors flex-shrink-0"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Consultazione
            </Link>
            <span className="text-border/60">·</span>
            <div className="min-w-0">
              <h1 className="text-[13px] font-semibold text-text-primary leading-none">
                Dossier documenti
              </h1>
              <p className="text-[10px] text-text-muted mt-0.5 leading-none">
                Archivio documentale indicizzato · dati diretti da Discovery Engine
              </p>
            </div>
          </div>

          {/* Document count */}
          {totalLabel && (
            <span className="text-[11px] text-text-secondary flex-shrink-0 tabular-nums">
              {totalLabel}
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-[1100px] mx-auto w-full px-5 py-6">

        {/* Warning banner (searchFallback mode) */}
        {warning && (
          <div className="mb-5 flex items-start gap-2.5 px-4 py-3 rounded-xl
                          bg-surface-raised border border-border text-[11px] text-text-secondary">
            <svg className="w-3.5 h-3.5 flex-shrink-0 mt-px text-text-muted" fill="none"
                 stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{warning}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-xl
                          bg-error-bg border border-error-border text-[12px] text-error-text">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
            <button onClick={() => load()}
                    className="ml-auto underline hover:no-underline transition-all text-[11px]">
              Riprova
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !initialized && <SkeletonGrid />}

        {/* Empty state */}
        {initialized && !loading && documents.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <svg className="w-10 h-10 text-text-muted/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-text-secondary">Nessun documento trovato.</p>
          </div>
        )}

        {/* Document grid */}
        {documents.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onClick={() => setSelectedDoc(doc)}
                />
              ))}
            </div>

            {/* Load more */}
            {pagination.hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm
                             border border-border text-text-secondary
                             hover:text-text-primary hover:border-accent/40
                             disabled:opacity-40 disabled:cursor-not-allowed
                             transition-colors"
                >
                  {loading
                    ? <><span className="w-3 h-3 rounded-full border-2 border-text-muted/40
                                          border-t-text-primary animate-spin" />
                        Caricamento…</>
                    : <>Carica altri documenti</>
                  }
                </button>
              </div>
            )}

            {/* End of list */}
            {!pagination.hasMore && initialized && documents.length > 0 && (
              <p className="text-center text-[11px] text-text-muted mt-8">
                {documents.length} {documents.length === 1 ? "documento" : "documenti"} — fine dell&apos;archivio
              </p>
            )}
          </>
        )}
      </main>

      {/* Document detail panel */}
      {selectedDoc && (
        <DocumentPanel doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}
    </div>
  );
}
