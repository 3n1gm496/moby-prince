import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat } from "../hooks/useChat";
import { useChatHistory } from "../hooks/useChatHistory";
import { useToast } from "../hooks/useToast";
import { useFilters } from "../hooks/useFilters";
import MessageBubble from "./MessageBubble";
import CitationPanel from "./CitationPanel";
import FilterPanel from "./FilterPanel";
import QuickSuggestions from "./QuickSuggestions";
import Sidebar from "./Sidebar";
import AnchorAvatar from "./AnchorAvatar";
import Toast from "./Toast";
import { getFilterValueLabel, FILTER_SCHEMA } from "../filters/schema";

// ─── SkeletonLoader ───────────────────────────────────────────────────────────

function SkeletonLoader({ stage }) {
  const label = stage === "retrying" ? "Nuovo tentativo…" : "Ricerca in corso…";
  return (
    <div className="flex justify-start gap-3 animate-fade-in">
      <AnchorAvatar />
      <div className="flex-1 min-w-0 pt-0.5 space-y-2.5">
        <p className="text-[11px] text-text-secondary">{label}</p>
        <div className="space-y-2">
          {[{ w: "w-3/4", d: "0ms" }, { w: "w-full", d: "80ms" }, { w: "w-5/6", d: "160ms" }, { w: "w-2/3", d: "240ms" }].map(({ w, d }, i) => (
            <div key={i} className={`h-2.5 bg-surface-raised rounded-full animate-shimmer ${w}`}
                 style={{ animationDelay: d }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Session helpers ──────────────────────────────────────────────────────────

// Discovery Engine sessions expire after ~60 min of idle. Drop the session ID
// if > 55 min have passed so DE starts fresh rather than erroring on a stale one.
const SESSION_MAX_IDLE_MS = 55 * 60 * 1000;

function _effectiveSessionId(conv) {
  if (!conv?.sessionId || !conv?.sessionUpdatedAt) return null;
  if (Date.now() - new Date(conv.sessionUpdatedAt).getTime() > SESSION_MAX_IDLE_MS) return null;
  return conv.sessionId;
}

// ─── ChatInterface ────────────────────────────────────────────────────────────

export default function ChatInterface() {
  const history = useChatHistory();
  const { filters, activeFilters, activeFilterCount, hasActiveFilters, setFilter, clearFilters } = useFilters();
  const {
    messages, isLoading, loadingConvId, loadingStage,
    sendMessage, streamingMessage, stopStreaming,
  } = useChat({
    externalMessages:     history.activeConversation?.messages ?? [],
    externalSessionId:    _effectiveSessionId(history.activeConversation),
    activeConversationId: history.activeConversationId,
    onAppend:             history.appendMessage,
    onSessionUpdate:      history.updateSessionId,
    filters:              hasActiveFilters ? activeFilters : undefined,
  });
  const { toasts, showToast, dismissToast } = useToast();

  const [input,          setInput]          = useState("");
  const [activeCitation, setActiveCitation] = useState(null);
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [showFilters,    setShowFilters]    = useState(false);

  const messagesEndRef       = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef          = useRef(null);
  const autoScrollRef        = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const showLoadingBubble = loadingConvId !== null
    && loadingConvId === history.activeConversationId
    && !streamingMessage;
  const isBlocked = showLoadingBubble || !!streamingMessage;

  // ── Scroll ──────────────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleContainerScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    autoScrollRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, []);

  useEffect(() => {
    if (autoScrollRef.current) scrollToBottom("smooth");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading, !!streamingMessage]);

  useEffect(() => {
    autoScrollRef.current = true;
    setShowScrollButton(false);
    scrollToBottom("instant");
    textareaRef.current?.focus();
  }, [history.activeConversationId, scrollToBottom]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    history.createConversation();
    setInput("");
    setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [history]);

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "n") { e.preventDefault(); handleNewChat(); }
      if (mod && e.key === "/") { e.preventDefault(); textareaRef.current?.focus(); }
      if (mod && e.key === "p") { e.preventDefault(); handlePrint(); }
      if (mod && e.shiftKey && e.key === "f") { e.preventDefault(); setShowFilters(v => !v); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleNewChat]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleDeleteConversation = useCallback((id) => {
    const conv = history.conversations.find((c) => c.id === id);
    if (!conv) return;
    history.deleteConversation(id);
    showToast({
      message: `"${conv.title}" eliminata`,
      action: { label: "Annulla", onClick: () => history.restoreConversation(conv) },
      duration: 5000,
    });
  }, [history.conversations, history.deleteConversation, history.restoreConversation, showToast]);

  const handlePrint = useCallback(() => {
    const prev = document.title;
    document.title = `Moby Prince — ${history.activeConversation?.title || "Archivio"}`;
    window.print();
    document.title = prev;
  }, [history.activeConversation?.title]);

  const handleExport = useCallback(() => {
    const conv = history.activeConversation;
    if (!conv?.messages.length) {
      showToast({ message: "Nessun messaggio da esportare", duration: 3000 });
      return;
    }
    const date = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
    const lines = [
      `# ${conv.title}\n`,
      `_${date} · Commissione Parlamentare d'Inchiesta · Camera dei Deputati_\n\n---\n`,
    ];
    conv.messages.forEach((msg) => {
      if (msg.role === "user") {
        lines.push(`\n**Domanda**\n\n${msg.text}\n`);
      } else if (msg.role === "assistant") {
        lines.push(`\n**Risposta**\n\n${msg.text}\n`);
        if (msg.citations?.length) {
          const seen = new Set();
          const titles = msg.citations.flatMap((c) => (c.sources || []).map((s) => s.title))
            .filter((t) => t && !seen.has(t) && seen.add(t));
          if (titles.length) lines.push(`\n_Fonti: ${titles.join(" · ")}_\n`);
        }
      }
    });
    const blob = new Blob([lines.join("")], { type: "text/markdown;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `moby-prince_${conv.title.replace(/[^a-z0-9àèéìòùÀÈÉÌÒÙ]/gi, "_").slice(0, 50)}.md`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [history.activeConversation, showToast]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isBlocked) return;
    // Notify user if their Discovery Engine session expired silently
    const conv = history.activeConversation;
    if (conv?.sessionId && !_effectiveSessionId(conv)) {
      showToast({ message: "Sessione scaduta — il contesto è stato resettato", duration: 4000 });
    }
    const convId = history.ensureActiveConversation();
    sendMessage(input, convId);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  };

  const handleRetry = useCallback((query) => {
    if (isBlocked || !history.activeConversationId) return;
    sendMessage(query, history.activeConversationId, { silent: true });
  }, [isBlocked, history.activeConversationId, sendMessage]);

  const isEmpty = messages.length === 0;

  const recentConversations = useMemo(() =>
    [...history.conversations]
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 3),
    [history.conversations]
  );

  const convTitle = history.activeConversation?.messages?.length > 0
    ? history.activeConversation.title
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar
        groupedConversations={history.groupedConversations}
        pinnedConversations={history.pinnedConversations}
        activeConversationId={history.activeConversationId}
        onNewChat={handleNewChat}
        onSelectConversation={history.selectConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={history.renameConversation}
        onTogglePin={history.togglePin}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0">

        {/* Header — glassmorphism on mobile, transparent on desktop */}
        <header className="flex-shrink-0 px-4 py-3 print:hidden
                           sticky top-0 z-10
                           lg:bg-transparent lg:backdrop-blur-none
                           bg-surface-sidebar/80 backdrop-blur-md
                           border-b border-border/20 lg:border-transparent">
          <div className="max-w-[760px] mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                className={`lg:hidden p-1.5 rounded-lg transition-colors flex-shrink-0
                           ${sidebarOpen
                             ? "text-text-primary bg-surface-raised"
                             : "text-text-secondary hover:text-text-primary hover:bg-surface-raised"
                           }`}
                onClick={() => setSidebarOpen(true)}
                aria-label="Apri menu"
                aria-expanded={sidebarOpen}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {convTitle && (
                <h1 className="text-sm font-medium truncate text-text-primary">
                  {convTitle}
                </h1>
              )}
            </div>

            {!isEmpty && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={handlePrint}
                        title="Stampa / Salva PDF (⌘P)" aria-label="Stampa"
                        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary
                                   hover:bg-surface-raised transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </button>
                <button onClick={handleExport}
                        title="Esporta Markdown" aria-label="Esporta"
                        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary
                                   hover:bg-surface-raised transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Empty state */}
        {isEmpty && (
          <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto">
            <WelcomeScreen />
            <div className="w-full max-w-md px-4">
              <QuickSuggestions
                onSelect={(t) => { setInput(t); textareaRef.current?.focus(); }}
                disabled={isBlocked}
              />
              {recentConversations.length > 0 && (
                <RecentConversations conversations={recentConversations} onSelect={history.selectConversation} />
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        {!isEmpty && (
          <div ref={messagesContainerRef} onScroll={handleContainerScroll}
               className="flex-1 overflow-y-auto">

            {/* Print-only header */}
            <div className="hidden print:block px-8 py-6 mb-4 border-b border-gray-200">
              <h1 className="text-xl font-bold text-gray-900">{history.activeConversation?.title}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Commissione Parlamentare d'Inchiesta · Camera dei Deputati ·{" "}
                {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>

            <div className="max-w-[760px] mx-auto px-5 py-6 print:max-w-none print:px-8 print:py-0">
              <div className="space-y-8">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id} message={msg}
                    onCitationClick={setActiveCitation}
                    onFollowUp={(q) => { setInput(q); textareaRef.current?.focus(); }}
                    onRetry={handleRetry}
                  />
                ))}
                {showLoadingBubble && <SkeletonLoader stage={loadingStage} />}
                {streamingMessage && (
                  <MessageBubble key={`streaming-${streamingMessage.id}`} message={streamingMessage}
                                 onCitationClick={() => {}} onFollowUp={() => {}} onRetry={() => {}} />
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* Jump to bottom */}
        {showScrollButton && !isEmpty && (
          <div className="absolute bottom-28 right-5 z-20 print:hidden">
            <button
              onClick={() => { autoScrollRef.current = true; setShowScrollButton(false); scrollToBottom(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                         bg-surface-raised border border-border shadow-lg surface-depth
                         text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Vai in fondo
            </button>
          </div>
        )}

        {/* Input */}
        <div className="flex-shrink-0 px-4 pb-6 pt-3 print:hidden">
          <div className="max-w-[760px] mx-auto space-y-2">

            {/* Filter panel — smooth accordion */}
            <div className={`overflow-hidden transition-all duration-200 ease-out
                             ${showFilters ? "max-h-[480px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"}`}>
              <div className="pb-2">
                <FilterPanel
                  filters={filters}
                  onFilterChange={setFilter}
                  onClear={clearFilters}
                  activeFilterCount={activeFilterCount}
                />
              </div>
            </div>

            {/* Active filter chips */}
            {hasActiveFilters && !showFilters && (
              <div className="flex flex-wrap gap-x-1.5 gap-y-1 px-1">
                {Object.entries(activeFilters).map(([key, value]) => {
                  const label = FILTER_SCHEMA.find(f => f.key === key)?.label ?? key;
                  return (
                    <span key={key}
                          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full
                                     text-[10px] bg-accent/10 text-accent border border-accent/20">
                      <span className="font-medium">{label}:</span>
                      <span>{getFilterValueLabel(key, value)}</span>
                      <button onClick={() => setFilter(key, null)} aria-label={`Rimuovi filtro ${label}`}
                              className="hover:text-accent-hover transition-colors ml-0.5">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Stop streaming */}
            {streamingMessage && (
              <div className="flex justify-center">
                <button onClick={stopStreaming}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs
                                   text-text-secondary hover:text-text-primary
                                   border border-border/50 hover:border-border transition-colors">
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="5" y="5" width="14" height="14" rx="1.5" />
                  </svg>
                  Interrompi
                </button>
              </div>
            )}

            <div className="ring-1 ring-border/60 rounded-2xl bg-surface-raised surface-depth
                            focus-within:ring-accent/50 transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                }}
                placeholder="Formulare un quesito relativo agli atti dell'inchiesta…"
                rows={1}
                disabled={isBlocked}
                maxLength={4000}
                className="w-full resize-none bg-transparent px-4 pt-4 pb-2.5 text-sm
                           text-text-primary placeholder-text-muted
                           focus:outline-none disabled:opacity-40 leading-relaxed"
                style={{ minHeight: "56px", maxHeight: "160px" }}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] text-text-muted select-none">
                    Enter ↵ &nbsp;·&nbsp; Shift+Enter per andare a capo
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFilters(v => !v)}
                    title="Filtri (⌘⇧F)"
                    aria-label={showFilters ? "Chiudi filtri" : "Apri filtri"}
                    className={`flex items-center gap-1 text-[11px] transition-colors ${
                      showFilters || hasActiveFilters
                        ? "text-accent"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                    </svg>
                    Filtri
                    {activeFilterCount > 0 && (
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full
                                       bg-accent text-surface text-[8px] font-bold">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim() || isBlocked}
                  aria-label="Invia"
                  className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center
                             hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed
                             transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeCitation && (
        <CitationPanel citation={activeCitation} onClose={() => setActiveCitation(null)} />
      )}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

function WelcomeScreen() {
  return (
    <div className="text-center px-6 pb-10 max-w-md">
      {/* Moby Prince ferry illustration */}
      <div className="inline-flex items-center justify-center mb-6">
        <svg viewBox="0 0 96 52" fill="none" className="w-24 h-14 text-accent/70"
             stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {/* Hull */}
          <path d="M6 32 Q8 38 18 38 L78 38 Q88 38 90 32 L87 26 L9 26 Z" />
          {/* Main deck structure */}
          <rect x="22" y="16" width="52" height="10" rx="1.5" />
          {/* Upper cabin */}
          <rect x="32" y="8" width="32" height="8" rx="1.5" />
          {/* Funnel */}
          <path d="M57 8 L57 3" strokeWidth="2.5" />
          <path d="M62 8 L63 3" strokeWidth="2" />
          {/* Deck windows */}
          <rect x="26" y="18.5" width="4" height="4" rx="0.8" />
          <rect x="35" y="18.5" width="4" height="4" rx="0.8" />
          <rect x="44" y="18.5" width="4" height="4" rx="0.8" />
          <rect x="53" y="18.5" width="4" height="4" rx="0.8" />
          <rect x="62" y="18.5" width="4" height="4" rx="0.8" />
          {/* Cabin windows */}
          <rect x="37" y="10.5" width="3.5" height="3.5" rx="0.7" />
          <rect x="44.5" y="10.5" width="3.5" height="3.5" rx="0.7" />
          <rect x="52" y="10.5" width="3.5" height="3.5" rx="0.7" />
          {/* Water */}
          <path d="M2 42 Q10 40 18 42 Q26 44 34 42 Q42 40 50 42 Q58 44 66 42 Q74 40 82 42 Q90 44 94 42"
                strokeOpacity="0.5" />
          <path d="M4 47 Q14 45 24 47 Q34 49 44 47 Q54 45 64 47 Q74 49 84 47"
                strokeOpacity="0.25" />
        </svg>
      </div>

      <h2 className="font-serif text-[28px] font-semibold text-text-primary mb-3 leading-tight">
        Archivio Moby Prince
      </h2>

      <p className="text-text-secondary text-sm leading-relaxed max-w-xs mx-auto">
        Sistema di consultazione documentale della Commissione Parlamentare
        d&apos;Inchiesta sul naufragio del{" "}
        <span className="text-text-primary">10 aprile 1991</span>
      </p>
    </div>
  );
}

// ─── RecentConversations ──────────────────────────────────────────────────────

function RecentConversations({ conversations, onSelect }) {
  return (
    <div className="mt-8 px-4 pb-4">
      <p className="text-[11px] font-medium text-text-secondary uppercase tracking-[0.12em] mb-3">
        Recenti
      </p>
      <div className="space-y-1">
        {conversations.map((conv) => {
          const preview = conv.messages[conv.messages.length - 1]?.text?.slice(0, 90) || "";
          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className="w-full text-left px-3 py-2.5 rounded-xl
                         hover:bg-surface-raised transition-colors group"
            >
              <p className="text-[13px] text-text-secondary group-hover:text-text-primary
                             transition-colors truncate font-medium">
                {conv.title}
              </p>
              {preview && (
                <p className="text-[11px] text-text-secondary truncate mt-0.5">{preview}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
