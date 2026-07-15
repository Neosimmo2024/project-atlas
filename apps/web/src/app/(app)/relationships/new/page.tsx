import Link from "next/link";
import { RelationshipForm } from "@/components/relationships/relationship-form";
import { listRelationshipOrganizationOptions, listRelationshipPeopleOptions } from "@/repositories/relationships";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function NewRelationshipPage() {
  const context = await getTenantContext();
  const peopleOptions = context ? await listRelationshipPeopleOptions(context) : [];
  const organizationOptions = context ? await listRelationshipOrganizationOptions(context) : [];

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Relationships</p>
          <h1>Nouvelle relation</h1>
        </div>
        <Link className="button subtle-button" href="/relationships">Retour</Link>
      </header>
      <section className="card">
        <RelationshipForm mode="create" peopleOptions={peopleOptions} organizationOptions={organizationOptions} />
      </section>
    </div>
  );
}
