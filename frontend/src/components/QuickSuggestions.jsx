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
  return (
    <div className="px-4 pb-2">
      <p className="text-[11px] font-medium text-text-secondary uppercase tracking-[0.12em] mb-3">
        Domande frequenti
      </p>
      <div className="space-y-0.5">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            disabled={disabled}
            className="w-full text-left flex items-start gap-2.5 px-0 py-1.5 group
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="text-text-secondary group-hover:text-accent transition-colors
                             mt-px text-xs leading-5 flex-shrink-0">→</span>
            <span className="text-sm text-text-primary group-hover:text-accent
                             transition-colors leading-snug">
              {s}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
