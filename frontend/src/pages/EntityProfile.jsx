import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import CitationPanel from "../components/CitationPanel";
import DocumentPanel from "../components/DocumentPanel";
import { apiFetch } from "../lib/apiFetch";
import { entityConfigFromSlug, entityConfigFromType } from "../lib/entityViews";
import { dateAccuracyLabel, sourceLocationLabel } from "../lib/sourceUtils";

function toTimelineCitation(event, sourceIndex) {
  const sources = [...(event.sources || [])];
  const selected = sources[sourceIndex];
  if (!selected) return null;
  return {
    id: event.id,
    sources: [selected, ...sources.filter((_, index) => index !== sourceIndex)],
  };
}

export default function EntityProfile() {
  const { entitySlug, entityId } = useParams();
  const config = entityConfigFromSlug(entitySlug);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCitation, setActiveCitation] = useState(null);
  const [activeDocument, setActiveDocument] = useState(null);

  useEffect(() => {
    if (!config || !entityId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/entities/${encodeURIComponent(entityId)}/context`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setPayload(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [config, entityId]);

  const documentPanelDoc = useMemo(() => {
    if (!activeDocument) return null;
    return {
      id: activeDocument.id,
      title: activeDocument.title,
      uri: activeDocument.uri,
      source: "listDocuments",
      metadata: {
        documentType: activeDocument.documentType,
        institution: activeDocument.institution,
        year: activeDocument.year,
      },
      metadataAvailable: {
        documentType: !!activeDocument.documentType,
        institution: !!activeDocument.institution,
        year: activeDocument.year != null,
      },
    };
  }, [activeDocument]);

  if (!config) return null;

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="sticky top-0 z-10 border-b border-border/30 bg-surface-sidebar/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
          <Link to={config.route} className="text-[12px] text-text-secondary hover:text-text-primary transition-colors">
            {config.plural}
          </Link>
          <span className="text-border/60">·</span>
          <span className="text-[12px] text-text-secondary">Profilo</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {loading && <div className="h-56 rounded-2xl bg-surface-raised animate-shimmer" />}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
            {error}
          </div>
        )}

        {!loading && payload && (
          <div className="space-y-8">
            <section className="rounded-3xl border border-border bg-surface-raised p-6 md:p-7 surface-depth">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium border border-accent/20 bg-accent/10 text-accent">
                    {config.singular}
                  </span>
                  {payload.totals && (
                    <span className="text-[11px] font-mono text-text-muted">
                      {payload.totals.documents} documenti · {payload.totals.claims} claim · {payload.totals.events} eventi
                    </span>
                  )}
                </div>
                <h1 className="text-[28px] md:text-[34px] font-semibold tracking-tight text-text-primary">
                  {payload.entity.canonicalName}
                </h1>
                {payload.entity.role && (
                  <p className="text-[14px] text-text-secondary">{payload.entity.role}</p>
                )}
                <p className="max-w-3xl text-[14px] leading-relaxed text-text-primary">
                  {payload.summary}
                </p>
                {payload.entity.aliases?.length > 0 && (
                  <p className="text-[12px] text-text-secondary">
                    Alias: {payload.entity.aliases.join(" · ")}
                  </p>
                )}
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-4">
              {[
                { label: "Documenti", value: payload.totals?.documents ?? 0 },
                { label: "Claim", value: payload.totals?.claims ?? 0 },
                { label: "Eventi", value: payload.totals?.events ?? 0 },
                { label: "Entità collegate", value: payload.totals?.relatedEntities ?? 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border bg-surface-raised px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{item.label}</p>
                  <p className="mt-1 text-[24px] font-semibold tracking-tight text-text-primary">{item.value}</p>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <h2 className="text-[15px] font-semibold">Documenti collegati</h2>
              {(payload.documents || []).length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface-raised px-4 py-5 text-[13px] text-text-secondary">
                  Nessun documento collegato disponibile nel layer strutturato.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(payload.documents || []).map((document) => (
                    <button
                      key={document.id}
                      onClick={() => setActiveDocument(document)}
                      className="rounded-2xl border border-border bg-surface-raised p-4 text-left hover:border-accent/30 transition-colors"
                    >
                      <p className="text-[14px] font-medium text-text-primary">{document.title}</p>
                      <p className="mt-1 text-[11px] text-text-secondary">
                        {[document.documentType, document.institution, document.year].filter(Boolean).join(" · ")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-[15px] font-semibold">Eventi collegati</h2>
              {(payload.events || []).length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface-raised px-4 py-5 text-[13px] text-text-secondary">
                  Nessun evento strutturato collegato a questa entità.
                </div>
              ) : (
                <div className="space-y-3">
                  {(payload.events || []).map((event) => (
                    <article key={event.id} className="rounded-2xl border border-border bg-surface-raised p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] text-text-secondary font-mono">{event.dateLabel || event.dateText || event.occurredAt || "Data da verificare"}</p>
                        <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-text-secondary">
                          {dateAccuracyLabel(event.dateAccuracy || event.datePrecision)}
                        </span>
                      </div>
                      <h3 className="mt-1 text-[15px] font-medium text-text-primary">{event.title}</h3>
                      {event.description && (
                        <p className="mt-2 text-[13px] text-text-secondary">{event.description}</p>
                      )}
                      {event.sources?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {event.sources.map((source, index) => (
                            <button
                              key={`${source.id || source.documentId || index}-${index}`}
                              onClick={() => setActiveCitation(toTimelineCitation(event, index))}
                              className="rounded-full border border-border px-3 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors"
                            >
                              {source.title || source.documentId || "Fonte"}
                              {sourceLocationLabel(source) ? ` · ${sourceLocationLabel(source)}` : ""}
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-[15px] font-semibold">Claim rilevanti</h2>
              {(payload.claims || []).length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface-raised px-4 py-5 text-[13px] text-text-secondary">
                  Nessun claim collegato disponibile.
                </div>
              ) : (
                <div className="space-y-3">
                  {(payload.claims || []).map((claim) => (
                    <article key={claim.id} className="rounded-2xl border border-border bg-surface-raised p-4">
                      <p className="text-[13px] leading-relaxed text-text-primary">{claim.text}</p>
                      <p className="mt-2 text-[11px] text-text-secondary">
                        {[claim.pageReference, claim.status, claim.claimType].filter(Boolean).join(" · ")}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-[15px] font-semibold">Entità collegate</h2>
              {(payload.relatedEntities || []).length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface-raised px-4 py-5 text-[13px] text-text-secondary">
                  Nessuna entità correlata con soglia alta disponibile al momento.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(payload.relatedEntities || []).map((related) => {
                    const relatedConfig = entityConfigFromType(related.entityType);
                    const relatedHref = relatedConfig
                      ? `${relatedConfig.route}/${encodeURIComponent(related.id)}`
                      : config.route;
                    const meta = [relatedConfig?.singular, related.role, `${related.coMentions || 0} co-citazioni`]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                    <Link
                      key={related.id}
                      to={relatedHref}
                      className="rounded-2xl border border-border bg-surface-raised p-4 hover:border-accent/30 transition-colors"
                    >
                      <p className="text-[14px] font-medium text-text-primary">{related.canonicalName}</p>
                      <p className="mt-1 text-[11px] text-text-secondary">{meta}</p>
                    </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {activeCitation && (
        <CitationPanel citation={activeCitation} onClose={() => setActiveCitation(null)} />
      )}

      {documentPanelDoc && (
        <DocumentPanel doc={documentPanelDoc} onClose={() => setActiveDocument(null)} />
      )}
    </div>
  );
}
