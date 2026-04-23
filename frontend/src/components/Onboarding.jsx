import { useState, useEffect } from "react";
import { Search, Microscope, FolderOpen, X } from "lucide-react";

const STORAGE_KEY = "onboarding_done";

const STEPS = [
  {
    icon: Search,
    title: "Cerca nei documenti",
    description:
      "Interroga l'archivio delle testimonianze, perizie e atti ufficiali del caso Moby Prince tramite linguaggio naturale. Il sistema recupera i frammenti più rilevanti e li cita nella risposta.",
  },
  {
    icon: Microscope,
    title: "Analisi investigativa",
    description:
      "L'agente multi-step usa più strumenti in sequenza per cercare documenti, verificare affermazioni, ricostruire eventi e seguire le entità principali del caso con fonti sempre tracciabili.",
  },
  {
    icon: FolderOpen,
    title: "Costruttore di dossier",
    description:
      "Raccogli le prove più significative in cartelle tematiche, controlla gli estratti indicizzati e lavora sui materiali senza perdere il collegamento alla fonte originale.",
  },
];

export default function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [step,    setStep]    = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage blocked (private mode, security policy) — skip onboarding silently
    }
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const Icon    = current.icon;
  const isLast  = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-surface-raised border border-border
                      shadow-2xl p-6 animate-fade-in">

        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-text-muted
                     hover:text-text-primary hover:bg-surface-hover transition-colors"
          aria-label="Chiudi"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors
                          ${i === step ? "bg-accent" : "bg-surface-hover"}`}
              aria-label={`Pannello ${i + 1}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Icon className="w-7 h-7 text-accent" strokeWidth={1.5} />
          </div>

          <div>
            <h2 id="onboarding-title" className="font-serif text-base font-semibold text-text-primary mb-1.5">
              {current.title}
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {current.description}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={dismiss}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Salta
          </button>
          <button
            onClick={() => isLast ? dismiss() : setStep(s => s + 1)}
            className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm
                       hover:bg-accent-hover transition-colors"
          >
            {isLast ? "Inizia" : "Avanti"}
          </button>
        </div>
      </div>
    </div>
  );
}
