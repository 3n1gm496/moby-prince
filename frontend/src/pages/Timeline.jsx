import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import CitationPanel from "../components/CitationPanel";
import { apiFetch } from "../lib/apiFetch";
import { dateAccuracyLabel, sourceLocationLabel } from "../lib/sourceUtils";

const EVENT_TYPE_LABELS = {
  collision: "Collisione",
  fire: "Incendio",
  rescue: "Soccorsi",
  communication: "Comunicazioni",
  navigation: "Navigazione",
  administrative: "Amministrativo",
  judicial: "Giudiziario",
  parliamentary: "Parlamentare",
};

function typeLabel(eventType) {
  return EVENT_TYPE_LABELS[eventType] || eventType || "Evento";
}

function yearFromEvent(event) {
  if (event.date) return Number(event.date.slice(0, 4));
  const match = String(event.dateLabel || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function EventCard({ event, onSourceOpen }) {
  const dateLabel = dateAccuracyLabel(event.dateAccuracy);

  return (
    <article className="rounded-2xl border border-border bg-surface-raised p-4 md:p-5 space-y-4 surface-depth">
      <div className="flex flex-wrap items-start gap-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium border border-accent/20 bg-accent/10 text-accent">
          {typeLabel(event.eventType)}
        </span>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium border ${
          event.dateAccuracy === "exact"
            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
            : "border-amber-400/20 bg-amber-400/10 text-amber-300"
        }`}>
          {dateLabel}
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] text-text-secondary font-mono">{event.dateLabel}</p>
        <h2 className="text-[16px] md:text-[18px] font-semibold text-text-primary leading-snug">
          {event.title}
        </h2>
        {event.description && (
          <p className="text-[13px] md:text-[14px] text-text-secondary leading-relaxed">
            {event.description}
          </p>
        )}
      </div>

      <div className="border-t border-border/40 pt-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-2.5">Fonti</p>
        <div className="flex flex-col gap-2">
          {(event.sources || []).map((source, index) => (
            <button
              key={`${source.id || source.documentId || source.uri || index}-${index}`}
              onClick={() => onSourceOpen(event, index)}
              className="w-full text-left rounded-xl border border-border/50 bg-surface px-3 py-2.5 hover:border-accent/30 hover:bg-surface-hover transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="font-medium text-text-primary">
                  {source.title || source.documentId || "Documento"}
                </span>
                {sourceLocationLabel(source) && (
                  <span className="text-text-secondary font-mono text-[11px]">
                    {sourceLocationLabel(source)}
                  </span>
                )}
              </div>
              {source.snippet && (
                <p className="mt-1 text-[11px] text-text-secondary line-clamp-2">
                  {source.snippet}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function Timeline() {
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCitation, setActiveCitation] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch("/api/timeline/events");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setEvents(Array.isArray(data.events) ? data.events : []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) => {
      const haystack = [
        event.title,
        event.description,
        event.dateLabel,
        ...(event.sources || []).flatMap((source) => [source.title, source.snippet, source.pageReference]),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [events, search]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((event) => {
      const year = yearFromEvent(event) || "Data da verificare";
      if (!map.has(year)) map.set(year, []);
      map.get(year).push(event);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Data da verificare") return 1;
      if (b === "Data da verificare") return -1;
      return Number(a) - Number(b);
    });
  }, [filtered]);

  const openSource = (event, sourceIndex) => {
    const sources = [...(event.sources || [])];
    const selected = sources[sourceIndex];
    if (!selected) return;
    const reordered = [selected, ...sources.filter((_, index) => index !== sourceIndex)];
    setActiveCitation({
      id: event.id,
      sources: reordered,
    });
  };

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="sticky top-0 z-10 border-b border-border/30 bg-surface-sidebar/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
          <Link to="/" className="text-[12px] text-text-secondary hover:text-text-primary transition-colors">
            Consultazione
          </Link>
          <span className="text-border/60">·</span>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-text-primary">Timeline probatoria</h1>
            <p className="text-[11px] text-text-muted">
              Un solo flusso cronologico, eventi unificati e tutte le fonti visibili
            </p>
          </div>
          <div className="flex-1" />
          <div className="relative w-full sm:w-auto sm:min-w-[18rem]">
            <label htmlFor="timeline-search" className="sr-only">Cerca nella timeline</label>
            <input
              id="timeline-search"
              aria-label="Cerca nella timeline"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca eventi, fonti, pagine…"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-40 rounded-2xl bg-surface-raised animate-shimmer" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && grouped.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface-raised px-6 py-10 text-center">
            <p className="text-[14px] font-medium text-text-primary">Nessun evento trovato.</p>
            <p className="mt-1 text-[12px] text-text-secondary">
              Modifica la ricerca oppure completa il backfill della timeline strutturata.
            </p>
          </div>
        )}

        {!loading && !error && grouped.length > 0 && (
          <div className="space-y-10">
            {grouped.map(([year, yearEvents]) => (
              <section key={year} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-16 text-[28px] font-semibold tracking-tight text-text-primary">
                    {year}
                  </div>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
                <div className="space-y-4">
                  {yearEvents.map((event) => (
                    <EventCard key={event.id} event={event} onSourceOpen={openSource} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {activeCitation && (
        <CitationPanel citation={activeCitation} onClose={() => setActiveCitation(null)} />
      )}
    </div>
  );
}
