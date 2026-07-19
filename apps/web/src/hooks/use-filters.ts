"use client";

import { useMemo, useState } from "react";

export function useFilters<TFilters extends Record<string, string | boolean | number | null | undefined>>(initialFilters: TFilters) {
  const [filters, setFilters] = useState<TFilters>(initialFilters);

  const activeFilters = useMemo(() => Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "" && value !== false && value !== null && value !== undefined)
  ) as Partial<TFilters>, [filters]);

  function setFilter<TKey extends keyof TFilters>(key: TKey, value: TFilters[TKey]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setFilters(initialFilters);
  }

  return {
    filters,
    activeFilters,
    setFilter,
    resetFilters
  };
}
