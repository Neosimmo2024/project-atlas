import Link from "next/link";
import type { InputHTMLAttributes } from "react";
import { EmptyState } from "@/components/empty-state";
import { PERSON_STATUS_LABELS, PERSON_STATUSES, PRIORITIES, PRIORITY_LABELS } from "@/features/people/options";
import { listPeople } from "@/repositories/people";
import { getTenantContext } from "@/repositories/tenant-context";

type PeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function peopleUrl(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/people?${next.toString()}`;
}

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  const query = valueOf(params, "query");
  const status = valueOf(params, "status");
  const priority = valueOf(params, "priority");
  const page = Number(valueOf(params, "page") || 1);
  const currentParams = new URLSearchParams();
  if (query) currentParams.set("query", query);
  if (status) currentParams.set("status", status);
  if (priority) currentParams.set("priority", priority);

  const result = context ? await listPeople(context, { query, status, priority, page, pageSize: 10 }) : { people: [], total: 0, page: 1, pageSize: 10, pageCount: 1 };

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Talent database</p>
          <h1>People</h1>
        </div>
        <Link className="button link-button" href="/people/new">Nouvelle personne</Link>
      </header>

      <form className="filters" action="/people">
        <label>Recherche<InputLike name="query" defaultValue={query} placeholder="Nom, email, telephone, ville" /></label>
        <label>
          Statut
          <select className="input" name="status" defaultValue={status}>
            <option value="">Tous</option>
            {PERSON_STATUSES.map((item) => <option key={item} value={item}>{PERSON_STATUS_LABELS[item]}</option>)}
          </select>
        </label>
        <label>
          Priorite
          <select className="input" name="priority" defaultValue={priority}>
            <option value="">Toutes</option>
            {PRIORITIES.map((item) => <option key={item} value={item}>{PRIORITY_LABELS[item]}</option>)}
          </select>
        </label>
        <button className="button" type="submit">Filtrer</button>
      </form>

      {result.people.length === 0 ? <EmptyState title="Aucune personne" body="Les talents importes ou crees apparaitront ici." /> : (
        <div className="data-table people-table">
          <div className="table-head">
            <span>Nom</span><span>Prenom</span><span>Email</span><span>Telephone</span><span>Ville</span><span>Statut</span><span>Priorite</span><span>Score</span><span>Source</span>
          </div>
          {result.people.map((person) => (
            <Link key={person.id} href={`/people/${person.id}`} className="table-row">
              <span>{person.last_name ?? "-"}</span>
              <span>{person.first_name ?? "-"}</span>
              <span>{person.primary_email ?? "-"}</span>
              <span>{person.primary_phone ?? "-"}</span>
              <span>{person.city ?? "-"}</span>
              <span>{PERSON_STATUS_LABELS[person.status]}</span>
              <span>{PRIORITY_LABELS[person.priority]}</span>
              <span>{person.talent_score ?? "-"}</span>
              <span>{person.source ?? "-"}</span>
            </Link>
          ))}
        </div>
      )}

      <nav className="pagination" aria-label="Pagination People">
        <span>{result.total} resultat(s)</span>
        <div>
          {result.page > 1 ? <Link className="button subtle-button" href={peopleUrl(currentParams, result.page - 1)}>Precedent</Link> : null}
          <span>Page {result.page} / {result.pageCount}</span>
          {result.page < result.pageCount ? <Link className="button subtle-button" href={peopleUrl(currentParams, result.page + 1)}>Suivant</Link> : null}
        </div>
      </nav>
    </div>
  );
}

function InputLike(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="input" />;
}
