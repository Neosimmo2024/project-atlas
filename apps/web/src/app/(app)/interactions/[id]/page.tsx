import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteInteractionButton } from "@/components/interactions/delete-interaction-button";
import { SafeBackLink } from "@/components/navigation/safe-back-link";
import { InteractionForm } from "@/components/interactions/interaction-form";
import { TaskCard } from "@/components/tasks/task-card";
import { canDeleteInteractions } from "@/features/interactions/search";
import {
  getInteractionDetail,
  listInteractionOrganizationOptions,
  listInteractionPeopleOptions,
  listInteractionRelationshipOptions,
  listInteractionTypes
} from "@/repositories/interactions";
import { listInteractionTasks } from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";

type InteractionDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeReturnTo(value: string) {
  if (value.startsWith("/people/")) return value;
  if (value.startsWith("/organizations/")) return value;
  if (value === "/interactions" || value.startsWith("/interactions?")) return value;
  return "/interactions";
}

export default async function InteractionDetailPage({ params, searchParams }: InteractionDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getInteractionDetail(context, id);
  if (!detail) notFound();

  const { interaction, type, person, organization, relationship } = detail;
  const returnTo = safeReturnTo(valueOf(query, "returnTo"));
  const [types, peopleOptions, organizationOptions, relationshipOptions, tasks] = await Promise.all([
    listInteractionTypes(context),
    listInteractionPeopleOptions(context),
    listInteractionOrganizationOptions(context),
    listInteractionRelationshipOptions(context),
    listInteractionTasks(context, interaction.id)
  ]);

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Échanges</p>
          <h1>{interaction.title}</h1>
        </div>
        <SafeBackLink fallbackHref={returnTo} />
      </header>

      <div className="grid">
        <section className="card stack">
          <h2>Contexte</h2>
          <p><strong>Type</strong><br />{type?.label ?? "-"}</p>
          <p><strong>Date</strong><br />{formatDate(interaction.interaction_date)}</p>
          <p><strong>Durée</strong><br />{interaction.duration_minutes ? `${interaction.duration_minutes} min` : "-"}</p>
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
          <p><strong>Créé le</strong><br />{formatDate(interaction.created_at)}</p>
          <p><strong>Modifié le</strong><br />{formatDate(interaction.updated_at)}</p>
        </section>
      </div>

      <section className="card stack">
        <h2>Résumé</h2>
        <p>{interaction.summary ?? "Aucun résumé."}</p>
      </section>

      <section className="card stack">
        <h2>Qualification métier</h2>
        <p><strong>Pourquoi changer ?</strong><br />{interaction.change_reason ?? "-"}</p>
        <p><strong>Frein principal</strong><br />{interaction.main_obstacle ?? "-"}</p>
        <p><strong>Timing</strong><br />{interaction.timing ?? "-"}</p>
        <p><strong>Compatibilité ADN</strong><br />{interaction.dna_compatibility ?? "-"}</p>
        <p><strong>Envie de travailler avec cette personne</strong><br />{interaction.work_with_person_desire ?? "-"}</p>
        <p><strong>Commentaires</strong><br />{interaction.comments ?? "-"}</p>
      </section>

      <section className="card stack">
        <div className="page-header">
          <h2>Tâches liées</h2>
          <Link className="button subtle-button" href={`/tasks/new?sourceType=interaction&sourceId=${interaction.id}&interactionId=${interaction.id}`}>Nouvelle tâche</Link>
        </div>
        {tasks.tasks.length === 0 ? <p className="muted">Aucune tâche liée.</p> : tasks.tasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </section>

      <section className="card stack">
        <h2>Modifier</h2>
        <InteractionForm mode="edit" interaction={interaction} types={types} peopleOptions={peopleOptions} organizationOptions={organizationOptions} relationshipOptions={relationshipOptions} />
      </section>

      {canDeleteInteractions(context.role) ? (
        <section className="card stack danger-zone">
          <h2>Suppression</h2>
          <p>Suppression logique réservée aux rôles owner et admin.</p>
          <DeleteInteractionButton interactionId={interaction.id} redirectTo={returnTo} />
        </section>
      ) : null}
    </div>
  );
}
