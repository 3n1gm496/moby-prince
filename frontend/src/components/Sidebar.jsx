import { useState, useRef, useEffect } from "react";
import AnchorAvatar from "./AnchorAvatar";

const GROUP_LABELS = {
  today: "Oggi",
  yesterday: "Ieri",
  thisWeek: "Questa settimana",
  older: "Precedenti",
};

function ConversationItem({ conv, isActive, onSelect, onDelete, onRename }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.select();
    }
  }, [renaming]);

  const startRename = (e) => {
    e.stopPropagation();
    setDraft(conv.title);
    setRenaming(true);
  };

  const commitRename = () => {
    setRenaming(false);
    if (draft.trim() && draft.trim() !== conv.title) {
      onRename(conv.id, draft.trim());
    }
  };

  const handleRenameKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitRename(); }
    if (e.key === "Escape") { setRenaming(false); setDraft(conv.title); }
  };

  const citationCount = conv.messages.reduce((sum, m) => sum + (m.citations?.length ?? 0), 0);

  return (
    <div
      title={renaming ? undefined : conv.title}
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  cursor-pointer transition-colors select-none
                  ${isActive
                    ? "bg-surface-raised text-text-primary border-l-2 border-accent pl-[10px]"
                    : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                  }`}
      onClick={() => !renaming && onSelect(conv.id)}
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
          <span className="flex-1 truncate" onDoubleClick={startRename}>{conv.title}</span>

          {/* Citation count badge */}
          {citationCount > 0 && (
            <span className="flex-shrink-0 text-[10px] font-mono text-text-muted
                             opacity-0 group-hover:opacity-100 transition-opacity">
              {citationCount}
            </span>
          )}

          {/* Action buttons — rename + delete */}
          <span className="flex-shrink-0 flex items-center gap-0.5
                           opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  isOpen,
  onClose,
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  // Flatten all conversations for search
  const allConversations = Object.values(groupedConversations).flat();
  const isSearching = search.trim().length > 0;
  const filtered = isSearching
    ? allConversations.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.messages.some((m) => m.text?.toLowerCase().includes(search.toLowerCase()))
      )
    : null;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-40
          w-64 flex-shrink-0 flex flex-col
          bg-surface-sidebar border-r border-border
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <AnchorAvatar size="md" />
          <span className="font-serif text-sm font-semibold text-text-primary leading-tight">
            Archivio<br />Moby Prince
          </span>
        </div>

        {/* New chat button */}
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
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
          {isSearching ? (
            <section>
              <h3 className="px-3 py-1 text-xs font-medium text-text-muted uppercase tracking-wider">
                Risultati ({filtered.length})
              </h3>
              <div className="space-y-0.5">
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-text-muted text-center">Nessun risultato.</p>
                ) : (
                  filtered.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      isActive={conv.id === activeConversationId}
                      onSelect={(id) => { onSelectConversation(id); onClose(); setSearch(""); }}
                      onDelete={onDeleteConversation}
                      onRename={onRenameConversation}
                    />
                  ))
                )}
              </div>
            </section>
          ) : (
            <>
              {Object.entries(GROUP_LABELS).map(([key, label]) => {
                const group = groupedConversations[key];
                if (!group || group.length === 0) return null;
                return (
                  <section key={key}>
                    <h3 className="px-3 py-1 text-xs font-medium text-text-muted uppercase tracking-wider">
                      {label}
                    </h3>
                    <div className="space-y-0.5">
                      {group.map((conv) => (
                        <ConversationItem
                          key={conv.id}
                          conv={conv}
                          isActive={conv.id === activeConversationId}
                          onSelect={(id) => { onSelectConversation(id); onClose(); }}
                          onDelete={onDeleteConversation}
                          onRename={onRenameConversation}
                        />
                      ))}
                    </div>
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
