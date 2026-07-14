import Link from "next/link";
import { OrganizationForm } from "@/components/organizations/organization-form";
import { listParentOrganizationOptions } from "@/repositories/organizations";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function NewOrganizationPage() {
  const context = await getTenantContext();
  const parentOptions = context ? await listParentOrganizationOptions(context) : [];

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Organizations</p>
          <h1>Nouvelle organisation</h1>
        </div>
        <Link className="button subtle-button" href="/organizations">Retour</Link>
      </header>
      <section className="card">
        <OrganizationForm mode="create" parentOptions={parentOptions} />
      </section>
    </div>
  );
}
