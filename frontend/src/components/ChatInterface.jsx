import { useState, useRef, useEffect } from "react";
import { useChat } from "../hooks/useChat";
import { useChatHistory } from "../hooks/useChatHistory";
import MessageBubble from "./MessageBubble";
import CitationPanel from "./CitationPanel";
import QuickSuggestions from "./QuickSuggestions";
import Sidebar from "./Sidebar";
import AnchorAvatar from "./AnchorAvatar";

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
  const { messages, isLoading, loadingConvId, sendMessage } = useChat({
    externalMessages: history.activeConversation?.messages ?? [],
    externalSessionId: history.activeConversation?.sessionId ?? null,
    activeConversationId: history.activeConversationId,
    onAppend: history.appendMessage,
    onSessionUpdate: history.updateSessionId,
  });

  const [input, setInput] = useState("");
  const [activeCitation, setActiveCitation] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Scroll to latest message as new content arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Snap to bottom instantly when switching conversations
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, [history.activeConversationId]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    // Capture the target conversation ID before any async state updates
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

  const handleNewChat = () => {
    history.createConversation();
    setInput("");
    setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const isEmpty = messages.length === 0;
  const showLoadingBubble = loadingConvId === history.activeConversationId;

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <Sidebar
        groupedConversations={history.groupedConversations}
        activeConversationId={history.activeConversationId}
        onNewChat={handleNewChat}
        onSelectConversation={history.selectConversation}
        onDeleteConversation={history.deleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header (mobile only shows hamburger + title) */}
        <header className="flex-shrink-0 border-b border-border bg-surface/80 backdrop-blur px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Hamburger — visible only on mobile */}
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
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-text-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-success-dot animate-pulse" />
                Vertex AI Search
              </span>
            </div>
          </div>
        </header>

        {/* Empty state — fixed, non-scrolling */}
        {isEmpty && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <WelcomeScreen />
            <div className="w-full max-w-2xl px-4">
              <QuickSuggestions onSelect={(t) => { setInput(t); textareaRef.current?.focus(); }} disabled={isLoading} />
            </div>
          </div>
        )}

        {/* Messages area — only when chat has content */}
        {!isEmpty && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-4 py-6">
              <div className="space-y-6">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onCitationClick={setActiveCitation}
                    onFollowUp={(q) => { setInput(q); textareaRef.current?.focus(); }}
                  />
                ))}
                {showLoadingBubble && <LoadingBubble />}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="flex-shrink-0 px-4 pb-5 pt-3 bg-surface">
          <div className="max-w-2xl mx-auto">
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
                disabled={isLoading}
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
                disabled={!input.trim() || isLoading}
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
              Enter per inviare · Shift+Enter per andare a capo
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
    </div>
  );
}

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
