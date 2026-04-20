import { FILTER_SCHEMA } from "../filters/schema";

// ─── FilterField ──────────────────────────────────────────────────────────────

function FilterField({ field, value, onChange }) {
  const id       = `filter-${field.key}`;
  const disabled = !field.available;

  const inputClass = `
    w-full text-xs rounded-lg px-2.5 py-1.5
    bg-surface border border-border
    text-text-primary placeholder-text-muted
    focus:outline-none focus:border-accent/40
    transition-colors
    disabled:opacity-30 disabled:cursor-not-allowed
  `;

  return (
    <div>
      <label htmlFor={id}
             className={`flex items-center gap-1.5 text-[11px] font-medium mb-1 ${
               disabled ? "text-text-muted" : "text-text-secondary"
             }`}>
        {field.label}
        {disabled && (
          <span className="text-[9px] text-text-muted font-normal uppercase tracking-wide
                            border border-border/60 rounded px-1 py-px">
            in arrivo
          </span>
        )}
      </label>

      {field.type === "enum" && (
        <select id={id} disabled={disabled}
                value={value ?? ""}
                onChange={e => onChange(field.key, e.target.value || null)}
                className={inputClass + " appearance-none"}>
          <option value="">Tutti</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {field.type === "number" && (
        <input id={id} type="number" disabled={disabled}
               value={value ?? ""}
               min={field.min} max={field.max}
               placeholder={field.placeholder ?? `${field.min}–${field.max}`}
               onChange={e => onChange(field.key, e.target.value !== "" ? Number(e.target.value) : null)}
               className={inputClass} />
      )}

      {field.type === "text" && (
        <input id={id} type="text" disabled={disabled}
               value={value ?? ""}
               placeholder={field.placeholder ?? ""}
               onChange={e => onChange(field.key, e.target.value || null)}
               className={inputClass} />
      )}
    </div>
  );
}

// ─── FilterPanel ──────────────────────────────────────────────────────────────

export default function FilterPanel({ filters, onFilterChange, onClear, activeFilterCount }) {
  const availableCount = FILTER_SCHEMA.filter(f => f.available).length;

  return (
    <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-text-secondary flex-shrink-0">
            Filtra per metadato
          </span>
          {availableCount === 0 && (
            <span className="text-[10px] text-text-muted italic truncate">
              — metadati del corpus non ancora disponibili
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button onClick={onClear}
                  className="text-[11px] text-text-muted hover:text-accent transition-colors flex-shrink-0">
            Rimuovi tutti
          </button>
        )}
      </div>

      {/* Filter grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {FILTER_SCHEMA.map(field => (
          <FilterField
            key={field.key}
            field={field}
            value={filters[field.key]}
            onChange={onFilterChange}
          />
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-3 text-[10px] text-text-muted leading-relaxed border-t border-border/40 pt-2.5">
        Tipo, istituzione, anno e legislatura sono popolati in modo euristico dal nome del file
        durante l'indicizzazione; persona e argomento richiedono annotazione manuale tramite manifest.
        I filtri attivi generano espressioni <code className="font-mono text-accent/60">struct.*</code> su
        Vertex AI Search — funzionano solo per i documenti indicizzati con metadati.
        Vedere <code className="font-mono text-accent/70">docs/metadata-model.md</code>.
      </p>
    </div>
  );
}
