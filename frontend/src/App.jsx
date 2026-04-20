import { Routes, Route, Navigate } from "react-router-dom";
import ChatInterface from "./components/ChatInterface";
import Timeline from "./pages/Timeline";
import Contradictions from "./pages/Contradictions";
import DossierBuilder from "./pages/DossierBuilder";

export default function App() {
  return (
    <Routes>
      <Route path="/"               element={<ChatInterface />} />
      <Route path="/timeline"       element={<Timeline />} />
      <Route path="/contradictions" element={<Contradictions />} />
      <Route path="/dossier"        element={<DossierBuilder />} />
      <Route path="*"               element={<Navigate to="/" replace />} />
    </Routes>
  );
}
