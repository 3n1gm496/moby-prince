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
    <div className="w-full max-w-[760px] px-5 pb-6">
      <p className="text-[10px] text-text-muted/60 uppercase tracking-[0.18em] text-center mb-3">
        Domande frequenti
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            disabled={disabled}
            className="text-left px-3.5 py-2.5 rounded-xl
                       border border-border/40 bg-surface-raised/20
                       hover:bg-surface-raised/70 hover:border-border/70
                       active:scale-[0.99] transition-all duration-150 group
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="text-[12px] text-text-secondary group-hover:text-text-primary
                             leading-snug transition-colors line-clamp-2">
              {s}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
