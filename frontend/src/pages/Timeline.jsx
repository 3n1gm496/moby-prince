import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import DocumentPanel from "../components/DocumentPanel";
import { apiFetch } from "../lib/apiFetch";

// ── Config ────────────────────────────────────────────────────────────────────

const ERAS = [
  { id: "incidente",   label: "Incidente e prime indagini", start: 1991, end: 1999, color: "red"   },
  { id: "processi",    label: "Processi e sentenze",         start: 1999, end: 2006, color: "blue"  },
  { id: "riapertura",  label: "Riapertura del caso",         start: 2006, end: 2018, color: "teal"  },
  { id: "commissioni", label: "Commissioni parlamentari",    start: 2018, end: 2027, color: "amber" },
];

const ERA_STYLES = {
  red:   { dot: "bg-red-500",   banner: "border-red-500/20 bg-red-500/5 text-red-400",     card: "border-l-red-500/40"   },
  blue:  { dot: "bg-blue-500",  banner: "border-blue-500/20 bg-blue-500/5 text-blue-400",  card: "border-l-blue-500/40"  },
  teal:  { dot: "bg-teal-500",  banner: "border-teal-500/20 bg-teal-500/5 text-teal-400",  card: "border-l-teal-500/40"  },
  amber: { dot: "bg-amber-500", banner: "border-amber-500/20 bg-amber-500/5 text-amber-400", card: "border-l-amber-500/40" },
};

const EVENT_TYPES = [
  { id: "evento",      label: "Evento",      badge: "bg-surface-raised border-border text-text-secondary"        },
  { id: "udienza",     label: "Udienza",     badge: "bg-blue-500/10 border-blue-500/20 text-blue-400"            },
  { id: "sentenza",    label: "Sentenza",    badge: "bg-red-500/10 border-red-500/20 text-red-400"               },
  { id: "relazione",   label: "Relazione",   badge: "bg-green-500/10 border-green-500/20 text-green-400"         },
  { id: "commissione", label: "Commissione", badge: "bg-amber-500/10 border-amber-500/20 text-amber-400"         },
];

const FILTERS = [
  { id: "all",         label: "Tutti"       },
  { id: "curated",     label: "Eventi"      },
  { id: "documento",   label: "Documenti"   },
  { id: "sentenza",    label: "Sentenze"    },
  { id: "commissione", label: "Commissioni" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEra(year) {
  return ERAS.find(e => year >= e.start && year < e.end) ?? ERAS[ERAS.length - 1];
}

function formatEventDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return iso; }
}

function getTypeConfig(typeId) {
  return EVENT_TYPES.find(t => t.id === typeId) ?? EVENT_TYPES[0];
}

function sortKey(item) {
  if (item._kind === "curated") return item.date ?? `${item._year}-01-01`;
  return `${item._year}-06-15`;
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const cfg = getTypeConfig(type);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

// ── EraBanner ─────────────────────────────────────────────────────────────────

function EraBanner({ era }) {
  const s = ERA_STYLES[era.color];
  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border text-[11px] font-medium ${s.banner}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
      <span>{era.label}</span>
      <span className="text-[10px] font-mono opacity-60 ml-auto">{era.start}–{era.end}</span>
    </div>
  );
}

// ── CuratedEventCard ──────────────────────────────────────────────────────────

function CuratedEventCard({ event, onEdit, onDelete, onDocClick }) {
  const [expanded, setExpanded] = useState(false);
  const era = getEra(new Date(event.date).getFullYear());
  const s   = ERA_STYLES[era.color];

  return (
    <div className={`bg-surface-raised border border-border rounded-xl border-l-4 ${s.card}
                     hover:border-border/80 transition-colors group`}>
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-2 mb-1.5">
          <TypeBadge type={event.type} />
          {event._aiGenerated && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium
                             bg-accent/10 border border-accent/20 text-accent/70">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI
            </span>
          )}
          {event.importance >= 3 && (
            <span className="text-[10px] text-amber-400/80 font-medium">★ chiave</span>
          )}
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(event)}
                    className="p-1.5 rounded text-text-muted hover:text-text-primary transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => onDelete(event.id)}
                    className="p-1.5 rounded text-text-muted hover:text-red-400 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        <p className="text-[11px] text-text-muted mb-1">{formatEventDate(event.date)}</p>
        <h3 className="text-[14px] font-semibold text-text-primary leading-snug mb-1.5">
          {event.title}
        </h3>

        {event.description && (
          <>
            <p className={`text-[12px] text-text-secondary leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
              {event.description}
            </p>
            {event.description.length > 180 && (
              <button onClick={() => setExpanded(v => !v)}
                      className="text-[11px] text-accent hover:text-accent-hover mt-1 transition-colors">
                {expanded ? "mostra meno" : "mostra tutto"}
              </button>
            )}
          </>
        )}

        {event.linkedDocs?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {event.linkedDocs.map((doc, i) => (
              <button key={i} onClick={() => onDocClick(doc)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                                 bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {doc.title || doc.id}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DocumentItem ──────────────────────────────────────────────────────────────

function DocumentItem({ doc, onClick }) {
  return (
    <button onClick={() => onClick(doc)}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg
                       bg-surface-raised border border-border hover:border-accent/30
                       transition-colors group">
      <svg className="w-4 h-4 flex-shrink-0 text-text-muted group-hover:text-accent transition-colors"
           fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="flex-1 min-w-0 text-[12px] text-text-secondary group-hover:text-text-primary transition-colors truncate">
        {doc.title}
      </span>
      {doc.documentType && (
        <span className="text-[10px] text-text-muted flex-shrink-0 ml-2">{doc.documentType}</span>
      )}
    </button>
  );
}

// ── EventDrawer ───────────────────────────────────────────────────────────────

const EMPTY = { date: "", title: "", type: "evento", importance: 1, description: "", linkedDocs: [] };

function EventDrawer({ initial, onSave, onClose }) {
  const [form,       setForm]       = useState(initial ?? EMPTY);
  const [docSearch,  setDocSearch]  = useState("");
  const [docResults, setDocResults] = useState([]);
  const [searching,  setSearching]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const timer = useRef(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const searchDocs = useCallback((q) => {
    clearTimeout(timer.current);
    if (!q.trim()) { setDocResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await apiFetch("/api/evidence/search", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ query: q, maxResults: 8 }),
        });
        const data = await res.json();
        const seen = new Set();
        setDocResults(
          (data.evidence || [])
            .filter(e => e.documentId && !seen.has(e.documentId) && seen.add(e.documentId))
            .map(e => ({ id: e.documentId, title: e.title || e.documentId }))
        );
      } catch { setDocResults([]); }
      finally  { setSearching(false); }
    }, 350);
  }, []);

  const linkDoc   = (doc) => {
    if (form.linkedDocs.some(d => d.id === doc.id)) return;
    set("linkedDocs", [...form.linkedDocs, doc]);
    setDocSearch(""); setDocResults([]);
  };
  const unlinkDoc = (id) => set("linkedDocs", form.linkedDocs.filter(d => d.id !== id));

  const handleSave = async () => {
    if (!form.date || !form.title.trim()) return;
    setSaving(true);
    await onSave({ ...form, id: form.id ?? `evt-${Date.now()}` });
    setSaving(false);
  };

  useEffect(() => {
    const fn = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-[26rem] bg-surface-sidebar
                        border-l border-border/50 z-50 flex flex-col animate-slide-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <h2 className="text-[13px] font-semibold text-text-primary">
            {initial?.id ? "Modifica evento" : "Nuovo evento"}
          </h2>
          <button onClick={onClose}
                  className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Date */}
          <div>
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Data *</label>
            <input type="date" value={form.date} onChange={e => set("date", e.target.value)}
                   className="w-full px-3 py-2 rounded-lg text-[13px] bg-surface border border-border
                              text-text-primary focus:outline-none focus:border-accent/60" />
          </div>

          {/* Title */}
          <div>
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Titolo *</label>
            <input type="text" value={form.title} onChange={e => set("title", e.target.value)}
                   placeholder="Descrizione sintetica dell'evento"
                   className="w-full px-3 py-2 rounded-lg text-[13px] bg-surface border border-border
                              text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60" />
          </div>

          {/* Type + Importance */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Tipo</label>
              <select value={form.type} onChange={e => set("type", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-[13px] bg-surface border border-border
                                 text-text-primary focus:outline-none focus:border-accent/60">
                {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                Importanza
              </label>
              <div className="flex items-center gap-0.5 mt-2">
                {[1, 2, 3].map(n => (
                  <button key={n} onClick={() => set("importance", n)}
                          className={`text-xl transition-colors ${form.importance >= n ? "text-amber-400" : "text-text-muted/25"}`}>
                    ★
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              Descrizione
            </label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
                      rows={4} placeholder="Contesto e dettagli dell'evento…"
                      className="w-full px-3 py-2 rounded-lg text-[13px] bg-surface border border-border
                                 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60
                                 resize-none leading-relaxed" />
          </div>

          {/* Linked documents */}
          <div>
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              Documenti collegati
            </label>
            {form.linkedDocs.length > 0 && (
              <div className="mb-2 space-y-1">
                {form.linkedDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-border">
                    <span className="flex-1 text-[11px] text-text-secondary truncate">{doc.title}</span>
                    <button onClick={() => unlinkDoc(doc.id)}
                            className="text-text-muted hover:text-red-400 transition-colors flex-shrink-0">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="relative">
              <input value={docSearch}
                     onChange={e => { setDocSearch(e.target.value); searchDocs(e.target.value); }}
                     placeholder="Cerca documento per parola chiave…"
                     className="w-full px-3 py-2 rounded-lg text-[12px] bg-surface border border-border
                                text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60" />
              {searching && (
                <span className="absolute right-3 top-2.5 w-3 h-3 rounded-full border-2
                                 border-text-muted/30 border-t-accent animate-spin" />
              )}
              {docResults.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-surface-raised border border-border
                                rounded-lg shadow-xl overflow-hidden">
                  {docResults.map(doc => (
                    <button key={doc.id} onClick={() => linkDoc(doc)}
                            className="w-full text-left px-3 py-2 text-[12px] text-text-secondary
                                       hover:bg-surface hover:text-text-primary transition-colors
                                       border-b border-border/30 last:border-0">
                      {doc.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border/30 flex gap-2.5">
          <button onClick={handleSave} disabled={saving || !form.date || !form.title.trim()}
                  className="flex-1 py-2 rounded-lg text-[13px] font-medium bg-accent text-white
                             hover:bg-accent-hover transition-colors disabled:opacity-40">
            {saving ? "Salvataggio…" : initial?.id ? "Salva modifiche" : "Aggiungi evento"}
          </button>
          <button onClick={onClose}
                  className="px-4 py-2 rounded-lg text-[13px] border border-border text-text-secondary
                             hover:text-text-primary transition-colors">
            Annulla
          </button>
        </div>
      </aside>
    </>
  );
}

// ── deDocToPanel ──────────────────────────────────────────────────────────────

function deDocToPanel(doc) {
  return {
    id:                doc.id,
    title:             doc.title,
    uri:               doc.uri   || null,
    mimeType:          null,
    snippet:           null,
    source:            "listDocuments",
    metadata:          { year: doc.year, documentType: doc.documentType, institution: doc.institution },
    metadataAvailable: { year: !!doc.year, documentType: !!doc.documentType, institution: !!doc.institution },
  };
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export default function Timeline() {
  const [deDocs,      setDeDocs]      = useState([]);
  const [curated,     setCurated]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState("all");
  const [search,      setSearch]      = useState("");
  const [drawer,      setDrawer]      = useState(null);
  const [panelDoc,    setPanelDoc]    = useState(null);
  const [saveErr,     setSaveErr]     = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [genErr,      setGenErr]      = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/timeline/documents").then(r => r.json()).catch(() => ({ documents: [] })),
      apiFetch("/api/timeline/events").then(r => r.json()).catch(() => ({ events: [] })),
    ]).then(([docsData, eventsData]) => {
      setDeDocs(docsData.documents || []);
      setCurated(eventsData.events || []);
      setLoading(false);
    });
  }, []);

  const saveEvents = useCallback(async (events) => {
    setSaveErr(null);
    try {
      const res = await apiFetch("/api/timeline/events", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCurated(events);
    } catch (e) {
      setSaveErr(e.message);
    }
  }, []);

  const handleSave = useCallback(async (eventData) => {
    const next = curated.some(e => e.id === eventData.id)
      ? curated.map(e => e.id === eventData.id ? eventData : e)
      : [...curated, eventData];
    await saveEvents(next);
    setDrawer(null);
  }, [curated, saveEvents]);

  const handleDelete = useCallback((id) => {
    const event = curated.find(e => e.id === id);
    const label = event?.title ? `"${event.title}"` : "questo evento";
    if (!window.confirm(`Eliminare ${label}? L'operazione non è reversibile.`)) return;
    saveEvents(curated.filter(e => e.id !== id));
  }, [curated, saveEvents]);

  const handleGenerate = useCallback(async (force = false) => {
    setGenerating(true);
    setGenErr(null);
    try {
      const res  = await apiFetch("/api/timeline/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCurated(data.events || []);
    } catch (e) {
      setGenErr(e.message);
    } finally {
      setGenerating(false);
    }
  }, []);

  const allItems = useMemo(() => {
    const docs = deDocs.map(d => ({ ...d, _kind: "document", _year: d.year }));
    const evts = curated.map(e => ({ ...e, _kind: "curated", _year: new Date(e.date).getFullYear() }));
    return [...evts, ...docs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }, [deDocs, curated]);

  const filtered = useMemo(() => allItems.filter(item => {
    if (filter === "curated"     && item._kind !== "curated")                               return false;
    if (filter === "documento"   && item._kind !== "document")                              return false;
    if (filter === "sentenza"    && (item._kind !== "curated" || item.type !== "sentenza")) return false;
    if (filter === "commissione" && (item._kind !== "curated" || item.type !== "commissione")) return false;
    if (search) {
      const q = search.toLowerCase();
      return (item.title || "").toLowerCase().includes(q) || (item.description || "").toLowerCase().includes(q);
    }
    return true;
  }), [allItems, filter, search]);

  const byYear = useMemo(() => {
    const map = new Map();
    for (const item of filtered) {
      if (!map.has(item._year)) map.set(item._year, []);
      map.get(item._year).push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [filtered]);

  return (
    <div className="min-h-screen bg-surface flex flex-col">

      {/* Header */}
      <header className="flex-shrink-0 border-b border-border/30 bg-surface-sidebar/80
                         backdrop-blur-md sticky top-0 z-10 print:hidden">
        <div className="max-w-[860px] mx-auto px-5 py-3 flex items-center gap-3 flex-wrap">
          <Link to="/" className="flex items-center gap-1.5 text-[11px] text-text-secondary
                                  hover:text-text-primary transition-colors flex-shrink-0">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Consultazione
          </Link>
          <span className="text-border/60 flex-shrink-0">·</span>
          <h1 className="text-[13px] font-semibold text-text-primary flex-shrink-0">Timeline del caso</h1>
          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-2 text-text-muted pointer-events-none"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
                   placeholder="Cerca eventi…"
                   className="pl-8 pr-3 py-1.5 text-[12px] bg-surface border border-border rounded-lg
                              text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 w-44" />
          </div>

          <button onClick={() => window.print()}
                  title="Stampa / Salva PDF (Ctrl+P)"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary border border-transparent
                             hover:border-border transition-colors print:hidden flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>

          {/* AI generate button */}
          <button onClick={() => handleGenerate(curated.some(e => e._aiGenerated))}
                  disabled={generating}
                  title={curated.some(e => e._aiGenerated) ? "Rigenera eventi AI (sovrascrive quelli precedenti)" : "Genera eventi dall'archivio con AI"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium
                             border border-border text-text-secondary hover:text-text-primary hover:border-border/80
                             transition-colors flex-shrink-0 disabled:opacity-50">
            {generating ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-text-muted/30 border-t-accent animate-spin flex-shrink-0" />
                Generazione…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {curated.some(e => e._aiGenerated) ? "Rigenera AI" : "Genera da AI"}
              </>
            )}
          </button>

          <button onClick={() => setDrawer({})}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium
                             bg-accent text-white hover:bg-accent-hover transition-colors flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Aggiungi evento
          </button>
        </div>

        {/* Filter tabs */}
        <div role="tablist" className="max-w-[860px] mx-auto px-5 pb-2.5 flex items-center gap-1 overflow-x-auto">
          {FILTERS.map(f => (
            <button key={f.id} role="tab" aria-selected={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap
                                ${filter === f.id
                                  ? "bg-accent/15 text-accent border border-accent/30"
                                  : "text-text-muted hover:text-text-secondary border border-transparent"}`}>
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-text-muted tabular-nums flex-shrink-0 pl-2">
            {filtered.length} elementi
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-[860px] mx-auto w-full px-5 py-8">

        {saveErr && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-error-bg border border-error-border text-[12px] text-error-text flex items-center gap-2">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {saveErr}
            <button onClick={() => setSaveErr(null)} className="ml-auto underline text-[11px]">Chiudi</button>
          </div>
        )}

        {genErr && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-error-bg border border-error-border text-[12px] text-error-text flex items-center gap-2">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Generazione AI fallita: {genErr}
            <button onClick={() => setGenErr(null)} className="ml-auto underline text-[11px]">Chiudi</button>
          </div>
        )}

        {loading && (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-6">
                <div className="w-12 h-5 bg-surface-raised rounded-full animate-shimmer flex-shrink-0 mt-1" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-20 bg-surface-raised rounded-xl animate-shimmer" />
                  <div className="h-9 bg-surface-raised rounded-lg animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {curated.length === 0 && deDocs.length === 0 ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
                  <svg className="w-8 h-8 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-text-primary mb-1.5">Nessun evento presente</p>
                <p className="text-[12px] text-text-muted max-w-xs mb-5">
                  Lascia che l'AI analizzi l'archivio e costruisca automaticamente la timeline del caso.
                </p>
                <button onClick={() => handleGenerate(false)} disabled={generating}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium
                                   bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {generating ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Analisi corpus in corso…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Genera timeline dall'archivio
                    </>
                  )}
                </button>
                <p className="text-[10px] text-text-muted mt-3">
                  Una sola chiamata AI · risultato salvato in cache · gratuito al prossimo caricamento
                </p>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 text-text-muted/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-text-secondary mb-1">Nessun elemento trovato.</p>
                <p className="text-xs text-text-muted">Prova a modificare i filtri o la ricerca.</p>
              </>
            )}
          </div>
        )}

        {!loading && byYear.length > 0 && (
          <div className="relative">
            {/* Center vertical line */}
            <div className="absolute left-[3.25rem] top-2 bottom-4 w-px bg-border/40 pointer-events-none" />

            <div className="space-y-0">
              {byYear.map(([year, items], idx) => {
                const era         = getEra(year);
                const s           = ERA_STYLES[era.color];
                const prevYear    = idx > 0 ? byYear[idx - 1][0] : null;
                const showBanner  = !prevYear || getEra(prevYear).id !== era.id;

                return (
                  <div key={year}>
                    {showBanner && (
                      <div className="pl-[4.5rem] pt-6 pb-3">
                        <EraBanner era={era} />
                      </div>
                    )}

                    <div className="flex gap-6 py-3">
                      {/* Year marker */}
                      <div className="w-10 flex-shrink-0 flex flex-col items-center pt-1 relative z-10 sticky top-[100px] self-start">
                        <div className={`w-2.5 h-2.5 rounded-full ring-[3px] ring-surface flex-shrink-0 ${s.dot}`} />
                        <span className="text-[10px] font-mono text-text-muted mt-1 leading-none">{year}</span>
                      </div>

                      {/* Items */}
                      <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                        {items.map((item, i) =>
                          item._kind === "curated" ? (
                            <CuratedEventCard
                              key={item.id ?? i}
                              event={item}
                              onEdit={setDrawer}
                              onDelete={handleDelete}
                              onDocClick={doc => setPanelDoc({
                                id: doc.id, title: doc.title, source: "listDocuments",
                                metadata: {}, metadataAvailable: {},
                              })}
                            />
                          ) : (
                            <DocumentItem
                              key={item.id ?? i}
                              doc={item}
                              onClick={d => setPanelDoc(deDocToPanel(d))}
                            />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-6 pt-2">
                <div className="w-10 flex-shrink-0 flex justify-center relative z-10">
                  <div className="w-2 h-2 rounded-full bg-border/60" />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {drawer !== null && (
        <EventDrawer
          initial={drawer?.id ? drawer : null}
          onSave={handleSave}
          onClose={() => setDrawer(null)}
        />
      )}

      {panelDoc && (
        <DocumentPanel doc={panelDoc} onClose={() => setPanelDoc(null)} />
      )}
    </div>
  );
}
