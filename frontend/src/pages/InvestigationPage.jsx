import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import AnchorAvatar from "../components/AnchorAvatar";
import { apiFetch } from "../lib/apiFetch";

// ── Tool metadata ─────────────────────────────────────────────────────────────

const TOOL_META = {
  search_documents:   { label: "Ricerca documenti",      icon: "🔍" },
  verify_claim:       { label: "Verifica affermazione",  icon: "✓"  },
  list_contradictions:{ label: "Contraddizioni",         icon: "⚡"  },
  get_entity_info:    { label: "Entità",                 icon: "👤"  },
  translate_text:     { label: "Traduzione",             icon: "🌐"  },
};

// ── Suggested queries ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Quali testimoni della Guardia Costiera contraddicono la perizia RINA sulla visibilità?",
  "Ricostruisci i movimenti della nave Agip Abruzzo nelle ore precedenti la collisione.",
  "Chi erano i principali responsabili del coordinamento dei soccorsi quella notte?",
  "Quali incongruenze emergono tra le varie testimonianze sul momento dell'impatto?",
  "Quali documenti descrivono le comunicazioni radio nelle ore dell'incendio?",
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolStep({ step, isExpanded, onToggle }) {
  const meta = TOOL_META[step.tool] || { label: step.tool, icon: "⚙️" };
  const hasResult = step.result !== undefined;

  return (
    <div className="rounded-lg border border-border bg-surface-raised text-xs">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover transition-colors rounded-lg"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span className="flex-shrink-0 w-4 text-center">{meta.icon}</span>
        <span className="font-medium text-text-primary">{meta.label}</span>
        {step.args?.query && (
          <span className="truncate text-text-muted ml-1">— {step.args.query}</span>
        )}
        {step.args?.text && (
          <span className="truncate text-text-muted ml-1">— {step.args.text?.slice(0, 60)}</span>
        )}
        {step.args?.name && (
          <span className="text-text-muted ml-1">— {step.args.name}</span>
        )}
        {step.durationMs !== undefined && (
          <span className="ml-auto flex-shrink-0 text-text-muted">{step.durationMs}ms</span>
        )}
        {step.error && (
          <span className="ml-1 text-red-400">✗</span>
        )}
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && hasResult && (
        <div className="px-3 pb-2 pt-0 space-y-1 border-t border-border mt-0.5">
          {step.error ? (
            <p className="text-red-400">{step.error}</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-text-secondary font-mono leading-relaxed max-h-40 overflow-y-auto">
              {JSON.stringify(step.result, null, 2).slice(0, 2000)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingIndicator({ step }) {
  return (
    <div className="flex justify-start gap-3 animate-fade-in">
      <AnchorAvatar />
      <div className="flex-1 min-w-0 pt-0.5 space-y-2">
        <p className="text-[11px] text-text-secondary">
          {step ? `Elaborazione passaggio ${step}…` : "Analisi in corso…"}
        </p>
        <div className="flex gap-1">
          {[0, 80, 160].map(d => (
            <div key={d} className="w-1.5 h-1.5 bg-accent/40 rounded-full animate-bounce"
                 style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentMessage({ message }) {
  const [expandedSteps, setExpandedSteps] = useState({});

  const toggleStep = useCallback((stepIdx) => {
    setExpandedSteps(prev => ({ ...prev, [stepIdx]: !prev[stepIdx] }));
  }, []);

  return (
    <div className="flex justify-start gap-3 animate-fade-in">
      <AnchorAvatar />
      <div className="flex-1 min-w-0 pt-0.5 space-y-3 max-w-3xl">
        {/* Tool trace */}
        {message.steps?.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-text-muted font-medium uppercase tracking-wide">
              Passaggi ragionamento ({message.steps.length})
            </p>
            {message.steps.map((step, i) => (
              <ToolStep
                key={i}
                step={step}
                isExpanded={!!expandedSteps[i]}
                onToggle={() => toggleStep(i)}
              />
            ))}
          </div>
        )}

        {/* Final answer */}
        <div className="prose prose-sm dark:prose-invert max-w-none text-text-primary leading-relaxed">
          {message.text.split('\n').map((line, i) => (
            <p key={i} className={line.trim() ? '' : 'h-2'}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvestigationPage() {
  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState("");
  const [isLoading,    setIsLoading]    = useState(false);
  const [loadingStep,  setLoadingStep]  = useState(null);
  const [steps,        setSteps]        = useState([]);   // accumulates during stream

  const abortRef   = useRef(null);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, loadingStep]);

  const sendQuery = useCallback(async (queryText) => {
    const q = (queryText || input).trim();
    if (!q || isLoading) return;

    setInput("");
    setIsLoading(true);
    setLoadingStep(null);
    setSteps([]);
    setMessages(prev => [...prev, { id: Date.now(), role: "user", text: q }]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const buffer = { current: "" };
    let accSteps = [];

    try {
      const res = await apiFetch("/api/agent/investigate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: q }),
        signal:  controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      const processBuffer = () => {
        const parts = buffer.current.split("\n\n");
        buffer.current = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = "message";
          let eventData = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: "))     eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
          }
          try {
            const data = JSON.parse(eventData);
            if (eventType === "thinking") {
              setLoadingStep(data.step || null);
            } else if (eventType === "tool_call") {
              // Start tracking this step
              accSteps = [...accSteps, { tool: data.tool, args: data.args, step: data.step }];
              setSteps([...accSteps]);
            } else if (eventType === "tool_result") {
              // Enrich the last step with result data
              accSteps = accSteps.map(s =>
                s.step === data.step
                  ? { ...s, result: data.result, durationMs: data.durationMs, error: data.error }
                  : s,
              );
              setSteps([...accSteps]);
            } else if (eventType === "answer") {
              setMessages(prev => [...prev, {
                id:    Date.now() + 1,
                role:  "assistant",
                text:  data.text || "",
                steps: accSteps,
              }]);
              accSteps = [];
              setSteps([]);
            } else if (eventType === "error") {
              setMessages(prev => [...prev, {
                id:   Date.now() + 1,
                role: "error",
                text: data.message || "Errore sconosciuto",
              }]);
            }
          } catch (_) { /* malformed event */ }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer.current += decoder.decode(value, { stream: true });
        processBuffer();
      }
      buffer.current += decoder.decode();
      if (buffer.current.trim()) { buffer.current += "\n\n"; processBuffer(); }
      reader.releaseLock();

    } catch (err) {
      if (err.name !== "AbortError") {
        setMessages(prev => [...prev, {
          id:   Date.now() + 1,
          role: "error",
          text: "Connessione interrotta. Riprova.",
        }]);
      }
    } finally {
      setIsLoading(false);
      setLoadingStep(null);
      setSteps([]);
    }
  }, [input, isLoading]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuery(); }
  }, [sendQuery]);

  return (
    <div className="flex flex-col h-screen bg-surface text-text-primary">
      {/* ── Header ── */}
      <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-raised">
        <Link to="/"
              className="text-text-muted hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="font-serif text-base font-semibold leading-tight">Investigazione</h1>
          <p className="text-[11px] text-text-muted leading-tight">
            Agente multi-step · Moby Prince
          </p>
        </div>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
          Gemini 2.0 Flash
        </span>
      </header>

      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>
            <div>
              <p className="font-serif text-lg font-medium text-text-primary mb-1">
                Modalità investigazione
              </p>
              <p className="text-sm text-text-secondary max-w-sm">
                L'agente usa più strumenti in sequenza per rispondere a domande complesse.
                Puoi seguire ogni passaggio del ragionamento.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s, i) => (
                <button key={i}
                        onClick={() => sendQuery(s)}
                        className="text-left text-sm px-4 py-2.5 rounded-xl border border-border
                                   bg-surface-raised hover:bg-surface-hover hover:border-accent/30
                                   transition-colors text-text-secondary hover:text-text-primary">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === "user" && (
              <div className="flex justify-end">
                <div className="max-w-lg rounded-2xl bg-accent/10 border border-accent/20
                                px-4 py-2.5 text-sm text-text-primary">
                  {msg.text}
                </div>
              </div>
            )}
            {msg.role === "assistant" && <AgentMessage message={msg} />}
            {msg.role === "error" && (
              <div className="flex justify-start gap-3">
                <AnchorAvatar />
                <div className="rounded-xl bg-red-500/10 border border-red-500/20
                                px-4 py-2.5 text-sm text-red-400">
                  {msg.text}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* In-progress tool trace */}
        {isLoading && steps.length > 0 && (
          <div className="flex justify-start gap-3 animate-fade-in">
            <AnchorAvatar />
            <div className="flex-1 min-w-0 pt-0.5 space-y-1.5 max-w-3xl">
              <p className="text-[11px] text-text-muted font-medium uppercase tracking-wide">
                Passaggi in corso
              </p>
              {steps.map((s, i) => (
                <ToolStep key={i} step={s} isExpanded={false} onToggle={() => {}} />
              ))}
            </div>
          </div>
        )}

        {isLoading && <ThinkingIndicator step={loadingStep} />}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 border-t border-border bg-surface-raised px-4 py-3">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Poni una domanda investigativa complessa…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1 resize-none rounded-xl border border-border bg-surface
                       px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20
                       disabled:opacity-50 transition-colors min-h-[40px] max-h-32"
            style={{ height: "auto", overflowY: input.split("\n").length > 3 ? "auto" : "hidden" }}
            onInput={e => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
            }}
          />
          <button
            onClick={() => sendQuery()}
            disabled={isLoading || !input.trim()}
            className="flex-shrink-0 p-2.5 rounded-xl bg-accent text-white
                       hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
            aria-label="Avvia indagine"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
