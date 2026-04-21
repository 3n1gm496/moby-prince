import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import ContradictionPanel from "../components/ContradictionPanel";
import { apiFetch } from "../lib/apiFetch";

const SEVERITY_ORDER = { major: 0, significant: 1, minor: 2 };
const STATUS_FILTERS  = ["all", "open", "under_review", "contested", "resolved"];
const SEV_FILTERS     = ["all", "major", "significant", "minor"];

const STATUS_LABEL = {
  all:          "Tutti",
  open:         "Aperte",
  under_review: "In esame",
  contested:    "Contestate",
  resolved:     "Risolte",
};
const SEV_LABEL = { all: "Tutte", major: "Alta", significant: "Media", minor: "Bassa" };

async function _fetch({ status, severity }) {
  const params = new URLSearchParams({ limit: "100" });
  if (status   && status   !== "all") params.set("status",   status);
  if (severity && severity !== "all") params.set("severity", severity);
  const res = await apiFetch(`/api/contradictions?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function _patchStatus(id, status) {
  const res = await apiFetch(`/api/contradictions/${id}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function StatBadge({ label, count, color }) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${color}`}>
      <p className="text-2xl font-bold tabular-nums">{count}</p>
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </div>
  );
}

export default function Contradictions() {
  const [contradictions, setContradictions] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [statusFilter,   setStatusFilter]   = useState("open");
  const [sevFilter,      setSevFilter]      = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await _fetch({ status: statusFilter, severity: sevFilter });
      const sorted = (data.contradictions || []).sort((a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
      );
      setContradictions(sorted);
    } catch (err) {
      const msg = err.message;
      setError(msg.includes("501")
        ? "L'evidence layer BigQuery non è ancora configurato."
        : `Errore nel caricamento: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sevFilter]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = useCallback(async (id, newStatus) => {
    try {
      await _patchStatus(id, newStatus);
      setContradictions(prev => prev.map(c =>
        c.id === id ? { ...c, status: newStatus } : c,
      ));
    } catch (err) {
      console.warn("handleStatusChange failed:", err.message);
    }
  }, []);

  const major = contradictions.filter(c => c.severity === "major");
  const open  = contradictions.filter(c => c.status   === "open");

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      {/* Header */}
      <div className="border-b border-border bg-surface-raised px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link to="/" className="text-text-muted hover:text-text-primary transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="font-serif text-xl font-semibold">Matrice delle contraddizioni</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Conflitti fattuali e temporali rilevati tra i documenti del corpus
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        {!loading && !error && (
          <div className="grid grid-cols-3 gap-3">
            <StatBadge label="Rilevate" count={contradictions.length}
              color="border-border bg-surface-raised text-text-primary" />
            <StatBadge label="Alta gravità" count={major.length}
              color="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300" />
            <StatBadge label="Aperte" count={open.length}
              color="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300" />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Stato:</span>
            <div className="flex gap-1">
              {STATUS_FILTERS.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                          ${statusFilter === s
                            ? "bg-accent text-white border-accent"
                            : "bg-surface-raised border-border text-text-muted hover:text-text-primary"}`}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Gravità:</span>
            <div className="flex gap-1">
              {SEV_FILTERS.map(s => (
                <button key={s} onClick={() => setSevFilter(s)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                          ${sevFilter === s
                            ? "bg-accent text-white border-accent"
                            : "bg-surface-raised border-border text-text-muted hover:text-text-primary"}`}>
                  {SEV_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <button onClick={load} disabled={loading}
                  className="ml-auto text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-40">
            {loading ? "Aggiornamento…" : "↻ Aggiorna"}
          </button>
        </div>

        {/* Content */}
        {loading && (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-lg bg-surface-raised animate-pulse" />)}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800
                          bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {error}
          </div>
        )}

        {!loading && !error && contradictions.length === 0 && (
          <div className="text-center py-12 text-text-muted">
            <p className="text-sm">Nessuna contraddizione trovata con i filtri selezionati.</p>
            {statusFilter !== "all" && (
              <button onClick={() => setStatusFilter("all")}
                      className="mt-2 text-xs text-accent hover:text-accent-hover transition-colors">
                Mostra tutte
              </button>
            )}
          </div>
        )}

        {!loading && !error && contradictions.length > 0 && (
          <ContradictionPanel
            contradictions={contradictions}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>
    </div>
  );
}
