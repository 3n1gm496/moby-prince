import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat } from "../hooks/useChat";
import { useChatHistory } from "../hooks/useChatHistory";
import { useToast } from "../hooks/useToast";
import MessageBubble from "./MessageBubble";
import CitationPanel from "./CitationPanel";
import QuickSuggestions from "./QuickSuggestions";
import Sidebar from "./Sidebar";
import AnchorAvatar from "./AnchorAvatar";
import Toast from "./Toast";

function LoadingBubble() {
  return (
    <div className="flex justify-start gap-3 animate-fade-in">
      <AnchorAvatar />
      <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-surface-overlay border border-border shadow-md">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-text-secondary italic">
            Analisi in corso dei documenti acquisiti dalla Commissione…
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ChatInterface() {
  const history = useChatHistory();
  const { messages, isLoading, loadingConvId, sendMessage, streamingMessage, stopStreaming } = useChat({
    externalMessages: history.activeConversation?.messages ?? [],
    externalSessionId: history.activeConversation?.sessionId ?? null,
    activeConversationId: history.activeConversationId,
    onAppend: history.appendMessage,
    onSessionUpdate: history.updateSessionId,
  });
  const { toasts, showToast, dismissToast } = useToast();

  const [input, setInput] = useState("");
  const [activeCitation, setActiveCitation] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const autoScrollRef = useRef(true); // ref avoids stale closures in scroll effect
  const [showScrollButton, setShowScrollButton] = useState(false);

  // ── Derived flags ────────────────────────────────────────────────────────────
  const showLoadingBubble =
    loadingConvId !== null &&
    loadingConvId === history.activeConversationId &&
    !streamingMessage;

  // Block input and send while this conversation is actively loading or streaming
  const isBlocked = showLoadingBubble || !!streamingMessage;

  // ── Scroll management ────────────────────────────────────────────────────────

  const handleContainerScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    autoScrollRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, []);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll when new content arrives — only if the user hasn't scrolled up
  useEffect(() => {
    if (autoScrollRef.current) scrollToBottom("smooth");
    // NOTE: intentionally not including autoScrollRef in deps — it's a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading, !!streamingMessage]);

  // Snap to bottom + re-enable auto-scroll when switching conversations
  useEffect(() => {
    autoScrollRef.current = true;
    setShowScrollButton(false);
    scrollToBottom("instant");
  }, [history.activeConversationId, scrollToBottom]);

  // ── Callbacks ────────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    history.createConversation();
    setInput("");
    setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [history]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "n") { e.preventDefault(); handleNewChat(); }
      if (mod && e.key === "/") { e.preventDefault(); textareaRef.current?.focus(); }
      if (mod && e.key === "p") { e.preventDefault(); handlePrint(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleNewChat]);

  const handleDeleteConversation = useCallback((id) => {
    const conv = history.conversations.find((c) => c.id === id);
    if (!conv) return;
    history.deleteConversation(id);
    showToast({
      message: `"${conv.title}" eliminata`,
      action: { label: "Annulla", onClick: () => history.restoreConversation(conv) },
      duration: 5000,
    });
  }, [history, showToast]);

  const handleExport = useCallback(() => {
    const conv = history.activeConversation;
    if (!conv || conv.messages.length === 0) return;
    const date = new Date().toLocaleDateString("it-IT", {
      day: "2-digit", month: "long", year: "numeric",
    });
    const lines = [
      `# ${conv.title}\n`,
      `_Esportato il ${date} · Archivio Documentale · Commissione Parlamentare d'Inchiesta_\n\n---\n`,
    ];
    conv.messages.forEach((msg) => {
      if (msg.role === "user") {
        lines.push(`\n**Domanda**\n\n${msg.text}\n`);
      } else if (msg.role === "assistant") {
        lines.push(`\n**Risposta**\n\n${msg.text}\n`);
        if (msg.citations?.length > 0) {
          const seen = new Set();
          const titles = msg.citations
            .flatMap((c) => c.sources.map((s) => s.title))
            .filter((t) => t && !seen.has(t) && seen.add(t));
          if (titles.length) lines.push(`\n_Fonti: ${titles.join(" · ")}_\n`);
        }
      }
    });
    const blob = new Blob([lines.join("")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moby-prince_${conv.title.replace(/[^a-z0-9àèéìòùÀÈÉÌÒÙ]/gi, "_").slice(0, 50)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [history.activeConversation]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isBlocked) return;
    const convId = history.ensureActiveConversation();
    sendMessage(input, convId);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleRetry = useCallback((query) => {
    if (isBlocked || !history.activeConversationId) return;
    sendMessage(query, history.activeConversationId, { silent: true });
  }, [isBlocked, history.activeConversationId, sendMessage]);

  const handleFeedback = useCallback((msgId, sentiment) => {
    if (!history.activeConversationId) return;
    history.updateMessageFeedback(history.activeConversationId, msgId, sentiment);
  }, [history]);

  const isEmpty = messages.length === 0;

  // Last 3 conversations with content — shown on empty state
  const recentConversations = useMemo(() =>
    [...history.conversations]
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 3),
    [history.conversations]
  );

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
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

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-border bg-surface/80 backdrop-blur px-4 py-3 print:hidden">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-1.5 rounded-lg text-text-secondary hover:text-text-primary
                           hover:bg-surface-raised transition-colors"
                onClick={() => setSidebarOpen(true)}
                aria-label="Apri menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="font-serif text-sm font-semibold text-text-primary leading-tight">
                  {history.activeConversation?.messages?.length > 0
                    ? history.activeConversation.title
                    : "Archivio Moby Prince"}
                </h1>
                <p className="text-xs text-text-muted hidden sm:block">
                  Commissione Parlamentare d&apos;Inchiesta · Naufragio Moby Prince
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!isEmpty && (
                <>
                  <button
                    onClick={handlePrint}
                    title="Stampa conversazione (⌘P)"
                    aria-label="Stampa"
                    className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary
                               hover:bg-surface-raised transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleExport}
                    title="Esporta in Markdown"
                    aria-label="Esporta conversazione"
                    className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary
                               hover:bg-surface-raised transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </>
              )}
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-text-muted ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success-dot animate-pulse" />
                Vertex AI Search
              </span>
            </div>
          </div>
        </header>

        {/* Empty state */}
        {isEmpty && (
          <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto">
            <WelcomeScreen />
            <div className="w-full max-w-2xl px-4">
              <QuickSuggestions
                onSelect={(t) => { setInput(t); textareaRef.current?.focus(); }}
                disabled={isLoading}
              />
              {recentConversations.length > 0 && (
                <RecentConversations
                  conversations={recentConversations}
                  onSelect={history.selectConversation}
                />
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        {!isEmpty && (
          <div
            ref={messagesContainerRef}
            onScroll={handleContainerScroll}
            className="flex-1 overflow-y-auto"
          >
            {/* Print header */}
            <div className="hidden print:block px-8 py-4 border-b border-gray-200 mb-6">
              <h1 className="text-xl font-bold">{history.activeConversation?.title}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Archivio Documentale · Commissione Parlamentare d&apos;Inchiesta · Camera dei Deputati
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Stampato il {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-6 print:max-w-none print:px-8 print:py-0">
              <div className="space-y-6">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onCitationClick={setActiveCitation}
                    onFollowUp={(q) => { setInput(q); textareaRef.current?.focus(); }}
                    onRetry={handleRetry}
                    onFeedback={handleFeedback}
                  />
                ))}
                {showLoadingBubble && <LoadingBubble />}
                {streamingMessage && (
                  <MessageBubble
                    key="streaming"
                    message={streamingMessage}
                    onCitationClick={() => {}}
                    onFollowUp={() => {}}
                    onRetry={() => {}}
                  />
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* Jump-to-bottom button */}
        {showScrollButton && !isEmpty && (
          <div className="absolute bottom-28 right-6 z-20 print:hidden">
            <button
              onClick={() => { autoScrollRef.current = true; setShowScrollButton(false); scrollToBottom("smooth"); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                         bg-surface-raised border border-border shadow-lg
                         text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Vai in fondo
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="flex-shrink-0 px-4 pb-5 pt-3 bg-surface print:hidden">
          <div className="max-w-2xl mx-auto">
            {/* Stop streaming button */}
            {streamingMessage && (
              <div className="flex justify-center mb-2">
                <button
                  onClick={stopStreaming}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                             bg-surface-raised border border-border shadow
                             text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  Interrompi generazione
                </button>
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="relative bg-surface-raised border border-border rounded-2xl shadow-lg"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Formulare un quesito relativo agli atti del procedimento d'inchiesta…"
                rows={1}
                disabled={isBlocked}
                className="w-full resize-none bg-transparent px-4 py-3 pr-14 text-sm
                           text-text-primary placeholder-text-muted
                           focus:outline-none disabled:opacity-50 leading-relaxed"
                style={{ minHeight: "48px", maxHeight: "160px" }}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isBlocked}
                className="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-accent
                           flex items-center justify-center
                           hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed
                           transition-colors"
                aria-label="Invia domanda"
              >
                <svg className="w-4 h-4 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
            <p className="text-xs text-text-muted text-center mt-2">
              Enter per inviare · Shift+Enter per andare a capo · ⌘N nuova chat · ⌘/ focus
            </p>
          </div>
        </div>
      </div>

      {/* Citation panel */}
      {activeCitation && (
        <CitationPanel
          citation={activeCitation}
          onClose={() => setActiveCitation(null)}
        />
      )}

      {/* Toast notifications */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 pb-6">
      <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-border
                      flex items-center justify-center mb-6">
        <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <p className="text-xs font-semibold tracking-widest uppercase text-text-muted mb-3">
        Camera dei Deputati · Commissione Parlamentare d&apos;Inchiesta
      </p>
      <h2 className="font-serif text-2xl font-semibold text-text-primary mb-4">
        Sistema di Consultazione dell&apos;Archivio Documentale
      </h2>
      <p className="text-text-secondary text-sm max-w-lg leading-relaxed mb-2">
        Strumento di analisi e ricerca sui documenti acquisiti dalla Commissione in merito
        al naufragio del traghetto{" "}
        <strong className="text-text-primary">Moby Prince</strong> avvenuto nel porto di
        Livorno nella notte del{" "}
        <strong className="text-text-primary">10 aprile 1991</strong>,
        con la perdita di 140 vite umane.
      </p>
      <p className="text-text-muted text-xs max-w-md leading-relaxed">
        Il sistema elabora le interrogazioni mediante intelligenza artificiale, restituendo
        risposte documentate e riferimenti puntuali alle fonti: atti parlamentari, relazioni
        peritali, sentenze giudiziarie, verbali e rapporti d&apos;inchiesta.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-5 text-xs text-text-muted">
        {[
          ["M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", "Riferimenti verificabili"],
          ["M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", "Fonti documentali originali"],
          ["M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", "Accesso riservato"],
          ["M13 10V3L4 14h7v7l9-11h-7z", "Vertex AI Search · Regione EU"],
        ].map(([d, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
            </svg>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── RecentConversations ──────────────────────────────────────────────────────

function RecentConversations({ conversations, onSelect }) {
  return (
    <div className="mt-6 px-4 pb-4">
      <p className="text-xs font-medium text-text-muted uppercase tracking-widest mb-3">
        Conversazioni recenti
      </p>
      <div className="space-y-1.5">
        {conversations.map((conv) => {
          const lastMsg = conv.messages[conv.messages.length - 1];
          const preview = lastMsg?.text?.slice(0, 100) || "";
          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className="w-full text-left px-3 py-2.5 rounded-xl border border-border
                         bg-surface-raised hover:border-accent/40 hover:bg-surface-overlay
                         transition-all duration-150 group"
            >
              <p className="text-xs font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                {conv.title}
              </p>
              {preview && (
                <p className="text-[11px] text-text-muted truncate mt-0.5">{preview}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
