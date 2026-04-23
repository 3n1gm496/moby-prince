import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ChatInterface     from "./components/ChatInterface";
import Onboarding        from "./components/Onboarding";

const Timeline = lazy(() => import("./pages/Timeline"));
const DossierBuilder = lazy(() => import("./pages/DossierBuilder"));
const InvestigationPage = lazy(() => import("./pages/InvestigationPage"));
const Admin = lazy(() => import("./pages/Admin"));
const EntityDirectory = lazy(() => import("./pages/EntityDirectory"));
const EntityProfile = lazy(() => import("./pages/EntityProfile"));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-surface text-text-primary flex items-center justify-center px-5">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface-raised px-6 py-8 text-center surface-depth">
        <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Archivio</p>
        <h1 className="mt-2 text-[18px] font-semibold">Caricamento vista</h1>
        <p className="mt-2 text-[13px] text-text-secondary">
          Sto preparando i dati e il viewer della sezione richiesta.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Onboarding />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<ChatInterface />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/dossier" element={<DossierBuilder />} />
          <Route path="/investigazione" element={<InvestigationPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/entita" element={<EntityDirectory />} />
          <Route path="/entita/:entitySlug(persone|navi|enti|luoghi)/:entityId" element={<EntityProfile />} />
          <Route path="/:entitySlug(persone|navi|enti|luoghi)" element={<EntityDirectory />} />
          <Route path="/:entitySlug(persone|navi|enti|luoghi)/:entityId" element={<EntityProfile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
