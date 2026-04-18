import AnchorAvatar from "./AnchorAvatar";

const GROUP_LABELS = {
  today: "Oggi",
  yesterday: "Ieri",
  thisWeek: "Questa settimana",
  older: "Precedenti",
};

function ConversationItem({ conv, isActive, onSelect, onDelete }) {
  return (
    <div
      title={conv.title}
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  cursor-pointer transition-colors select-none
                  ${isActive
                    ? "bg-surface-raised text-text-primary border-l-2 border-accent pl-[10px]"
                    : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                  }`}
      onClick={() => onSelect(conv.id)}
    >
      <span className="flex-1 truncate">{conv.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conv.id);
        }}
        aria-label="Elimina conversazione"
        className="flex-shrink-0 p-0.5 rounded text-text-muted
                   opacity-0 group-hover:opacity-100 focus:opacity-100
                   hover:text-red-400 transition-all duration-150"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

export default function Sidebar({
  groupedConversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  isOpen,
  onClose,
}) {
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
          </button>
        </div>

        {/* Conversation list */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
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
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {Object.values(groupedConversations).every((g) => g.length === 0) && (
            <p className="px-3 py-8 text-xs text-text-muted text-center">
              Nessuna conversazione salvata.
            </p>
          )}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-text-muted">
            Camera dei Deputati · Uso riservato
          </p>
        </div>
      </aside>
    </>
  );
}
