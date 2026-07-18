"use client";

import { useMemo } from "react";

export function getPaginationState({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  return {
    page,
    pageCount,
    total,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
    previousPage: Math.max(page - 1, 1),
    nextPage: Math.min(page + 1, pageCount)
  };
}

export function usePagination({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  return useMemo(() => getPaginationState({ page, pageCount, total }), [page, pageCount, total]);
}
