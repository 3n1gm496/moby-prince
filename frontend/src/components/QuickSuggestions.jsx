const SUGGESTIONS = [
  "Quali sono le conclusioni della commissione parlamentare d'inchiesta?",
  "Quante vittime ci furono nel disastro del Moby Prince?",
  "Quali erano le condizioni meteorologiche la notte del 10 aprile 1991?",
  "Come avvenne la collisione tra il Moby Prince e l'Agip Abruzzo?",
  "Chi era il comandante del Moby Prince?",
  "Quali irregolarità emersero nelle indagini successive?",
];

export default function QuickSuggestions({ onSelect, disabled }) {
  return (
    <div className="px-4 pb-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mb-3">
        Domande frequenti
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            disabled={disabled}
            className="text-xs px-3 py-1.5 rounded-full border border-navy-600 bg-navy-800/60
                       text-slate-300 hover:border-brand-500 hover:text-brand-400 hover:bg-navy-700
                       transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed
                       text-left"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
