import Link from "next/link";
import { InteractionFilters } from "@/components/interactions/interaction-filters";
import { InteractionList } from "@/components/interactions/interaction-list";
import { listInteractions, listInteractionTypes } from "@/repositories/interactions";
import { getTenantContext } from "@/repositories/tenant-context";

type InteractionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function InteractionsPage({ searchParams }: InteractionsPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  const query = valueOf(params, "query");
  const typeId = valueOf(params, "typeId");
  const page = Number(valueOf(params, "page") || 1);
  const currentParams = new URLSearchParams();
  if (query) currentParams.set("query", query);
  if (typeId) currentParams.set("typeId", typeId);

  const [types, result] = context
    ? await Promise.all([
      listInteractionTypes(context),
      listInteractions(context, { query, typeId, page, pageSize: 10 })
    ])
    : [[], { interactions: [], total: 0, page: 1, pageSize: 10, pageCount: 1 }];

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Chronologie des echanges</p>
          <h1>Interactions</h1>
        </div>
        <Link className="button link-button" href="/interactions/new">Nouvelle interaction</Link>
      </header>

      {valueOf(params, "interactionDeleted") === "1" ? <p className="success">Interaction supprimee.</p> : null}
      <InteractionFilters query={query} typeId={typeId} types={types} />
      <InteractionList result={result} currentParams={currentParams} />
    </div>
  );
}
