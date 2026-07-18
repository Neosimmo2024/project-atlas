import Link from "next/link";
import {
  ACTION_PLAN_CATEGORY_LABELS,
  ACTION_PLAN_REASON_LABELS,
  actionPlanAddInteractionHref,
  actionPlanCreateTaskHref,
  actionPlanItemHref
} from "@/features/action-plan/presentation";
import type { ActionPlanItem } from "@/types/domain";

function formatDate(value: string | null) {
  if (!value) return "Aucune echeance";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function primaryActionLabel(item: ActionPlanItem) {
  if (item.primaryAction === "complete") return "Ouvrir la tache";
  if (item.primaryAction === "schedule") return "Planifier";
  if (item.primaryAction === "add_interaction") return "Ajouter un echange";
  if (item.primaryAction === "create_task") return "Creer une tache";
  return "Ouvrir";
}

function primaryActionHref(item: ActionPlanItem) {
  if (item.primaryAction === "add_interaction") return actionPlanAddInteractionHref(item);
  if (item.primaryAction === "create_task") return actionPlanCreateTaskHref(item);
  return actionPlanItemHref(item);
}

export function ActionPlanCard({ item }: { item: ActionPlanItem }) {
  return (
    <article className={`card action-plan-card action-plan-${item.category} stack`}>
      <div className="action-plan-card-header">
        <div>
          <p className="action-plan-type">{ACTION_PLAN_CATEGORY_LABELS[item.category]}</p>
          <h2>{item.title}</h2>
        </div>
        <strong className="action-plan-score">{item.score}</strong>
      </div>

      <p>{item.description ?? "Action issue du Plan d'action Atlas."}</p>

      <div className="interaction-meta">
        <span>{formatDate(item.dueAt)}</span>
        <span>{item.sourceType === "task" ? "Tache" : "Relation"}</span>
        {item.snoozeCount > 0 ? <span>{item.snoozeCount} report(s)</span> : null}
      </div>

      <div className="action-plan-reasons">
        {item.reasons.map((reason) => (
          <span key={`${item.id}-${reason.code}`}>
            {ACTION_PLAN_REASON_LABELS[reason.code]} +{reason.weight}
          </span>
        ))}
      </div>

      <div className="actions">
        <Link className="button" href={primaryActionHref(item)}>{primaryActionLabel(item)}</Link>
        <Link className="button subtle-button" href={actionPlanItemHref(item)}>Ouvrir l&apos;element</Link>
        {item.sourceType === "relationship_recommendation" ? (
          <Link className="button subtle-button" href={actionPlanCreateTaskHref(item)}>Creer une tache</Link>
        ) : null}
      </div>
    </article>
  );
}
