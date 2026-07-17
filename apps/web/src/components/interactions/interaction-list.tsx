import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { InteractionCard } from "./interaction-card";
import type { InteractionsListResult } from "@/repositories/interactions";

type InteractionListProps = {
  result: InteractionsListResult;
  currentParams: URLSearchParams;
};

function interactionsUrl(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/interactions?${next.toString()}`;
}

export function InteractionList({ result, currentParams }: InteractionListProps) {
  return (
    <div className="stack">
      {result.interactions.length === 0 ? <EmptyState title="Aucune interaction" body="Les appels, notes, reunions et messages seront listes ici." /> : (
        <div className="interaction-list">
          {result.interactions.map((interaction) => <InteractionCard key={interaction.id} interaction={interaction} />)}
        </div>
      )}

      <nav className="pagination" aria-label="Pagination Interactions">
        <span>{result.total} resultat(s)</span>
        <div>
          {result.page > 1 ? <Link className="button subtle-button" href={interactionsUrl(currentParams, result.page - 1)}>Precedent</Link> : null}
          <span>Page {result.page} / {result.pageCount}</span>
          {result.page < result.pageCount ? <Link className="button subtle-button" href={interactionsUrl(currentParams, result.page + 1)}>Suivant</Link> : null}
        </div>
      </nav>
    </div>
  );
}
