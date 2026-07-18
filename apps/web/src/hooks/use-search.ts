"use client";

import { useDeferredValue, useMemo, useState } from "react";

export function useSearch(initialQuery = "") {
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = useMemo(() => deferredQuery.trim().toLowerCase(), [deferredQuery]);

  return {
    query,
    setQuery,
    deferredQuery,
    normalizedQuery,
    hasQuery: normalizedQuery.length > 0
  };
}
