import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteTaskButton } from "@/components/tasks/delete-task-button";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskStatusButton } from "@/components/tasks/task-status-button";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/features/tasks/options";
import { canDeleteTasks } from "@/features/tasks/search";
import {
  getTaskDetail,
  listTaskInteractionOptions,
  listTaskOrganizationOptions,
  listTaskPeopleOptions,
  listTaskRelationshipOptions
} from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";

type TaskDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { id } = await params;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getTaskDetail(context, id);
  if (!detail) notFound();

  const { task, person, organization, relationship, interaction } = detail;
  const [peopleOptions, organizationOptions, relationshipOptions, interactionOptions] = await Promise.all([
    listTaskPeopleOptions(context),
    listTaskOrganizationOptions(context),
    listTaskRelationshipOptions(context),
    listTaskInteractionOptions(context)
  ]);

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Smart Tasks</p>
          <h1>{task.title}</h1>
        </div>
        <Link className="button subtle-button" href="/tasks">Retour</Link>
      </header>

      <div className="grid">
        <section className="card stack">
          <h2>Statut</h2>
          <p><strong>Statut</strong><br />{TASK_STATUS_LABELS[task.status]}</p>
          <p><strong>Priorite</strong><br />{TASK_PRIORITY_LABELS[task.priority]}</p>
          <p><strong>Echeance</strong><br />{formatDate(task.due_at)}</p>
          <p><strong>Terminee le</strong><br />{formatDate(task.completed_at)}</p>
        </section>
        <section className="card stack">
          <h2>Contexte</h2>
          <p><strong>Personne</strong><br />{person ? <Link href={`/people/${person.id}`}>{person.display_name}</Link> : "-"}</p>
          <p><strong>Organisation</strong><br />{organization ? <Link href={`/organizations/${organization.id}`}>{organization.name}</Link> : "-"}</p>
          <p><strong>Relation</strong><br />{relationship ? <Link href={`/relationships/${relationship.id}`}>{relationship.relationship_type} - {relationship.pipeline_stage}</Link> : "-"}</p>
          <p><strong>Interaction</strong><br />{interaction ? <Link href={`/interactions/${interaction.id}`}>{interaction.title}</Link> : "-"}</p>
        </section>
        <section className="card stack">
          <h2>Dates</h2>
          <p><strong>Cree le</strong><br />{formatDate(task.created_at)}</p>
          <p><strong>Modifie le</strong><br />{formatDate(task.updated_at)}</p>
          <p><strong>Assignee a</strong><br />{task.assigned_to ?? "-"}</p>
          <p><strong>Creee par</strong><br />{task.created_by ?? "-"}</p>
        </section>
      </div>

      <section className="card stack">
        <h2>Description</h2>
        <p>{task.description ?? "Aucune description."}</p>
        <p><strong>Raison</strong><br />{task.reason ?? "-"}</p>
      </section>

      <section className="card stack">
        <h2>Actions rapides</h2>
        <div className="actions">
          {task.status !== "completed" ? <TaskStatusButton task={task} nextStatus="completed">Terminer</TaskStatusButton> : <TaskStatusButton task={task} nextStatus="todo">Rouvrir</TaskStatusButton>}
        </div>
      </section>

      <section className="card stack">
        <h2>Modifier</h2>
        <TaskForm
          mode="edit"
          task={task}
          peopleOptions={peopleOptions}
          organizationOptions={organizationOptions}
          relationshipOptions={relationshipOptions}
          interactionOptions={interactionOptions}
        />
      </section>

      {canDeleteTasks(context.role) ? (
        <section className="card stack danger-zone">
          <h2>Suppression</h2>
          <p>Suppression logique reservee aux roles owner et admin.</p>
          <DeleteTaskButton taskId={task.id} />
        </section>
      ) : null}
    </div>
  );
}
