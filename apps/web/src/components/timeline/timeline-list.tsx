import Link from "next/link";
import { TimelineEmptyState } from "./timeline-empty-state";
import { TimelineItem } from "./timeline-item";
import { shouldShowTimelinePagination } from "@/features/timeline/pagination";
import type { TimelineListResult } from "@/repositories/timeline-events";

type TimelineListProps = {
  result: TimelineListResult;
  basePath: string;
  category: string;
  hiddenFields?: Record<string, string>;
};

function timelineHref(basePath: string, category: string, page: number, hiddenFields: Record<string, string>) {
  const params = new URLSearchParams({ ...hiddenFields, timelineCategory: category, timelinePage: String(page) });
  return `${basePath}?${params.toString()}`;
}

export function TimelineList({ result, basePath, category, hiddenFields = {} }: TimelineListProps) {
  if (result.events.length === 0) return <TimelineEmptyState />;

  const previousHref = timelineHref(basePath, category, Math.max(result.page - 1, 1), hiddenFields);
  const nextHref = timelineHref(basePath, category, Math.min(result.page + 1, result.pageCount), hiddenFields);

  return (
    <div className="stack">
      <div className="chronology-list">
        {result.events.map((event) => <TimelineItem key={event.id} event={event} />)}
      </div>
      {shouldShowTimelinePagination(result.pageCount) ? (
        <div className="pagination">
          <span className="muted">Page {result.page} / {result.pageCount} - {result.total} événement(s)</span>
          <div>
            <Link className="button subtle-button" aria-disabled={result.page <= 1} href={previousHref}>Précédent</Link>
            <Link className="button subtle-button" aria-disabled={result.page >= result.pageCount} href={nextHref}>Suivant</Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
