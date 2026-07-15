import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteInteractionButton } from "@/components/interactions/delete-interaction-button";
import { InteractionForm } from "@/components/interactions/interaction-form";
import { canDeleteInteractions } from "@/features/interactions/search";
import {
  getInteractionDetail,
  listInteractionOrganizationOptions,
  listInteractionPeopleOptions,
  listInteractionRelationshipOptions,
  listInteractionTypes
} from "@/repositories/interactions";
import { getTenantContext } from "@/repositories/tenant-context";

type InteractionDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function InteractionDetailPage({ params }: InteractionDetailPageProps) {
  const { id } = await params;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getInteractionDetail(context, id);
  if (!detail) notFound();

  const { interaction, type, person, organization, relationship } = detail;
  const [types, peopleOptions, organizationOptions, relationshipOptions] = await Promise.all([
    listInteractionTypes(context),
    listInteractionPeopleOptions(context),
    listInteractionOrganizationOptions(context),
    listInteractionRelationshipOptions(context)
  ]);

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Interactions</p>
          <h1>{interaction.title}</h1>
        </div>
        <Link className="button subtle-button" href="/interactions">Retour</Link>
      </header>

      <div className="grid">
        <section className="card stack">
          <h2>Contexte</h2>
          <p><strong>Type</strong><br />{type?.label ?? "-"}</p>
          <p><strong>Date</strong><br />{formatDate(interaction.interaction_date)}</p>
          <p><strong>Duree</strong><br />{interaction.duration_minutes ? `${interaction.duration_minutes} min` : "-"}</p>
          <p><strong>Lieu</strong><br />{interaction.location ?? "-"}</p>
        </section>
        <section className="card stack">
          <h2>Liens</h2>
          <p><strong>Personne</strong><br />{person ? <Link href={`/people/${person.id}`}>{person.display_name}</Link> : "-"}</p>
          <p><strong>Organisation</strong><br />{organization ? <Link href={`/organizations/${organization.id}`}>{organization.name}</Link> : "-"}</p>
          <p><strong>Relation</strong><br />{relationship ? <Link href={`/relationships/${relationship.id}`}>{relationship.relationship_type} - {relationship.pipeline_stage}</Link> : "-"}</p>
        </section>
        <section className="card stack">
          <h2>Dates</h2>
          <p><strong>Cree le</strong><br />{formatDate(interaction.created_at)}</p>
          <p><strong>Modifie le</strong><br />{formatDate(interaction.updated_at)}</p>
        </section>
      </div>

      <section className="card stack">
        <h2>Resume</h2>
        <p>{interaction.summary ?? "Aucun resume."}</p>
      </section>

      <section className="card stack">
        <h2>Qualification metier</h2>
        <p><strong>Pourquoi changer ?</strong><br />{interaction.change_reason ?? "-"}</p>
        <p><strong>Frein principal</strong><br />{interaction.main_obstacle ?? "-"}</p>
        <p><strong>Timing</strong><br />{interaction.timing ?? "-"}</p>
        <p><strong>Compatibilite ADN</strong><br />{interaction.dna_compatibility ?? "-"}</p>
        <p><strong>Envie de travailler avec cette personne</strong><br />{interaction.work_with_person_desire ?? "-"}</p>
        <p><strong>Commentaires</strong><br />{interaction.comments ?? "-"}</p>
      </section>

      <section className="card stack">
        <h2>Metadata</h2>
        <pre className="code-block">{JSON.stringify(interaction.metadata ?? {}, null, 2)}</pre>
      </section>

      <section className="card stack">
        <h2>Modifier</h2>
        <InteractionForm mode="edit" interaction={interaction} types={types} peopleOptions={peopleOptions} organizationOptions={organizationOptions} relationshipOptions={relationshipOptions} />
      </section>

      {canDeleteInteractions(context.role) ? (
        <section className="card stack danger-zone">
          <h2>Suppression</h2>
          <p>Suppression logique reservee aux roles owner et admin.</p>
          <DeleteInteractionButton interactionId={interaction.id} />
        </section>
      ) : null}
    </div>
  );
}
