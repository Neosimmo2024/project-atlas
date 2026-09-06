import Link from "next/link";
import { PersonForm } from "@/components/people/person-form";
import { listRelationshipOrganizationOptions } from "@/repositories/relationships";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function NewPersonPage() {
  const context = await getTenantContext();
  const organizationOptions = context ? await listRelationshipOrganizationOptions(context) : [];

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Personnes</p>
          <h1>Nouvelle personne</h1>
        </div>
        <Link className="button subtle-button" href="/people">Retour</Link>
      </header>
      <section className="card">
        <PersonForm mode="create" organizationOptions={organizationOptions} />
      </section>
    </div>
  );
}
