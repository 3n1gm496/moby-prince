import { Link } from "react-router-dom";

export default function DossierBuilder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface px-6 text-center">
      <svg className="w-10 h-10 text-accent/40 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h1 className="font-serif text-2xl font-semibold text-text-primary mb-2">
        Costruttore di dossier
      </h1>
      <p className="text-sm text-text-secondary max-w-xs leading-relaxed mb-6">
        Area di lavoro per assemblare e organizzare prove documentali
        estratte dal corpus in dossier investigativi strutturati.
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
