import { useState } from "react";

// Severity colour tokens
const SEVERITY_STYLES = {
  major:       "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-700",
  significant: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-700",
  minor:       "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700",
};

const TYPE_LABELS = {
  factual:       "Fattuale",
  temporal:      "Temporale",
  testimonial:   "Testimoniale",
  interpretive:  "Interpretativa",
  procedural:    "Procedurale",
};

const STATUS_STYLES = {
  open:         "text-text-muted",
  under_review: "text-amber-600 dark:text-amber-400",
  contested:    "text-orange-600 dark:text-orange-400",
  resolved:     "text-green-600 dark:text-green-400",
};

function ContradictionCard({ contradiction, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const severity = contradiction.severity || "minor";
  const status   = contradiction.status   || "open";

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3 text-sm space-y-2">
      {/* Header row */}
      <div className="flex items-start gap-2">
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[severity] || SEVERITY_STYLES.minor}`}>
          {severity === "major" ? "Alta" : severity === "significant" ? "Media" : "Bassa"}
        </span>
        {contradiction.contradictionType && (
          <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs bg-surface-overlay text-text-secondary">
            {TYPE_LABELS[contradiction.contradictionType] || contradiction.contradictionType}
          </span>
        )}
        <span className={`ml-auto text-xs ${STATUS_STYLES[status] || STATUS_STYLES.open}`}>
          {status === "open"         ? "Aperta"
          : status === "resolved"   ? "Risolta"
          : status === "contested"  ? "Contestata"
          : "In esame"}
        </span>
      </div>

      {/* Description */}
      {contradiction.description && (
        <p className="text-text-secondary leading-snug">{contradiction.description}</p>
      )}

      {/* Claim excerpts — collapsible */}
      <button
        className="flex items-center gap-1 text-xs text-text-primary hover:text-accent transition-colors"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {expanded ? "Nascondi" : "Mostra"} affermazioni
      </button>

      {expanded && (
        <div className="space-y-2 pt-1">
          {contradiction.claimAText && (
            <blockquote className="border-l-2 border-red-400 pl-2 text-text-secondary text-xs italic leading-snug">
              <span className="not-italic font-medium text-text-primary">A:</span>{" "}
              {contradiction.claimAText.slice(0, 250)}
            </blockquote>
          )}
          {contradiction.claimBText && (
            <blockquote className="border-l-2 border-blue-400 pl-2 text-text-secondary text-xs italic leading-snug">
              <span className="not-italic font-medium text-text-primary">B:</span>{" "}
              {contradiction.claimBText.slice(0, 250)}
            </blockquote>
          )}
        </div>
      )}

      {/* Status update controls (only for open contradictions) */}
      {onStatusChange && status === "open" && (
        <div className="flex gap-2 pt-1">
          <button
            className="text-xs px-2 py-0.5 rounded bg-surface-overlay hover:bg-surface-hover text-text-muted transition-colors"
            onClick={() => onStatusChange(contradiction.id, "under_review")}
          >
            Metti in esame
          </button>
          <button
            className="text-xs px-2 py-0.5 rounded bg-surface-overlay hover:bg-surface-hover text-text-muted transition-colors"
            onClick={() => onStatusChange(contradiction.id, "resolved")}
          >
            Segna risolta
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * ContradictionPanel — collapsible list of contradictions for an answer message.
 *
 * Props:
 *   contradictions  EvidenceContradiction[]   required
 *   onStatusChange  (id, status) => void       optional — if provided, shows status buttons
 */
export default function ContradictionPanel({ contradictions, onStatusChange }) {
  const [open, setOpen] = useState(false);

  if (!contradictions || contradictions.length === 0) return null;

  const majorCount = contradictions.filter(c => c.severity === "major").length;
  const label = `${contradictions.length} contraddizion${contradictions.length === 1 ? "e" : "i"} rilevat${contradictions.length === 1 ? "a" : "e"} nell'archivio`;

  return (
    <div className="mt-2 print:hidden">
      <button
        className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        {label}
        {majorCount > 0 && (
          <span className="ml-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] px-1.5 py-px">
            {majorCount} alta gravità
          </span>
        )}
        <svg className={`w-3 h-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {contradictions.map(c => (
            <ContradictionCard
              key={c.id}
              contradiction={c}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
