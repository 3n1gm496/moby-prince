import { useState, useCallback } from "react";
import { FILTER_SCHEMA } from "../filters/schema";

const INITIAL_FILTERS = Object.fromEntries(FILTER_SCHEMA.map(f => [f.key, null]));

export function useFilters() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const setFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: (value !== '' && value != null) ? value : null }));
  }, []);

  const clearFilters = useCallback(() => setFilters(INITIAL_FILTERS), []);

  // Only the non-null values — what actually gets sent to the API
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== null && v !== '')
  );
  const activeFilterCount = Object.keys(activeFilters).length;

  return {
    filters,
    activeFilters,
    activeFilterCount,
    hasActiveFilters: activeFilterCount > 0,
    setFilter,
    clearFilters,
  };
}
