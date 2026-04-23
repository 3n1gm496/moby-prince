import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../lib/apiFetch";
import { entityConfigFromSlug } from "../lib/entityViews";

export default function EntityDirectory() {
  const { entitySlug } = useParams();
  const config = entityConfigFromSlug(entitySlug);
  const [entities, setEntities] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ type: config.type, limit: "300" });
        const res = await apiFetch(`/api/entities?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setEntities(data.entities || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [config]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entities;
    return entities.filter((entity) => {
      const haystack = [
        entity.canonicalName,
        entity.role,
        entity.description,
        ...(entity.aliases || []),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [entities, search]);

  if (!config) return null;

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="sticky top-0 z-10 border-b border-border/30 bg-surface-sidebar/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
          <Link to="/" className="text-[12px] text-text-secondary hover:text-text-primary transition-colors">
            Consultazione
          </Link>
          <span className="text-border/60">·</span>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold">{config.plural}</h1>
            <p className="text-[11px] text-text-muted">
              Indice pulito e ricercabile delle {config.plural.toLowerCase()} nel corpus
            </p>
          </div>
          <div className="flex-1" />
          <div className="w-full sm:w-[20rem]">
            <label htmlFor="entity-directory-search" className="sr-only">
              Cerca {config.plural.toLowerCase()}
            </label>
            <input
              id="entity-directory-search"
              aria-label={`Cerca ${config.plural.toLowerCase()}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Cerca ${config.plural.toLowerCase()}…`}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {loading && (
          <div className="grid gap-3 md:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-28 rounded-2xl bg-surface-raised animate-shimmer" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface-raised px-6 py-10 text-center">
            <p className="text-[14px] font-medium text-text-primary">Nessun risultato.</p>
            <p className="mt-1 text-[12px] text-text-secondary">
              Prova una ricerca diversa o completa il backfill delle entità canoniche.
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((entity) => (
              <Link
                key={entity.id}
                to={`${config.route}/${encodeURIComponent(entity.id)}`}
                className="rounded-2xl border border-border bg-surface-raised p-4 text-left hover:border-accent/30 hover:bg-surface-hover transition-colors surface-depth"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-text-primary">{entity.canonicalName}</p>
                    {entity.role && (
                      <p className="mt-1 text-[12px] text-text-secondary">{entity.role}</p>
                    )}
                  </div>
                  {entity.mentionCount != null && (
                    <span className="text-[11px] font-mono text-text-muted">
                      {entity.mentionCount}
                    </span>
                  )}
                </div>
                {entity.aliases?.length > 0 && (
                  <p className="mt-3 text-[11px] text-text-secondary line-clamp-2">
                    Alias: {entity.aliases.slice(0, 4).join(" · ")}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
