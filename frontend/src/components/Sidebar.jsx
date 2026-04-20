import { useState, useRef, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import AnchorAvatar from "./AnchorAvatar";

const PAGE_SIZE = 10;
const MIN_WIDTH  = 180;
const MAX_WIDTH  = 420;
const DEFAULT_WIDTH = 240;

const ANALYSIS_VIEWS = [
  {
    to:        "/dossier",
    label:     "Dossier",
    available: true,
    icon: (
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to:        "/timeline",
    label:     "Timeline",
    available: true,
    icon: (
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
];

const GROUP_LABELS = {
  today:    "Oggi",
  yesterday:"Ieri",
  thisWeek: "Questa settimana",
  older:    "Precedenti",
};

function ConversationItem({ conv, isActive, onSelect, onDelete, onRename, onTogglePin }) {
  const [renaming, setRenaming] = useState(false);
  const [draft,    setDraft]    = useState(conv.title);
  const inputRef = useRef(null);

  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);

  const startRename = (e) => { e.stopPropagation(); setDraft(conv.title); setRenaming(true); };
  const commitRename = () => {
    setRenaming(false);
    if (draft.trim() && draft.trim() !== conv.title) onRename(conv.id, draft.trim());
    else setDraft(conv.title);
  };
  const handleRenameKey = (e) => {
    if (e.key === "Enter")  { e.preventDefault(); commitRename(); }
    if (e.key === "Escape") { setRenaming(false); setDraft(conv.title); }
  };

  const citCount = conv.messages.reduce((s, m) => s + (m.citations?.length ?? 0), 0);

  return (
    <div
      tabIndex={0}
      data-conv-item
      title={renaming ? undefined : conv.title}
      onClick={() => !renaming && onSelect(conv.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter"  && !renaming) onSelect(conv.id);
        if ((e.key === "Delete" || e.key === "Backspace") && !renaming) {
          e.preventDefault(); onDelete(conv.id);
        }
      }}
      className={`group relative flex items-center gap-2 px-[10px] py-2 rounded-lg text-[13px]
                  border-l-[2px] cursor-pointer select-none outline-none
                  transition-colors duration-150
                  focus-visible:ring-1 focus-visible:ring-accent/40
                  ${isActive
                    ? "border-accent text-text-primary font-medium bg-surface-raised/40"
                    : "border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-raised/30"
                  }`}
    >
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleRenameKey}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-surface-raised border border-accent/40 rounded px-1.5 py-0.5
                     text-[13px] text-text-primary outline-none focus:border-accent transition-colors"
          maxLength={60}
        />
      ) : (
        <>
          <span className="flex-1 truncate">{conv.title}</span>

          {citCount > 0 && (
            <span className="flex-shrink-0 text-[10px] font-mono text-text-muted
                             opacity-0 group-hover:opacity-50 transition-opacity">
              {citCount}
            </span>
          )}

          {conv.pinned && (
            <svg className="w-2.5 h-2.5 text-accent/50 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
          )}

          <span className="flex-shrink-0 flex items-center gap-0.5
                           opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id); }}
                    aria-label={conv.pinned ? "Sblocca" : "Fissa in cima"}
                    className={`p-0.5 rounded transition-colors
                                ${conv.pinned ? "text-accent" : "text-text-muted hover:text-text-secondary"}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            <button onClick={startRename} aria-label="Rinomina"
                    className="p-0.5 rounded text-text-muted hover:text-text-secondary transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    aria-label="Elimina"
                    className="p-0.5 rounded text-text-muted hover:text-error-text transition-colors">
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
  groupedConversations, pinnedConversations,
  activeConversationId,
  onNewChat, onSelectConversation, onDeleteConversation,
  onRenameConversation, onTogglePin,
  isOpen, onClose,
}) {
  const [search,        setSearch]        = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});
  const [collapsed,     setCollapsed]     = useState(false);
  const [sidebarWidth,  setSidebarWidth]  = useState(DEFAULT_WIDTH);
  const [isResizing,    setIsResizing]    = useState(false);

  const searchRef = useRef(null);
  const navRef    = useRef(null);

  // When mobile overlay opens, always expand
  useEffect(() => {
    if (isOpen) setCollapsed(false);
  }, [isOpen]);

  const allConvs = [...(pinnedConversations || []), ...Object.values(groupedConversations).flat()];
  const isSearching = search.trim().length > 0;
  const q = search.toLowerCase();

  const filtered = isSearching
    ? allConvs.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) =>
          m.text?.toLowerCase().includes(q) ||
          m.citations?.some((cit) =>
            cit.sources?.some((s) =>
              s.snippet?.toLowerCase().includes(q) ||
              s.title?.toLowerCase().includes(q)
            )
          ) ||
          m.evidence?.some((ev) =>
            ev.snippet?.toLowerCase().includes(q) ||
            ev.title?.toLowerCase().includes(q)
          )
        )
      )
    : null;

  const handleNavKey = useCallback((e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(navRef.current?.querySelectorAll("[data-conv-item]") ?? []);
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") items[Math.min(idx + 1, items.length - 1)]?.focus();
    else if (idx <= 0)         searchRef.current?.focus();
    else                       items[Math.max(idx - 1, 0)]?.focus();
  }, []);

  // ── Drag-to-resize ──────────────────────────────────────────────────────────

  const handleResizeStart = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX     = e.clientX;
    const startWidth = sidebarWidth;
    setIsResizing(true);
    document.body.style.cursor    = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (e) => {
      const newW = startWidth + (e.clientX - startX);
      if (newW < 100) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
        setSidebarWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newW)));
      }
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor    = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderItem = (conv) => (
    <ConversationItem
      key={conv.id} conv={conv}
      isActive={conv.id === activeConversationId}
      onSelect={(id) => { onSelectConversation(id); onClose(); setSearch(""); }}
      onDelete={onDeleteConversation}
      onRename={onRenameConversation}
      onTogglePin={onTogglePin}
    />
  );

  const renderGroup = (key, convs) => {
    const isExpanded = expandedGroups[key];
    const visible    = isExpanded ? convs : convs.slice(0, PAGE_SIZE);
    const remaining  = convs.length - PAGE_SIZE;

    return (
      <div className="space-y-0.5">
        {visible.map(renderItem)}
        {!isExpanded && remaining > 0 && (
          <button
            onClick={() => setExpandedGroups((prev) => ({ ...prev, [key]: true }))}
            className="w-full text-left px-[10px] py-1.5 text-[11px] text-text-muted
                       hover:text-text-secondary transition-colors rounded-lg"
          >
            Mostra altre {remaining}…
          </button>
        )}
        {isExpanded && convs.length > PAGE_SIZE && (
          <button
            onClick={() => setExpandedGroups((prev) => ({ ...prev, [key]: false }))}
            className="w-full text-left px-[10px] py-1.5 text-[11px] text-text-muted
                       hover:text-text-secondary transition-colors rounded-lg"
          >
            Mostra meno
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/70 z-30 lg:hidden backdrop-blur-sm"
             onClick={onClose} />
      )}

      <aside
        style={{ width: collapsed ? "56px" : `${sidebarWidth}px` }}
        className={`
          fixed lg:relative inset-y-0 left-0 z-40
          flex-shrink-0 flex flex-col overflow-hidden
          bg-surface-sidebar border-r border-border/50
          ${isResizing ? "" : "transition-[width] duration-200 ease-in-out"}
          ${isOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 print:hidden
        `}
      >

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className={`flex items-center border-b border-border/30
                         ${collapsed ? "flex-col py-2.5 px-1.5 gap-2" : "gap-2.5 px-4 py-3.5"}`}>
          {/* Logo / new-chat */}
          <button
            onClick={() => { onNewChat(); onClose(); }}
            title="Nuova chat"
            className={`rounded-lg hover:bg-surface-raised/50 transition-colors flex-shrink-0
                        ${collapsed ? "p-1" : ""}`}
          >
            <AnchorAvatar size="md" />
          </button>

          {/* Wordmark — hidden when collapsed */}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <span className="block font-serif text-[13px] font-semibold text-text-primary leading-tight truncate">
                Archivio Moby Prince
              </span>
              <span className="block text-[10px] text-text-muted leading-tight mt-0.5">
                Commissione Parlamentare
              </span>
            </div>
          )}

          {/* Collapse / expand toggle — desktop only */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
            aria-label={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
            className="hidden lg:flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0
                       text-text-muted hover:text-text-secondary hover:bg-surface-raised/50
                       transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
            </svg>
          </button>
        </div>

        {/* ── Main content — hidden when collapsed (desktop) ─────────────────── */}
        {!collapsed && (
          <>
            {/* New chat */}
            <div className="px-3 pt-3 pb-1">
              <button
                onClick={() => { onNewChat(); onClose(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px]
                           text-text-secondary hover:text-text-primary transition-colors duration-100"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nuova chat
              </button>
            </div>

            {/* Search */}
            <div className="px-3 pb-2">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none"
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
                  placeholder="Cerca titoli e citazioni…"
                  className="w-full bg-transparent border border-border/40 rounded-lg
                             pl-7 pr-3 py-1.5 text-[12px] text-text-primary placeholder-text-muted
                             focus:outline-none focus:border-accent/30 transition-colors"
                />
                {search && (
                  <button onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2
                                     text-text-muted hover:text-text-secondary transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Conversations */}
            <nav ref={navRef} onKeyDown={handleNavKey} className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
              {isSearching ? (
                <section>
                  <h3 className="px-[10px] pt-1 pb-1.5 text-[10px] font-medium text-text-secondary uppercase tracking-[0.12em]">
                    {filtered.length} risultati
                  </h3>
                  <div className="space-y-0.5">
                    {filtered.length === 0
                      ? <p className="px-[10px] py-6 text-xs text-text-secondary text-center">Nessun risultato.</p>
                      : filtered.map(renderItem)
                    }
                  </div>
                </section>
              ) : (
                <>
                  {pinnedConversations?.length > 0 && (
                    <section>
                      <h3 className="px-[10px] pt-1 pb-1.5 text-[10px] font-medium text-text-muted uppercase tracking-[0.12em]">
                        In evidenza
                      </h3>
                      {renderGroup("pinned", pinnedConversations)}
                    </section>
                  )}

                  {Object.entries(GROUP_LABELS).map(([key, label]) => {
                    const group = groupedConversations[key];
                    if (!group?.length) return null;
                    return (
                      <section key={key}>
                        <h3 className="px-[10px] pt-1 pb-1.5 text-[10px] font-medium text-text-muted uppercase tracking-[0.12em]">
                          {label}
                        </h3>
                        {renderGroup(key, group)}
                      </section>
                    );
                  })}

                  {allConvs.length === 0 && (
                    <p className="px-[10px] py-6 text-xs text-text-secondary text-center">
                      Nessuna conversazione salvata.
                    </p>
                  )}
                </>
              )}
            </nav>

            {/* Analysis views — sticky above footer, solid bg to prevent nav scroll bleed */}
            <div className="px-3 py-2 border-t border-border/30 bg-surface-sidebar relative z-10">
              <h3 className="px-[10px] pt-1.5 pb-1 text-[10px] font-medium text-text-muted uppercase tracking-[0.12em]">
                Analisi
              </h3>
              <div className="space-y-0.5">
                {ANALYSIS_VIEWS.map(({ to, label, icon, available }) =>
                  available ? (
                    <NavLink
                      key={label}
                      to={to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-[10px] py-2 rounded-lg text-[13px]
                         border-l-[2px] transition-colors duration-150 select-none
                         ${isActive
                           ? "border-accent text-text-primary font-medium bg-surface-raised/40"
                           : "border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-raised/30"
                         }`
                      }
                    >
                      {icon}
                      <span className="flex-1 truncate">{label}</span>
                    </NavLink>
                  ) : (
                    <div
                      key={label}
                      className="flex items-center gap-2 px-[10px] py-2 rounded-lg text-[13px]
                                 border-l-[2px] border-transparent select-none
                                 opacity-40 cursor-not-allowed pointer-events-none
                                 text-text-secondary"
                    >
                      {icon}
                      <span className="flex-1 truncate">{label}</span>
                      <span className="text-[9px] text-text-muted font-mono">prossimamente</span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border/30 bg-surface-sidebar flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-text-muted/70 leading-tight">
                Camera dei Deputati
              </p>
              {/* Montecitorio building — simplified neoclassical silhouette */}
              <svg className="w-6 h-[22px] text-text-muted/35 flex-shrink-0" fill="currentColor" viewBox="0 0 24 22">
                <rect x="0" y="20.5" width="24" height="1.5" rx="0.5"/>
                <rect x="1"  y="13"  width="1.5" height="7.5"/>
                <rect x="5"  y="13"  width="1.5" height="7.5"/>
                <rect x="9"  y="13"  width="1.5" height="7.5"/>
                <rect x="13" y="13"  width="1.5" height="7.5"/>
                <rect x="17" y="13"  width="1.5" height="7.5"/>
                <rect x="21" y="13"  width="1.5" height="7.5"/>
                <rect x="0"  y="11"  width="24" height="2" rx="0.3"/>
                <path d="M0,11 L12,4 L24,11Z"/>
                <ellipse cx="12" cy="4" rx="2.5" ry="2.5"/>
              </svg>
            </div>
          </>
        )}

        {/* ── Drag-to-resize handle — desktop only ───────────────────────────── */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 hidden lg:block cursor-col-resize
                     hover:bg-accent/30 active:bg-accent/50 transition-colors"
          onMouseDown={handleResizeStart}
        />
      </aside>
    </>
  );
}
