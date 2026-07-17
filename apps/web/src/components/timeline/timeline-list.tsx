import Link from "next/link";
import { TimelineEmptyState } from "./timeline-empty-state";
import { TimelineItem } from "./timeline-item";
import type { TimelineListResult } from "@/repositories/timeline-events";

type TimelineListProps = {
  result: TimelineListResult;
  basePath: string;
  category: string;
};

export function TimelineList({ result, basePath, category }: TimelineListProps) {
  if (result.events.length === 0) return <TimelineEmptyState />;

  const previousHref = `${basePath}?timelineCategory=${category}&timelinePage=${Math.max(result.page - 1, 1)}`;
  const nextHref = `${basePath}?timelineCategory=${category}&timelinePage=${Math.min(result.page + 1, result.pageCount)}`;

  return (
    <div className="stack">
      <div className="chronology-list">
        {result.events.map((event) => <TimelineItem key={event.id} event={event} />)}
      </div>
      <div className="pagination">
        <span className="muted">Page {result.page} / {result.pageCount} - {result.total} evenement(s)</span>
        <div>
          <Link className="button subtle-button" aria-disabled={result.page <= 1} href={previousHref}>Precedent</Link>
          <Link className="button subtle-button" aria-disabled={result.page >= result.pageCount} href={nextHref}>Suivant</Link>
        </div>
      </div>
    </div>
  );
}
