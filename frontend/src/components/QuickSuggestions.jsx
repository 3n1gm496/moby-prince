import { useState, useRef, useCallback } from "react";

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
  const listRef    = useRef(null);
  const toggleRef  = useRef(null);

  const handleSelect = useCallback((s) => {
    onSelect(s);
    setOpen(false);
    toggleRef.current?.focus();
  }, [onSelect]);

  // Improvement #3: keyboard navigation within the suggestion list.
  const handleListKeyDown = (e) => {
    const items = Array.from(listRef.current?.querySelectorAll("button[data-suggestion]") ?? []);
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(idx + 1, items.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx <= 0) toggleRef.current?.focus();
      else items[Math.max(idx - 1, 0)]?.focus();
    } else if (e.key === "Escape") {
      setOpen(false);
      toggleRef.current?.focus();
    }
  };

  const handleToggleKeyDown = (e) => {
    if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      listRef.current?.querySelector("button[data-suggestion]")?.focus();
    }
  };

  return (
    <div className="px-4 pb-2">
      <button
        ref={toggleRef}
        onClick={() => setOpen(v => !v)}
        onKeyDown={handleToggleKeyDown}
        disabled={disabled}
        aria-expanded={open}
        aria-controls="quick-suggestions-list"
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

      <div
        id="quick-suggestions-list"
        role="listbox"
        className={`overflow-hidden transition-all duration-200 ease-out
                     ${open ? "max-h-96 opacity-100 mt-2" : "max-h-0 opacity-0"}`}
      >
        <div ref={listRef} className="space-y-1" onKeyDown={handleListKeyDown}>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              data-suggestion
              role="option"
              onClick={() => handleSelect(s)}
              disabled={disabled}
              className="w-full text-left flex items-center gap-2.5 px-0 py-1.5 group
                         disabled:opacity-30 disabled:cursor-not-allowed
                         focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 rounded"
            >
              <span className="text-text-secondary group-hover:text-accent group-focus:text-accent transition-colors text-xs flex-shrink-0">
                →
              </span>
              <span className="text-sm text-text-primary group-hover:text-accent group-focus:text-accent transition-colors leading-snug">
                {s}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
