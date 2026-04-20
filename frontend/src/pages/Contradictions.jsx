import { Link } from "react-router-dom";

export default function Contradictions() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface px-6 text-center">
      <svg className="w-10 h-10 text-accent/40 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
      <h1 className="font-serif text-2xl font-semibold text-text-primary mb-2">
        Matrice delle contraddizioni
      </h1>
      <p className="text-sm text-text-secondary max-w-xs leading-relaxed mb-6">
        Confronto sistematico dei conflitti fattuali e temporali individuati
        tra i documenti del corpus.
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
