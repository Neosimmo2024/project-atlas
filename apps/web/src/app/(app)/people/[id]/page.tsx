import Link from "next/link";
import { notFound } from "next/navigation";
import { DeletePersonButton } from "@/components/people/delete-person-button";
import { PersonForm } from "@/components/people/person-form";
import { PERSON_STATUS_LABELS, PRIORITY_LABELS } from "@/features/people/options";
import { canDeletePeople } from "@/features/people/search";
import { getPersonDetail } from "@/repositories/people";
import { getTenantContext } from "@/repositories/tenant-context";

type PersonDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
  const { id } = await params;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getPersonDetail(context, id);
  if (!detail) notFound();

  const { person, organizations, relationships } = detail;

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">People</p>
          <h1>{person.display_name}</h1>
        </div>
        <Link className="button subtle-button" href="/people">Retour</Link>
      </header>

      <div className="grid">
        <section className="card stack">
          <h2>Identite et coordonnees</h2>
          <p><strong>Prenom</strong><br />{person.first_name ?? "-"}</p>
          <p><strong>Nom</strong><br />{person.last_name ?? "-"}</p>
          <p><strong>Email</strong><br />{person.primary_email ?? "-"}</p>
          <p><strong>Telephone</strong><br />{person.primary_phone ?? "-"}</p>
          <p><strong>Ville</strong><br />{person.city ?? "-"} {person.postal_code ? `(${person.postal_code})` : ""}</p>
          <p><strong>Departement</strong><br />{person.department ?? "-"}</p>
          <p><strong>Fonction</strong><br />{person.job_title ?? "-"}</p>
        </section>
        <section className="card stack">
          <h2>Qualification</h2>
          <p><strong>Statut</strong><br />{PERSON_STATUS_LABELS[person.status]}</p>
          <p><strong>Priorite</strong><br />{PRIORITY_LABELS[person.priority]}</p>
          <p><strong>Score</strong><br />{person.talent_score ?? "-"}</p>
          <p><strong>Source</strong><br />{person.source ?? "-"}</p>
          <p><strong>Contact autorise</strong><br />{person.contact_allowed ? "Oui" : "Non"}</p>
          <p><strong>Ne pas contacter</strong><br />{person.do_not_contact ? "Oui" : "Non"}</p>
        </section>
        <section className="card stack">
          <h2>Dates</h2>
          <p><strong>Cree le</strong><br />{formatDate(person.created_at)}</p>
          <p><strong>Modifie le</strong><br />{formatDate(person.updated_at)}</p>
        </section>
      </div>

      <section className="card stack">
        <h2>Commentaires</h2>
        <p>{person.comments ?? "Aucun commentaire."}</p>
      </section>

      <section className="card stack">
        <h2>Organisations liees</h2>
        {organizations.length === 0 ? <p className="muted">Aucune organisation liee.</p> : organizations.map((organization) => <p key={organization.id}>{organization.name}</p>)}
      </section>

      <section className="card stack">
        <h2>Relations de recrutement liees</h2>
        {relationships.length === 0 ? <p className="muted">Aucune relation liee.</p> : relationships.map((relationship) => (
          <p key={relationship.id}>{relationship.relationship_type} - {relationship.pipeline_stage} - {relationship.status}</p>
        ))}
      </section>

      <section className="card stack">
        <h2>Modifier</h2>
        <PersonForm mode="edit" person={person} />
      </section>

      {canDeletePeople(context.role) ? (
        <section className="card stack danger-zone">
          <h2>Suppression</h2>
          <p>Reservee aux roles owner et admin.</p>
          <DeletePersonButton personId={person.id} />
        </section>
      ) : null}
    </div>
  );
}
