import { Link } from "react-router-dom";

/**
 * Timeline page — chronological reconstruction of the Moby Prince disaster.
 *
 * Status: scaffold / placeholder.
 * Data source (planned): GET /api/timeline/events → evidence.events (BigQuery)
 *
 * To activate:
 *   1. Create BigQuery evidence dataset (ingestion/scripts/bq-create-tables.sql)
 *   2. Populate evidence.events seed data (docs/evidence-model.md §Core events)
 *   3. Implement backend/routes/timeline.js
 *   4. Replace the empty state below with a real data fetch and TimelineView component
 */

const EVENT_TYPES = [
  { type: "navigation",     label: "Navigazione",     color: "bg-blue-900/40 text-blue-300 border-blue-700/40" },
  { type: "collision",      label: "Collisione",      color: "bg-red-900/40 text-red-300 border-red-700/40" },
  { type: "fire",           label: "Incendio",        color: "bg-orange-900/40 text-orange-300 border-orange-700/40" },
  { type: "rescue",         label: "Soccorso",        color: "bg-green-900/40 text-green-300 border-green-700/40" },
  { type: "communication",  label: "Comunicazioni",   color: "bg-purple-900/40 text-purple-300 border-purple-700/40" },
  { type: "administrative", label: "Amministrativo",  color: "bg-zinc-800/60 text-zinc-400 border-zinc-700/40" },
  { type: "judicial",       label: "Giudiziario",     color: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40" },
  { type: "parliamentary",  label: "Parlamentare",    color: "bg-accent/10 text-accent border-accent/20" },
];

const PHASES = [
  { label: "La notte del 10 aprile 1991", range: "21:00–24:00" },
  { label: "Operazioni di soccorso",      range: "11 apr 1991" },
  { label: "Inchieste e processo",        range: "1991–1999" },
  { label: "Revisione parlamentare",      range: "1997–2022" },
];

export default function Timeline() {
  return (
    <div className="min-h-screen bg-surface text-text-primary font-sans">
      {/* Top navigation */}
      <header className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-border/30 px-6 py-3
                         flex items-center gap-4">
        <Link to="/"
              className="flex items-center gap-1.5 text-text-muted hover:text-text-secondary transition-colors text-[13px]">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Chat
        </Link>

        <div className="h-4 w-px bg-border/50" />

        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h1 className="text-[14px] font-medium text-text-primary">Timeline degli eventi</h1>
        </div>

        <div className="ml-auto">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px]
                           bg-surface-raised border border-border/50 text-text-muted">
            BigQuery non collegato
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Empty state */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full
                          bg-surface-raised border border-border/50 mb-6">
            <svg className="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 className="font-serif text-xl text-text-primary mb-3">
            Timeline non ancora disponibile
          </h2>
          <p className="text-[13px] text-text-secondary max-w-md mx-auto leading-relaxed">
            La ricostruzione cronologica degli eventi richiede che il dataset strutturato
            BigQuery sia configurato e popolato. Vedi{" "}
            <code className="text-accent text-[12px]">docs/evidence-architecture.md</code>.
          </p>
        </div>

        {/* What will appear */}
        <div className="space-y-3 mb-12">
          <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.12em] mb-4">
            Cosa mostrerà questa vista
          </h3>

          {PHASES.map(({ label, range }) => (
            <div key={label}
                 className="flex items-start gap-4 p-4 rounded-xl bg-surface-raised border border-border/30">
              {/* Timeline line */}
              <div className="flex flex-col items-center flex-shrink-0 mt-1">
                <div className="w-2.5 h-2.5 rounded-full border-2 border-border bg-surface" />
                <div className="w-px flex-1 bg-border/30 mt-1 min-h-[20px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13px] text-text-secondary font-medium">{label}</span>
                  <span className="text-[11px] text-text-muted font-mono flex-shrink-0">{range}</span>
                </div>
                <div className="h-2 bg-surface rounded-full" />
              </div>
            </div>
          ))}
        </div>

        {/* Event type legend */}
        <div className="mb-10">
          <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.12em] mb-3">
            Tipi di evento
          </h3>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map(({ type, label, color }) => (
              <span key={type}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${color}`}>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Activation steps */}
        <div className="rounded-xl border border-border/40 bg-surface-raised overflow-hidden">
          <div className="px-5 py-3 border-b border-border/30 bg-surface-overlay">
            <h3 className="text-[12px] font-medium text-text-secondary">Per attivare questa vista</h3>
          </div>
          <ol className="divide-y divide-border/20">
            {[
              ["Crea il dataset BigQuery", "bq mk --location=EU --dataset ${PROJECT}:evidence"],
              ["Crea le tabelle", "ingestion/scripts/bq-create-tables.sql"],
              ["Popola gli eventi seed", "docs/evidence-model.md §Core events"],
              ["Implementa la route backend", "backend/routes/timeline.js → GET /api/timeline/events"],
              ["Sostituisci l'empty state", "Questa pagina — rimuovi il placeholder, aggiungi il fetch"],
            ].map(([step, detail], i) => (
              <li key={i} className="flex items-start gap-4 px-5 py-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-surface border border-border/50
                                 flex items-center justify-center text-[10px] text-text-muted font-mono mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] text-text-secondary">{step}</p>
                  <code className="text-[11px] text-accent/70">{detail}</code>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}
