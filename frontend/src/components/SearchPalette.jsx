import { useState, useEffect, useRef, useDeferredValue } from "react";

export default function SearchPalette({ conversations, onSelect, onClose, onNewChat }) {
  const [query, setQuery]   = useState("");
  const inputRef            = useRef(null);
  const listRef             = useRef(null);
  const deferredQuery       = useDeferredValue(query);
  const q                   = deferredQuery.toLowerCase().trim();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = q
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.text?.toLowerCase().includes(q))
      )
    : conversations.slice(0, 8);

  const handleListKeyDown = (e) => {
    const items = Array.from(listRef.current?.querySelectorAll("[data-result]") ?? []);
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(idx + 1, items.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx <= 0) inputRef.current?.focus();
      else items[Math.max(idx - 1, 0)]?.focus();
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      listRef.current?.querySelector("[data-result]")?.focus();
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-x-0 top-[15vh] z-50 flex justify-center px-4">
        <div className="w-full max-w-[520px] bg-surface-sidebar border border-border/60
                        rounded-xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
            <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Cerca conversazioni…"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted
                         focus:outline-none"
            />
            <kbd className="text-[10px] text-text-muted border border-border/50 rounded px-1.5 py-0.5 font-mono">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            onKeyDown={handleListKeyDown}
            className="max-h-[55vh] overflow-y-auto py-1.5"
          >
            {results.length === 0 && (
              <div className="px-4 py-6 text-center space-y-2.5">
                <p className="text-sm text-text-secondary">Nessuna conversazione trovata.</p>
                {onNewChat && (
                  <button
                    onClick={() => { onNewChat(); onClose(); }}
                    className="text-sm text-accent hover:text-accent-hover transition-colors"
                  >
                    Inizia una nuova chat →
                  </button>
                )}
              </div>
            )}
            {!q && results.length > 0 && (
              <p className="px-4 pb-1 text-[10px] text-text-muted uppercase tracking-wider">
                Recenti
              </p>
            )}
            {q && results.length > 0 && (
              <p className="px-4 pb-1 text-[10px] text-text-muted uppercase tracking-wider">
                {results.length} {results.length === 1 ? "risultato" : "risultati"}
              </p>
            )}
            {results.map((conv) => {
              const preview = conv.messages.find((m) => m.role === "assistant")?.text?.slice(0, 80) || "";
              return (
                <button
                  key={conv.id}
                  data-result
                  onClick={() => { onSelect(conv.id); onClose(); }}
                  className="w-full text-left flex items-start gap-3 px-4 py-2.5
                             hover:bg-surface-raised focus:bg-surface-raised outline-none
                             transition-colors group"
                >
                  <svg className="w-3.5 h-3.5 mt-0.5 text-text-muted flex-shrink-0 group-hover:text-accent transition-colors"
                       fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-text-primary truncate group-hover:text-accent transition-colors font-medium">
                      {conv.title}
                    </p>
                    {preview && (
                      <p className="text-[11px] text-text-secondary truncate mt-0.5">{preview}</p>
                    )}
                  </div>
                  <svg className="w-3 h-3 mt-0.5 text-text-muted opacity-0 group-hover:opacity-100 group-focus:opacity-100 flex-shrink-0 transition-opacity"
                       fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-border/20 flex items-center gap-3 text-[10px] text-text-muted">
            <span><kbd className="font-mono">↑↓</kbd> naviga</span>
            <span><kbd className="font-mono">↵</kbd> apri</span>
            <span><kbd className="font-mono">Esc</kbd> chiudi</span>
          </div>
        </div>
      </div>
    </>
  );
}
