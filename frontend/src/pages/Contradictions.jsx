import { Link } from "react-router-dom";

/**
 * Contradictions page — matrix of identified factual conflicts across the corpus.
 *
 * Status: scaffold / placeholder.
 * Data source (planned): GET /api/contradictions → evidence.contradictions (BigQuery)
 *
 * To activate:
 *   1. Populate evidence.claims and evidence.contradictions in BigQuery
 *   2. Implement backend/routes/contradictions.js
 *   3. Replace the empty state below with a data fetch and ContradictionList component
 *
 * See docs/evidence-architecture.md §Contradiction Matrix for query design.
 */

const CONTRADICTION_TYPES = [
  {
    type: "factual",
    label: "Fattuale",
    description: "Due documenti riportano valori incompatibili (orario, distanza, temperatura).",
    example: "Doc A: collisione alle 22:25 · Doc B: collisione alle 22:28",
    severity: "major",
  },
  {
    type: "temporal",
    label: "Temporale",
    description: "Due testimonianze danno sequenze incompatibili degli stessi eventi.",
    example: "Sequenza SOS secondo MRCC vs. sequenza secondo registro di bordo",
    severity: "significant",
  },
  {
    type: "testimonial",
    label: "Testimoniale",
    description: "Un testimone contraddice un altro sullo stesso fatto.",
    example: "Testimone A: il fumo era visibile · Testimone B: non si vedeva nulla",
    severity: "significant",
  },
  {
    type: "interpretive",
    label: "Interpretativo",
    description: "Due esperti traggono conclusioni opposte dagli stessi dati.",
    example: "Perito A: visibilità < 100 m · Perito B: visibilità > 500 m",
    severity: "minor",
  },
  {
    type: "procedural",
    label: "Procedurale",
    description: "I log ufficiali non corrispondono ai tempi dichiarati dai responsabili.",
    example: "Dichiarato intervento a T+2 min · Radio log mostra T+7 min",
    severity: "major",
  },
];

const SEVERITY_STYLE = {
  major:       "text-red-300 bg-red-900/30 border-red-700/30",
  significant: "text-yellow-300 bg-yellow-900/30 border-yellow-700/30",
  minor:       "text-zinc-400 bg-zinc-800/40 border-zinc-700/30",
};

const SEVERITY_LABEL = { major: "Grave", significant: "Rilevante", minor: "Minore" };

export default function Contradictions() {
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
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <h1 className="text-[14px] font-medium text-text-primary">Matrice delle contraddizioni</h1>
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
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>

          <h2 className="font-serif text-xl text-text-primary mb-3">
            Contraddizioni non ancora disponibili
          </h2>
          <p className="text-[13px] text-text-secondary max-w-md mx-auto leading-relaxed">
            La matrice delle contraddizioni richiede che le affermazioni estratte dai documenti
            siano caricate in BigQuery e le contraddizioni siano identificate — manualmente
            o tramite LLM. Vedi{" "}
            <code className="text-accent text-[12px]">docs/evidence-architecture.md</code>.
          </p>
        </div>

        {/* Contradiction type cards */}
        <div className="space-y-3 mb-10">
          <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.12em] mb-4">
            Tipi di contraddizione (schema)
          </h3>

          {CONTRADICTION_TYPES.map(({ type, label, description, example, severity }) => (
            <div key={type}
                 className="p-4 rounded-xl bg-surface-raised border border-border/30">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-text-primary">{label}</span>
                  <span className="text-[10px] font-mono text-text-muted">{type}</span>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px]
                                  font-medium border ${SEVERITY_STYLE[severity]}`}>
                  {SEVERITY_LABEL[severity]}
                </span>
              </div>
              <p className="text-[12px] text-text-secondary mb-2">{description}</p>
              <p className="text-[11px] text-text-muted font-mono border-l-2 border-border pl-2">
                {example}
              </p>
            </div>
          ))}
        </div>

        {/* What a contradiction row will look like */}
        <div className="mb-10">
          <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.12em] mb-4">
            Come apparirà ogni contraddizione
          </h3>
          <div className="rounded-xl border border-border/40 overflow-hidden opacity-40 pointer-events-none select-none">
            <div className="grid grid-cols-2 divide-x divide-border/40">
              <div className="p-4">
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1.5">Affermazione A</p>
                <p className="text-[13px] text-text-primary leading-relaxed mb-2">
                  "Il Moby Prince stava procedendo con scarsa visibilità a causa della nebbia fitta."
                </p>
                <p className="text-[10px] text-text-muted">Relazione RINA · 1991 · p. 47</p>
              </div>
              <div className="p-4">
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1.5">Affermazione B</p>
                <p className="text-[13px] text-text-primary leading-relaxed mb-2">
                  "La visibilità nella rada era superiore a 500 metri al momento della collisione."
                </p>
                <p className="text-[10px] text-text-muted">Perizia difesa · 1993 · p. 12</p>
              </div>
            </div>
            <div className="px-4 py-2.5 bg-surface-overlay border-t border-border/30
                            flex items-center justify-between">
              <span className="text-[11px] text-text-muted">Tipo: interpretativo · Gravità: rilevante · Stato: aperto</span>
              <span className="text-[10px] text-accent">Apri dettaglio →</span>
            </div>
          </div>
        </div>

        {/* Activation steps */}
        <div className="rounded-xl border border-border/40 bg-surface-raised overflow-hidden">
          <div className="px-5 py-3 border-b border-border/30 bg-surface-overlay">
            <h3 className="text-[12px] font-medium text-text-secondary">Per attivare questa vista</h3>
          </div>
          <ol className="divide-y divide-border/20">
            {[
              ["Crea tabelle BigQuery", "ingestion/scripts/bq-create-tables.sql"],
              ["Estrai affermazioni dai documenti", "Manuale o via Claude: evidence.claims INSERT"],
              ["Identifica le contraddizioni", "Manuale o LLM-flagged: evidence.contradictions INSERT"],
              ["Implementa la route backend", "backend/routes/contradictions.js → GET /api/contradictions"],
              ["Sostituisci l'empty state", "Rimuovi il placeholder, aggiungi il fetch e la lista"],
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
