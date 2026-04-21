import { Routes, Route, Navigate } from "react-router-dom";
import ChatInterface     from "./components/ChatInterface";
import Timeline          from "./pages/Timeline";
import DossierBuilder    from "./pages/DossierBuilder";
import Contradictions    from "./pages/Contradictions";
import InvestigationPage from "./pages/InvestigationPage";
import Admin             from "./pages/Admin";
import Onboarding        from "./components/Onboarding";

export default function App() {
  return (
    <>
      <Onboarding />
      <Routes>
        <Route path="/"                element={<ChatInterface />} />
        <Route path="/timeline"        element={<Timeline />} />
        <Route path="/dossier"         element={<DossierBuilder />} />
        <Route path="/contraddizioni"  element={<Contradictions />} />
        <Route path="/investigazione"  element={<InvestigationPage />} />
        <Route path="/admin"           element={<Admin />} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
