import { EmptyState } from "@/components/empty-state";
import { listPeople } from "@/repositories/people";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function PeoplePage() {
  const context = await getTenantContext();
  const people = context ? await listPeople(context) : [];
  return (
    <div className="page stack">
      <header><p className="muted">Talent database</p><h1>People</h1></header>
      {people.length === 0 ? <EmptyState title="Aucune personne" body="Les talents importes ou crees apparaitront ici." /> : (
        <div className="table">{people.map((person) => <article key={person.id} className="row"><strong>{person.display_name}</strong><span>{person.primary_email ?? person.primary_phone ?? "Contact incomplet"}</span><span>{person.city ?? "Ville non renseignee"}</span></article>)}</div>
      )}
    </div>
  );
}
