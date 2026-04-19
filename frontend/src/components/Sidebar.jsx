import { useState, useRef, useEffect, useCallback } from "react";
import AnchorAvatar from "./AnchorAvatar";

const GROUP_LABELS = {
  today: "Oggi",
  yesterday: "Ieri",
  thisWeek: "Questa settimana",
  older: "Precedenti",
};

function ConversationItem({ conv, isActive, onSelect, onDelete, onRename, onTogglePin, focused }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const inputRef = useRef(null);
  const itemRef = useRef(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    if (focused) itemRef.current?.focus();
  }, [focused]);

  const startRename = (e) => {
    e.stopPropagation();
    setDraft(conv.title);
    setRenaming(true);
  };

  const commitRename = () => {
    setRenaming(false);
    if (draft.trim() && draft.trim() !== conv.title) onRename(conv.id, draft.trim());
  };

  const handleRenameKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitRename(); }
    if (e.key === "Escape") { setRenaming(false); setDraft(conv.title); }
  };

  const citationCount = conv.messages.reduce((sum, m) => sum + (m.citations?.length ?? 0), 0);

  return (
    <div
      ref={itemRef}
      tabIndex={0}
      data-conv-item
      title={renaming ? undefined : conv.title}
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  cursor-pointer transition-colors select-none outline-none
                  focus-visible:ring-1 focus-visible:ring-accent/60
                  ${isActive
                    ? "bg-surface-raised text-text-primary border-l-2 border-accent pl-[10px]"
                    : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                  }`}
      onClick={() => !renaming && onSelect(conv.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !renaming) onSelect(conv.id);
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDelete(conv.id); }
      }}
    >
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleRenameKey}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-surface border border-accent/50 rounded px-1.5 py-0.5
                     text-sm text-text-primary outline-none focus:border-accent"
          maxLength={60}
        />
      ) : (
        <>
          <span className="flex-1 truncate">{conv.title}</span>

          {/* Citation count */}
          {citationCount > 0 && (
            <span className="flex-shrink-0 text-[10px] font-mono text-text-muted
                             opacity-0 group-hover:opacity-60 transition-opacity leading-none">
              {citationCount}
            </span>
          )}

          {/* Pinned indicator */}
          {conv.pinned && (
            <svg className="w-3 h-3 text-accent flex-shrink-0 opacity-60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
          )}

          {/* Action buttons */}
          <span className="flex-shrink-0 flex items-center gap-0.5
                           opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id); }}
              aria-label={conv.pinned ? "Sblocca conversazione" : "Fissa conversazione"}
              title={conv.pinned ? "Sblocca" : "Fissa in cima"}
              className={`p-0.5 rounded transition-colors ${conv.pinned ? "text-accent" : "text-text-muted hover:text-text-secondary"}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            <button
              onClick={startRename}
              aria-label="Rinomina conversazione"
              className="p-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              aria-label="Elimina conversazione"
              className="p-0.5 rounded text-text-muted hover:text-red-400 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </span>
        </>
      )}
    </div>
  );
}

export default function Sidebar({
  groupedConversations,
  pinnedConversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onTogglePin,
  isOpen,
  onClose,
}) {
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const searchRef = useRef(null);
  const navRef = useRef(null);

  const allConversations = [
    ...(pinnedConversations || []),
    ...Object.values(groupedConversations).flat(),
  ];

  const isSearching = search.trim().length > 0;
  const filtered = isSearching
    ? allConversations.filter(
        (c) =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.messages.some((m) => m.text?.toLowerCase().includes(search.toLowerCase()))
      )
    : null;

  // Keyboard navigation ↑↓ through conversation items
  const handleNavKeyDown = useCallback((e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = navRef.current?.querySelectorAll("[data-conv-item]");
      if (!items?.length) return;
      const arr = Array.from(items);
      const current = document.activeElement;
      const idx = arr.indexOf(current);
      if (e.key === "ArrowDown") {
        arr[Math.min(idx + 1, arr.length - 1)]?.focus();
      } else {
        if (idx <= 0) { searchRef.current?.focus(); return; }
        arr[Math.max(idx - 1, 0)]?.focus();
      }
    }
  }, []);

  const renderItem = (conv) => (
    <ConversationItem
      key={conv.id}
      conv={conv}
      isActive={conv.id === activeConversationId}
      onSelect={(id) => { onSelectConversation(id); onClose(); setSearch(""); }}
      onDelete={onDeleteConversation}
      onRename={onRenameConversation}
      onTogglePin={onTogglePin}
    />
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-40
          w-64 flex-shrink-0 flex flex-col
          bg-surface-sidebar border-r border-border
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 print:hidden
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <AnchorAvatar size="md" />
          <span className="font-serif text-sm font-semibold text-text-primary leading-tight">
            Archivio<br />Moby Prince
          </span>
        </div>

        {/* New chat */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={() => { onNewChat(); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                       text-text-secondary border border-border
                       hover:bg-surface-raised hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuova chat
            <span className="ml-auto text-[10px] text-text-muted font-mono opacity-60">⌘N</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
            </svg>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  navRef.current?.querySelector("[data-conv-item]")?.focus();
                }
              }}
              placeholder="Cerca conversazioni…"
              className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-1.5
                         text-xs text-text-primary placeholder-text-muted
                         focus:outline-none focus:border-accent/50 transition-colors"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Conversation list */}
        <nav ref={navRef} onKeyDown={handleNavKeyDown} className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
          {isSearching ? (
            <section>
              <h3 className="px-3 py-1 text-xs font-medium text-text-muted uppercase tracking-wider">
                Risultati ({filtered.length})
              </h3>
              <div className="space-y-0.5">
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-text-muted text-center">Nessun risultato.</p>
                ) : (
                  filtered.map(renderItem)
                )}
              </div>
            </section>
          ) : (
            <>
              {/* Pinned */}
              {pinnedConversations?.length > 0 && (
                <section>
                  <h3 className="px-3 py-1 text-xs font-medium text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    In evidenza
                  </h3>
                  <div className="space-y-0.5">
                    {pinnedConversations.map(renderItem)}
                  </div>
                </section>
              )}

              {/* Date groups */}
              {Object.entries(GROUP_LABELS).map(([key, label]) => {
                const group = groupedConversations[key];
                if (!group?.length) return null;
                return (
                  <section key={key}>
                    <h3 className="px-3 py-1 text-xs font-medium text-text-muted uppercase tracking-wider">
                      {label}
                    </h3>
                    <div className="space-y-0.5">{group.map(renderItem)}</div>
                  </section>
                );
              })}

              {allConversations.length === 0 && (
                <p className="px-3 py-8 text-xs text-text-muted text-center">
                  Nessuna conversazione salvata.
                </p>
              )}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-text-muted">Camera dei Deputati · Uso riservato</p>
        </div>
      </aside>
    </>
  );
}
