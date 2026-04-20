import { Link } from "react-router-dom";

export default function Timeline() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface px-6 text-center">
      <svg className="w-10 h-10 text-accent/40 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <h1 className="font-serif text-2xl font-semibold text-text-primary mb-2">
        Timeline degli eventi
      </h1>
      <p className="text-sm text-text-secondary max-w-xs leading-relaxed mb-6">
        Ricostruzione cronologica del disastro del 10 aprile 1991 basata sugli atti
        della Commissione Parlamentare d&apos;Inchiesta.
      </p>
      <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px]
                       bg-surface-raised border border-border text-text-muted mb-8">
        Prossimamente
      </span>
      <Link to="/" className="text-xs text-accent hover:text-accent-hover transition-colors">
        ← Torna alla consultazione
      </Link>
    </div>
  );
}
