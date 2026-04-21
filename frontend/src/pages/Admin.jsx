import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`rounded-xl border p-4 space-y-1
                     ${accent
                       ? "border-accent/30 bg-accent/5"
                       : "border-border bg-surface-raised"}`}>
      <p className="text-[11px] text-text-muted uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl font-bold text-text-primary tabular-nums">
        {value ?? <span className="text-text-muted text-base">—</span>}
      </p>
      {sub && <p className="text-xs text-text-secondary">{sub}</p>}
    </div>
  );
}

// ── Budget bar ────────────────────────────────────────────────────────────────

function BudgetBar({ label, count, limit }) {
  const pct = Math.min(100, Math.round((count / limit) * 100));
  const danger = pct >= 80;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className={`font-medium tabular-nums ${danger ? "text-red-400" : "text-text-primary"}`}>
          {count} / {limit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${danger ? "bg-red-500" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Admin() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/stats");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setStats(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-raised">
        <Link to="/" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-base font-semibold">Pannello Admin</h1>
          <p className="text-[11px] text-text-muted">Statistiche operative · Moby Prince</p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     border border-border text-text-secondary
                     hover:text-text-primary hover:border-accent/40 transition-colors
                     disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Aggiorna
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Error state */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30
                          bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Errore nel caricamento delle statistiche</p>
              <p className="text-xs mt-0.5 text-red-400/80">{error}</p>
              {error.includes("401") && (
                <p className="text-xs mt-1 text-red-400/70">
                  Verifica che <code className="font-mono">VITE_API_KEY</code> sia configurata correttamente.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Stats grid */}
        {stats && (
          <>
            <section>
              <h2 className="text-xs text-text-muted uppercase tracking-wide font-medium mb-3">
                Archivio
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard
                  label="Sessioni"
                  value={stats.sessions?.count}
                  sub="conversazioni salvate"
                />
                <StatCard
                  label="Documenti"
                  value={stats.documents?.total}
                  sub="in BigQuery"
                />
                <StatCard
                  label="Contraddizioni aperte"
                  value={stats.contradictions?.open}
                  sub={`su ${stats.contradictions?.total ?? 0} totali`}
                  accent={stats.contradictions?.open > 0}
                />
              </div>
            </section>

            <section>
              <h2 className="text-xs text-text-muted uppercase tracking-wide font-medium mb-3">
                Budget giornaliero
              </h2>
              <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
                <BudgetBar
                  label="Chiamate Gemini"
                  count={stats.rateLimiter?.gemini?.count ?? 0}
                  limit={stats.rateLimiter?.gemini?.limit ?? 500}
                />
                <BudgetBar
                  label="Query BigQuery"
                  count={stats.rateLimiter?.bq?.count ?? 0}
                  limit={stats.rateLimiter?.bq?.limit ?? 2000}
                />
                {stats.rateLimiter?.resetAt && (
                  <p className="text-[11px] text-text-muted">
                    Reset alle{" "}
                    {new Date(stats.rateLimiter.resetAt).toLocaleTimeString("it-IT", {
                      hour: "2-digit", minute: "2-digit",
                    })} UTC
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        {/* Empty / loading state */}
        {loading && !stats && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl bg-surface-raised border border-border animate-shimmer" />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
