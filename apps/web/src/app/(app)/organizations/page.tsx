import Link from "next/link";
import type { InputHTMLAttributes } from "react";
import { EmptyState } from "@/components/empty-state";
import { ORGANIZATION_STATUS_LABELS, ORGANIZATION_STATUSES, ORGANIZATION_TYPE_LABELS, ORGANIZATION_TYPES } from "@/features/organizations/options";
import { listOrganizations } from "@/repositories/organizations";
import { getTenantContext } from "@/repositories/tenant-context";

type OrganizationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function organizationsUrl(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/organizations?${next.toString()}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

export default async function OrganizationsPage({ searchParams }: OrganizationsPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  const query = valueOf(params, "query");
  const type = valueOf(params, "type");
  const status = valueOf(params, "status");
  const sort = valueOf(params, "sort") || "created_desc";
  const page = Number(valueOf(params, "page") || 1);
  const currentParams = new URLSearchParams();
  if (query) currentParams.set("query", query);
  if (type) currentParams.set("type", type);
  if (status) currentParams.set("status", status);
  if (sort) currentParams.set("sort", sort);

  const result = context ? await listOrganizations(context, { query, type, status, sort, page, pageSize: 10 }) : { organizations: [], total: 0, page: 1, pageSize: 10, pageCount: 1 };

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Companies and networks</p>
          <h1>Organizations</h1>
        </div>
        <Link className="button link-button" href="/organizations/new">Nouvelle organisation</Link>
      </header>

      <form className="filters organizations-filters" action="/organizations">
        <label>Recherche<InputLike name="query" defaultValue={query} placeholder="Nom, ville, email, telephone, SIREN" /></label>
        <label>
          Type
          <select className="input" name="type" defaultValue={type}>
            <option value="">Tous</option>
            {ORGANIZATION_TYPES.map((item) => <option key={item} value={item}>{ORGANIZATION_TYPE_LABELS[item]}</option>)}
          </select>
        </label>
        <label>
          Statut
          <select className="input" name="status" defaultValue={status}>
            <option value="">Tous</option>
            {ORGANIZATION_STATUSES.map((item) => <option key={item} value={item}>{ORGANIZATION_STATUS_LABELS[item]}</option>)}
          </select>
        </label>
        <label>
          Tri
          <select className="input" name="sort" defaultValue={sort}>
            <option value="created_desc">Creation recente</option>
            <option value="created_asc">Creation ancienne</option>
            <option value="name_asc">Nom A-Z</option>
            <option value="name_desc">Nom Z-A</option>
          </select>
        </label>
        <button className="button" type="submit">Filtrer</button>
      </form>

      {result.organizations.length === 0 ? <EmptyState title="Aucune organisation" body="Les entreprises, agences et reseaux seront listes ici." /> : (
        <div className="data-table organizations-table">
          <div className="table-head">
            <span>Nom</span><span>Type</span><span>Ville</span><span>Code postal</span><span>Departement</span><span>Telephone</span><span>Email</span><span>Site</span><span>SIREN</span><span>Statut</span><span>Source</span><span>Creation</span>
          </div>
          {result.organizations.map((organization) => (
            <Link key={organization.id} href={`/organizations/${organization.id}`} className="table-row">
              <span>{organization.name}</span>
              <span>{organization.organization_type ? ORGANIZATION_TYPE_LABELS[organization.organization_type as keyof typeof ORGANIZATION_TYPE_LABELS] ?? organization.organization_type : "-"}</span>
              <span>{organization.city ?? "-"}</span>
              <span>{organization.postal_code ?? "-"}</span>
              <span>{organization.department ?? "-"}</span>
              <span>{organization.primary_phone ?? "-"}</span>
              <span>{organization.primary_email ?? "-"}</span>
              <span>{organization.website_url ?? "-"}</span>
              <span>{organization.siren ?? "-"}</span>
              <span>{ORGANIZATION_STATUS_LABELS[organization.status]}</span>
              <span>{organization.source ?? "-"}</span>
              <span>{formatDate(organization.created_at)}</span>
            </Link>
          ))}
        </div>
      )}

      <nav className="pagination" aria-label="Pagination Organizations">
        <span>{result.total} resultat(s)</span>
        <div>
          {result.page > 1 ? <Link className="button subtle-button" href={organizationsUrl(currentParams, result.page - 1)}>Precedent</Link> : null}
          <span>Page {result.page} / {result.pageCount}</span>
          {result.page < result.pageCount ? <Link className="button subtle-button" href={organizationsUrl(currentParams, result.page + 1)}>Suivant</Link> : null}
        </div>
      </nav>
    </div>
  );
}

function InputLike(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="input" />;
}
