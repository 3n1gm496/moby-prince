import { useState, useCallback } from "react";

const PAGE_SIZE = 24;

/**
 * Fetches the document dossier from GET /api/analysis/dossier.
 *
 * Call `load()` to fetch the first page.
 * Call `loadMore()` to append the next page (cursor-based).
 *
 * The backend selects the appropriate mode automatically:
 *   - 'listDocuments' when DATA_STORE_ID is configured (exhaustive)
 *   - 'searchFallback' otherwise (partial, top-20 only)
 *
 * `warning` is non-null only in searchFallback mode.
 */
export function useDossier() {
  const [documents,    setDocuments]    = useState([]);
  const [pagination,   setPagination]   = useState({ nextPageToken: null, hasMore: false, total: null });
  const [mode,         setMode]         = useState(null);
  const [warning,      setWarning]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [initialized,  setInitialized]  = useState(false);

  const load = useCallback(async (pageToken = null) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`/api/analysis/dossier?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      setDocuments((prev) =>
        pageToken ? [...prev, ...(data.documents || [])] : (data.documents || [])
      );
      setPagination(data.pagination || { nextPageToken: null, hasMore: false, total: null });
      setMode(data.mode    || null);
      setWarning(data.warning || null);
      setInitialized(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (pagination.nextPageToken && !loading) {
      load(pagination.nextPageToken);
    }
  }, [pagination.nextPageToken, loading, load]);

  return {
    documents,
    pagination,
    mode,
    warning,
    loading,
    error,
    initialized,
    load,
    loadMore,
  };
}
