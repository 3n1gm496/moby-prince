import { Link } from "react-router-dom";

/**
 * Dossier Builder page — curated workspace for assembling investigative evidence.
 *
 * Status: scaffold / placeholder.
 * Data source (planned):
 *   POST /api/dossier           → create dossier
 *   GET  /api/dossier/:id       → load dossier
 *   PUT  /api/dossier/:id/items → add/reorder evidence items
 *
 * To activate:
 *   1. Add evidence.dossiers table to BigQuery (extend bq-create-tables.sql)
 *   2. Implement backend/routes/dossier.js
 *   3. Replace the placeholder with the split-pane workspace below
 *
 * See docs/evidence-architecture.md §Dossier Builder for the data model.
 */

const ITEM_TYPES = [
  {
    type: "chunk",
    label: "Frammento di testo",
    description: "Un passaggio estratto direttamente dal corpus (con citazione alla fonte).",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    type: "claim",
    label: "Affermazione",
    description: "Un'affermazione fattuale estratta e validata dall'analista.",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    type: "note",
    label: "Nota dell'analista",
    description: "Testo libero scritto dall'analista per collegare o commentare gli elementi.",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
];

const EXAMPLE_DOSSIER_ITEMS = [
  { type: "note",  content: "Ricostruzione del ritardo nei soccorsi — 10 aprile 1991" },
  { type: "chunk", content: "«Il MRCC di Livorno ricevette la prima segnalazione alle 22:32...»", source: "MRCC log, 1991" },
  { type: "claim", content: "I soccorsi arrivarono con almeno 45 minuti di ritardo rispetto al protocollo.", status: "contradicted" },
  { type: "note",  content: "Confrontare con: Dichiarazione del comandante della Guardia Costiera (Commissione XVIII, 2021)" },
  { type: "chunk", content: "«La prima motovedetta giunse sul posto alle 23:17, conforme ai tempi standard...»", source: "Guardia Costiera, 2021" },
];

const CLAIM_STATUS_STYLE = {
  unverified:   "text-text-muted border-border/50",
  corroborated: "text-green-400 border-green-700/40",
  contradicted: "text-red-400 border-red-700/40",
};

export default function DossierBuilder() {
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h1 className="text-[14px] font-medium text-text-primary">Costruttore di dossier</h1>
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          <h2 className="font-serif text-xl text-text-primary mb-3">
            Costruttore di dossier non ancora disponibile
          </h2>
          <p className="text-[13px] text-text-secondary max-w-md mx-auto leading-relaxed">
            Il dossier builder richiede il layer strutturato BigQuery per salvare
            e recuperare i dossier. Una volta attivato, permetterà di assemblare
            prove, affermazioni e note in un argomento investigativo strutturato.
          </p>
        </div>

        {/* Concept: what a dossier contains */}
        <div className="mb-10">
          <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.12em] mb-4">
            Tipi di elemento nel dossier
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ITEM_TYPES.map(({ type, label, description, icon }) => (
              <div key={type} className="p-4 rounded-xl bg-surface-raised border border-border/30">
                <div className="flex items-center gap-2 mb-2 text-text-secondary">{icon}
                  <span className="text-[13px] font-medium">{label}</span>
                </div>
                <p className="text-[12px] text-text-muted leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Concept: example dossier preview */}
        <div className="mb-10">
          <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-[0.12em] mb-4">
            Esempio di dossier (anteprima struttura)
          </h3>
          <div className="rounded-xl border border-border/40 overflow-hidden opacity-40 pointer-events-none select-none">
            <div className="px-5 py-3 border-b border-border/30 bg-surface-overlay flex items-center justify-between">
              <span className="text-[13px] font-medium text-text-primary">Ritardo nei soccorsi</span>
              <span className="text-[10px] text-text-muted">Bozza · 5 elementi</span>
            </div>
            <div className="divide-y divide-border/20">
              {EXAMPLE_DOSSIER_ITEMS.map((item, i) => (
                <div key={i} className="px-5 py-3 flex items-start gap-3">
                  <span className="flex-shrink-0 mt-0.5 text-text-muted">
                    {item.type === "chunk" && (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    {item.type === "claim" && (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    )}
                    {item.type === "note" && (
                      <svg className="w-3.5 h-3.5 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] ${item.type === "note" ? "text-accent/70 italic" : "text-text-secondary"}`}>
                      {item.content}
                    </p>
                    {item.source && (
                      <p className="text-[10px] text-text-muted mt-0.5">{item.source}</p>
                    )}
                    {item.status && (
                      <span className={`inline-block mt-0.5 text-[10px] border rounded px-1.5 py-px ${CLAIM_STATUS_STYLE[item.status] || CLAIM_STATUS_STYLE.unverified}`}>
                        {item.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-2.5 bg-surface-overlay border-t border-border/30 flex items-center gap-3">
              <button className="text-[11px] text-accent/70 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Esporta PDF
              </button>
              <button className="text-[11px] text-text-muted flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Condividi
              </button>
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
              ["Aggiungi tabella evidence.dossiers", "Estendi ingestion/scripts/bq-create-tables.sql"],
              ["Implementa la route backend", "backend/routes/dossier.js → POST/GET/PUT /api/dossier"],
              ["Aggiungi pulsante 'Aggiungi al dossier'", "ChatInterface.jsx, EvidenceSection.jsx — per i chunk"],
              ["Implementa la workspace split-pane", "Questa pagina — chat a sinistra, dossier a destra"],
              ["Aggiungi esportazione PDF", "Cloud Run worker con puppeteer o @react-pdf/renderer"],
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
