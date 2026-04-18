import { useState, useRef, useEffect } from "react";
import { useChat } from "../hooks/useChat";
import MessageBubble from "./MessageBubble";
import CitationPanel from "./CitationPanel";
import QuickSuggestions from "./QuickSuggestions";

function LoadingBubble() {
  return (
    <div className="flex justify-start gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-navy-700 border border-navy-600
                      flex items-center justify-center mt-1">
        <svg className="w-4 h-4 text-brand-400 animate-pulse2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-navy-800 border border-navy-600 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-slate-400 italic">
            L&apos;AI sta analizzando i documenti storici…
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ChatInterface() {
  const { messages, isLoading, sendMessage, clearChat } = useChat();
  const [input, setInput] = useState("");
  const [activeCitation, setActiveCitation] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestion = (text) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-navy-950 overflow-hidden">
      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex-shrink-0 border-b border-navy-700 bg-navy-900/80 backdrop-blur px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-600/20 border border-brand-600/40
                              flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="3" strokeWidth="2"/>
                  <line x1="12" y1="22" x2="12" y2="8" strokeWidth="2"/>
                  <path d="M5 12H2a10 10 0 0 0 20 0h-3" strokeWidth="2"/>
                </svg>
              </div>
              <div>
                <h1 className="font-serif text-base font-semibold text-white leading-tight">
                  Archivio Moby Prince
                </h1>
                <p className="text-xs text-slate-500">
                  Centro di Documentazione Storica · 10 aprile 1991
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Vertex AI Search
              </span>
              {!isEmpty && (
                <button
                  onClick={clearChat}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors
                             px-2 py-1 rounded border border-navy-600 hover:border-navy-500"
                >
                  Nuova sessione
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6">
            {isEmpty ? (
              <WelcomeScreen />
            ) : (
              <div className="space-y-6">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onCitationClick={setActiveCitation}
                    onFollowUp={(q) => {
                      setInput(q);
                      textareaRef.current?.focus();
                    }}
                  />
                ))}
                {isLoading && <LoadingBubble />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Quick suggestions — shown only on empty state */}
        {isEmpty && (
          <div className="flex-shrink-0 max-w-3xl w-full mx-auto">
            <QuickSuggestions onSelect={handleSuggestion} disabled={isLoading} />
          </div>
        )}

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-navy-700 bg-navy-900/80 backdrop-blur">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <form onSubmit={handleSubmit} className="relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Poni una domanda sull'incidente del Moby Prince…"
                rows={1}
                disabled={isLoading}
                className="w-full resize-none bg-navy-800 border border-navy-600 rounded-xl
                           px-4 py-3 pr-14 text-sm text-slate-200 placeholder-slate-500
                           focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                           transition-colors disabled:opacity-50 leading-relaxed"
                style={{ minHeight: "48px", maxHeight: "160px" }}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-brand-600
                           flex items-center justify-center
                           hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-colors"
                aria-label="Invia domanda"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
            <p className="text-xs text-slate-600 text-center mt-2">
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
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-brand-600/10 border border-brand-600/30
                      flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <h2 className="font-serif text-2xl font-semibold text-white mb-3">
        Centro di Documentazione Storica
      </h2>
      <p className="text-slate-400 text-sm max-w-md leading-relaxed mb-2">
        Questo sistema consente di interrogare l&apos;archivio documentale relativo al disastro
        del traghetto <strong className="text-slate-300">Moby Prince</strong>, avvenuto nel porto
        di Livorno il <strong className="text-slate-300">10 aprile 1991</strong>.
      </p>
      <p className="text-slate-500 text-xs max-w-sm">
        Le risposte sono generate dall&apos;intelligenza artificiale sulla base dei documenti
        ufficiali indicizzati: atti parlamentari, perizie tecniche, sentenze e rapporti d&apos;inchiesta.
      </p>
      <div className="mt-8 flex items-center gap-6 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Citazioni verificabili
        </span>
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Backend sicuro
        </span>
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Vertex AI Search
        </span>
      </div>
    </div>
  );
}
