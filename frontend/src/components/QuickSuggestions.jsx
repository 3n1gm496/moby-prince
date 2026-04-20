import { useState } from "react";

const SUGGESTIONS = [
  "Quali sono le conclusioni della Commissione parlamentare d'inchiesta?",
  "Qual è il numero ufficiale delle vittime accertate?",
  "Come si sviluppò la dinamica della collisione con la petroliera Agip Abruzzo?",
  "Quali responsabilità penali sono state accertate nei procedimenti giudiziari?",
  "Quali omissioni nei soccorsi sono emerse dagli atti istruttori?",
  "Quale ruolo ebbe la nebbia nelle cause del sinistro?",
  "Quali perizie tecniche sono state acquisite dalla Commissione?",
  "Quali erano le condizioni meteomarine nel porto di Livorno quella notte?",
];

export default function QuickSuggestions({ onSelect, disabled }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-4 pb-2">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 w-full py-1 text-[11px] font-medium
                   text-text-secondary hover:text-text-primary disabled:opacity-30
                   transition-colors"
      >
        <span className="uppercase tracking-[0.12em]">Domande frequenti</span>
        <svg
          className={`w-3 h-3 transition-transform duration-200 ml-auto ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className={`overflow-hidden transition-all duration-200 ease-out
                       ${open ? "max-h-96 opacity-100 mt-2" : "max-h-0 opacity-0"}`}>
        <div className="space-y-1">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => { onSelect(s); setOpen(false); }}
              disabled={disabled}
              className="w-full text-left flex items-center gap-2.5 px-0 py-1.5 group
                         disabled:opacity-30 disabled:cursor-not-allowed
                         focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 rounded"
            >
              <span className="text-text-secondary group-hover:text-accent transition-colors text-xs flex-shrink-0">
                →
              </span>
              <span className="text-sm text-text-primary group-hover:text-accent transition-colors leading-snug">
                {s}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
