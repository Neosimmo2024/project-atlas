import Link from "next/link";
import type { InputHTMLAttributes } from "react";
import { EmptyState } from "@/components/empty-state";
import {
  RELATIONSHIP_PIPELINE_STAGE_LABELS,
  RELATIONSHIP_PIPELINE_STAGES,
  RELATIONSHIP_STATUS_LABELS,
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_TYPE_LABELS,
  RELATIONSHIP_TYPES
} from "@/features/relationships/options";
import { listRelationships } from "@/repositories/relationships";
import { getTenantContext } from "@/repositories/tenant-context";

type RelationshipsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function relationshipsUrl(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/relationships?${next.toString()}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

export default async function RelationshipsPage({ searchParams }: RelationshipsPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  const query = valueOf(params, "query");
  const type = valueOf(params, "type");
  const status = valueOf(params, "status");
  const stage = valueOf(params, "stage");
  const page = Number(valueOf(params, "page") || 1);
  const currentParams = new URLSearchParams();
  if (query) currentParams.set("query", query);
  if (type) currentParams.set("type", type);
  if (status) currentParams.set("status", status);
  if (stage) currentParams.set("stage", stage);

  const result = context ? await listRelationships(context, { query, type, status, stage, page, pageSize: 10 }) : { relationships: [], total: 0, page: 1, pageSize: 10, pageCount: 1 };

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Recruiting pipeline</p>
          <h1>Relationships</h1>
        </div>
        <Link className="button link-button" href="/relationships/new">Nouvelle relation</Link>
      </header>

      <form className="filters relationships-filters" action="/relationships">
        <label>Recherche<InputLike name="query" defaultValue={query} placeholder="Type, phase, statut, notes" /></label>
        <label>
          Type
          <select className="input" name="type" defaultValue={type}>
            <option value="">Tous</option>
            {RELATIONSHIP_TYPES.map((item) => <option key={item} value={item}>{RELATIONSHIP_TYPE_LABELS[item]}</option>)}
          </select>
        </label>
        <label>
          Phase
          <select className="input" name="stage" defaultValue={stage}>
            <option value="">Toutes</option>
            {RELATIONSHIP_PIPELINE_STAGES.map((item) => <option key={item} value={item}>{RELATIONSHIP_PIPELINE_STAGE_LABELS[item]}</option>)}
          </select>
        </label>
        <label>
          Statut
          <select className="input" name="status" defaultValue={status}>
            <option value="">Tous</option>
            {RELATIONSHIP_STATUSES.map((item) => <option key={item} value={item}>{RELATIONSHIP_STATUS_LABELS[item]}</option>)}
          </select>
        </label>
        <button className="button" type="submit">Filtrer</button>
      </form>

      {result.relationships.length === 0 ? <EmptyState title="Aucune relation" body="Les relations entre personnes et organisations seront listees ici." /> : (
        <div className="data-table relationships-table">
          <div className="table-head">
            <span>Personne</span><span>Organisation</span><span>Type</span><span>Phase</span><span>Statut</span><span>Score</span><span>Confiance</span><span>Prochaine action</span><span>Derniere interaction</span><span>Tags</span>
          </div>
          {result.relationships.map((relationship) => (
            <Link key={relationship.id} href={`/relationships/${relationship.id}`} className="table-row">
              <span>{relationship.person?.display_name ?? "-"}</span>
              <span>{relationship.organization?.name ?? "-"}</span>
              <span>{RELATIONSHIP_TYPE_LABELS[relationship.relationship_type]}</span>
              <span>{RELATIONSHIP_PIPELINE_STAGE_LABELS[relationship.pipeline_stage]}</span>
              <span>{RELATIONSHIP_STATUS_LABELS[relationship.status]}</span>
              <span>{relationship.score ?? "-"}</span>
              <span>{relationship.confidence ?? "-"}</span>
              <span>{formatDate(relationship.next_action_at)}</span>
              <span>{formatDate(relationship.last_interaction_at)}</span>
              <span>{relationship.tags.length > 0 ? relationship.tags.join(", ") : "-"}</span>
            </Link>
          ))}
        </div>
      )}

      <nav className="pagination" aria-label="Pagination Relationships">
        <span>{result.total} resultat(s)</span>
        <div>
          {result.page > 1 ? <Link className="button subtle-button" href={relationshipsUrl(currentParams, result.page - 1)}>Precedent</Link> : null}
          <span>Page {result.page} / {result.pageCount}</span>
          {result.page < result.pageCount ? <Link className="button subtle-button" href={relationshipsUrl(currentParams, result.page + 1)}>Suivant</Link> : null}
        </div>
      </nav>
    </div>
  );
}

function InputLike(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="input" />;
}
