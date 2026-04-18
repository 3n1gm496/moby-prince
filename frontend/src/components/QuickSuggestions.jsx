const SUGGESTIONS = [
  "Quali sono le conclusioni della Commissione parlamentare d'inchiesta sul naufragio?",
  "Qual è il numero ufficiale delle vittime accertate e la loro identità?",
  "Quali erano le condizioni meteomarine nel porto di Livorno nella notte del 10 aprile 1991?",
  "Come si sviluppò la dinamica della collisione tra il Moby Prince e la petroliera Agip Abruzzo?",
  "Quali responsabilità penali sono state accertate nei procedimenti giudiziari?",
  "Quali omissioni nei soccorsi sono emerse dagli atti istruttori?",
  "Quale ruolo ebbe la nebbia e la visibilità ridotta nelle cause del sinistro?",
  "Quali perizie tecniche sono state acquisite dalla Commissione?",
];

export default function QuickSuggestions({ onSelect, disabled }) {
  return (
    <div className="px-4 pb-4">
      <p className="text-xs font-medium text-text-muted uppercase tracking-widest mb-3">
        Domande frequenti
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            disabled={disabled}
            className="text-xs px-3 py-1.5 rounded-full border border-border bg-surface-raised
                       text-text-secondary hover:border-accent hover:text-accent hover:bg-surface-overlay
                       transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
