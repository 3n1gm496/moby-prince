import { useEffect } from "react";

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast.duration) return;
    const timerId = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timerId);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl min-w-[260px] max-w-sm
                    bg-surface-raised border border-border shadow-2xl text-sm">
      <span className="flex-1 text-text-primary leading-snug line-clamp-3">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action.onClick(); onDismiss(toast.id); }}
          className="font-semibold text-accent hover:text-accent-hover transition-colors whitespace-nowrap flex-shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Chiudi notifica"
        className="p-0.5 text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function Toast({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]
                 flex flex-col gap-2 items-center pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto animate-slide-up">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
