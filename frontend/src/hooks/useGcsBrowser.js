import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "../lib/apiFetch";

/**
 * Hook for navigating the GCS bucket as a virtual file system.
 *
 * browse(prefix) fetches the contents of a folder.
 * navigate(prefix) is an alias that also pushes to the history stack.
 * back() goes up one level.
 */
export function useGcsBrowser() {
  const [prefix,    setPrefix]    = useState("");
  const [folders,   setFolders]   = useState([]);
  const [files,     setFiles]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [initialized, setInitialized] = useState(false);

  const browse = useCallback(async (targetPrefix = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ prefix: targetPrefix });
      const res = await apiFetch(`/api/storage/browse?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPrefix(targetPrefix);
      setFolders(data.folders || []);
      setFiles(data.files   || []);
      setInitialized(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load root on mount
  useEffect(() => { browse(""); }, [browse]);

  // Auto-refresh every 60 s to stay in sync with cloud
  useEffect(() => {
    const id = setInterval(() => browse(prefix), 60_000);
    return () => clearInterval(id);
  }, [browse, prefix]);

  // Navigate into a sub-folder
  const navigate = useCallback((newPrefix) => browse(newPrefix), [browse]);

  // Go up one level
  const back = useCallback(() => {
    if (!prefix) return;
    const parts = prefix.replace(/\/$/, "").split("/");
    parts.pop();
    const parent = parts.length ? parts.join("/") + "/" : "";
    browse(parent);
  }, [prefix, browse]);

  const refresh = useCallback(() => browse(prefix), [prefix, browse]);

  // Derived breadcrumb: array of { label, prefix }
  const breadcrumb = (() => {
    const parts = prefix.replace(/\/$/, "").split("/").filter(Boolean);
    return parts.map((part, i) => ({
      label:  part,
      prefix: parts.slice(0, i + 1).join("/") + "/",
    }));
  })();

  return {
    prefix,
    folders,
    files,
    loading,
    error,
    initialized,
    breadcrumb,
    navigate,
    back,
    refresh,
  };
}
