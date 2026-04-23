import { useEffect, useMemo, useRef, useState } from "react";
import MediaPlayer from "./MediaPlayer";
import {
  titleFromUri,
  resolveSourceUri,
  inferMimeType,
  getPrimaryAnchor,
  listSourceAnchors,
  parsePageIdentifier,
  parseTimeIdentifier,
  sourceLocationLabel,
  formatTimeIdentifier,
  buildPdfUrl,
} from "../lib/sourceUtils";

function SourcePreview({ source }) {
  const mimeType = inferMimeType(source?.uri, source?.mimeType);
  const pageIdentifier = parsePageIdentifier(source);
  const seekTo = parseTimeIdentifier(source);
  const resolved = resolveSourceUri(source?.uri);

  if (!resolved || !mimeType) return null;

  if (mimeType === "application/pdf") {
    return (
      <iframe
        title={source.title || "Anteprima PDF"}
        src={buildPdfUrl(source.uri, pageIdentifier)}
        className="w-full rounded-xl border border-border/40 bg-white"
        style={{ height: "420px" }}
      />
    );
  }

  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
    return (
      <MediaPlayer
        uri={source.uri}
        mimeType={mimeType}
        seekTo={seekTo}
        shots={source.shots || []}
        transcript={source.transcript || ""}
      />
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <div className="rounded-xl border border-border/40 overflow-hidden bg-black/20">
        <img
          src={resolved}
          alt={source.title || "Anteprima immagine"}
          className="w-full max-h-[420px] object-contain"
        />
      </div>
    );
  }

  return null;
}

export default function CitationPanel({ citation, onClose }) {
  const panelRef = useRef(null);
  const touchStartX = useRef(null);
  const initialIndex = useMemo(() => 0, []);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useEffect(() => {
    const handleKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
    setSelectedIndex(0);
  }, [citation]);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    if (e.changedTouches[0].clientX - touchStartX.current > 80) onClose();
    touchStartX.current = null;
  };

  if (!citation) return null;

  const sources = citation.sources || [];
  const selectedSource = sources[selectedIndex] || sources[0] || null;
  const anchors = listSourceAnchors(selectedSource);
  const primaryAnchor = getPrimaryAnchor(selectedSource);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40 lg:bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Viewer della fonte"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="fixed right-0 top-0 bottom-0 w-full max-w-[38rem]
                   bg-surface-sidebar border-l border-border/50
                   z-50 flex flex-col outline-none print:hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <div className="flex items-center gap-2.5">
            <span className="citation-badge">{citation.id}</span>
            <div>
              <span className="block text-[13px] font-medium text-text-primary">
                {sources.length === 1 ? "Fonte" : "Fonti"}
              </span>
              <span className="block text-[10px] text-text-muted">
                Viewer unificato con ancoraggio alla fonte
              </span>
            </div>
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

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="w-full lg:w-[15rem] border-b lg:border-b-0 lg:border-r border-border/30 overflow-y-auto">
            <div className="p-3 space-y-2">
              {sources.length === 0 && (
                <p className="text-xs text-text-secondary italic">Nessuna fonte disponibile.</p>
              )}
              {sources.map((source, index) => {
                const locationLabel = sourceLocationLabel(source);
                return (
                  <button
                    key={`${source.documentId || source.uri || source.title || index}-${index}`}
                    onClick={() => setSelectedIndex(index)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                      index === selectedIndex
                        ? "border-accent/40 bg-accent/8"
                        : "border-border bg-surface-raised hover:border-border/80"
                    }`}
                  >
                    <p className="text-[12px] font-medium text-text-primary leading-snug">
                      {titleFromUri(source.uri) || source.title || "Documento"}
                    </p>
                    {locationLabel && (
                      <p className="text-[10px] text-text-secondary font-mono mt-1">
                        {locationLabel}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            {selectedSource && (
              <>
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-[14px] font-medium text-text-primary leading-snug flex-1">
                      {titleFromUri(selectedSource.uri) || selectedSource.title || "Documento"}
                    </h4>
                    {sourceLocationLabel(selectedSource) && (
                      <span className="text-[11px] text-text-secondary font-mono whitespace-nowrap flex-shrink-0 mt-0.5">
                        {sourceLocationLabel(selectedSource)}
                      </span>
                    )}
                  </div>

                  {(primaryAnchor?.textQuote || primaryAnchor?.snippet || selectedSource.snippet) && (
                    <p className="text-xs text-text-primary leading-relaxed italic border-l border-border/60 pl-3">
                      &ldquo;{(primaryAnchor?.textQuote || primaryAnchor?.snippet || selectedSource.snippet).slice(0, 700)}
                      {(primaryAnchor?.textQuote || primaryAnchor?.snippet || selectedSource.snippet).length > 700 ? "…" : ""}&rdquo;
                    </p>
                  )}
                </div>

                <SourcePreview source={selectedSource} />

                {anchors.length > 0 && (
                  <div className="rounded-xl border border-border/40 bg-surface-raised p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Ancore disponibili</p>
                    <div className="space-y-2">
                      {anchors.map((anchor) => (
                        <div key={anchor.id} className="rounded-lg border border-border/50 px-3 py-2 text-[11px] text-text-secondary">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-text-primary">
                              {sourceLocationLabel({ anchors: [anchor] }) || anchor.anchorType}
                            </span>
                            <span className="uppercase tracking-wide text-[10px] text-text-muted">
                              {anchor.anchorType}
                            </span>
                            {anchor.timeEndSeconds != null && anchor.timeStartSeconds != null && (
                              <span className="font-mono">
                                {formatTimeIdentifier(anchor.timeStartSeconds)}–{formatTimeIdentifier(anchor.timeEndSeconds)}
                              </span>
                            )}
                          </div>
                          {(anchor.textQuote || anchor.snippet) && (
                            <p className="mt-1.5 leading-relaxed italic text-text-primary">
                              &ldquo;{(anchor.textQuote || anchor.snippet).slice(0, 300)}
                              {(anchor.textQuote || anchor.snippet).length > 300 ? "…" : ""}&rdquo;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resolveSourceUri(selectedSource.uri) && (
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={buildPdfUrl(selectedSource.uri, parsePageIdentifier(selectedSource))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors"
                    >
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Apri alla fonte
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border/30">
          <p className="text-[10px] text-text-muted">
            Archivio Documentale · Camera dei Deputati
          </p>
        </div>
      </aside>
    </>
  );
}
