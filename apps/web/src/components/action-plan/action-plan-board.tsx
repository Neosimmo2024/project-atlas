"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  actionPlanAddInteractionHref,
  buildPlanTaskPayload,
  buildSnoozePayload,
  actionPlanItemHref,
  completedTodayLabel,
  groupActionPlanItems,
  optimisticRemoveActionPlanItem,
  publicActionPlanCard,
  restoreActionPlanItem
} from "@/features/action-plan/presentation";
import type { ActionPlanUiItem } from "@/features/action-plan/presentation";
import type { InteractionType, TaskStatus } from "@/types/domain";

export type DoneTodayUiItem = {
  id: string;
  title: string;
  completedAt: string;
  href: string;
  label: string;
};

type ActionPlanBoardProps = {
  initialItems: ActionPlanUiItem[];
  doneToday: DoneTodayUiItem[];
  interactionTypes: Pick<InteractionType, "id" | "label">[];
};

type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ModalState =
  | { type: "snooze"; item: ActionPlanUiItem }
  | { type: "plan"; item: ActionPlanUiItem }
  | { type: "interaction"; item: ActionPlanUiItem }
  | { type: "task"; item: ActionPlanUiItem }
  | null;

function todayAt(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextMonday() {
  const date = new Date();
  const day = date.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  return addDays(todayAt(9), daysUntilMonday);
}

function dateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function isoFromLocal(value: string) {
  return new Date(value).toISOString();
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text };
  }
}

export function ActionPlanBoard({ initialItems, doneToday, interactionTypes }: ActionPlanBoardProps) {
  const [items, setItems] = useState(initialItems);
  const [done, setDone] = useState(doneToday);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupActionPlanItems(items), [items]);

  async function postAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/action-plan/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await readResponse(response);
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Action impossible.");
    return body;
  }

  async function complete(item: ActionPlanUiItem) {
    if (item.sourceType !== "task") return;
    setLoadingId(item.id);
    setError(null);
    setItems((current) => optimisticRemoveActionPlanItem(current, item.id));

    try {
      const body = await postAction({ action: "complete_task", taskId: item.sourceId });
      const data = body.data as { previousStatus?: TaskStatus; previousCompletedAt?: string | null } | undefined;
      setDone((current) => [{ id: item.id, title: item.title, href: actionPlanItemHref(item), label: "Action terminée", completedAt: new Date().toISOString() }, ...current]);
      const timer = window.setTimeout(() => setToast(null), 5000);
      setToast({
        message: "Action terminée.",
        actionLabel: "Annuler",
        onAction: async () => {
          window.clearTimeout(timer);
          await postAction({
            action: "undo_complete_task",
            taskId: item.sourceId,
            previousStatus: data?.previousStatus ?? "todo",
            previousCompletedAt: data?.previousCompletedAt ?? null
          });
          setItems((current) => restoreActionPlanItem(current, item));
          setDone((current) => current.filter((doneItem) => doneItem.id !== item.id));
          setToast(null);
        }
      });
    } catch (completeError) {
      setItems((current) => restoreActionPlanItem(current, item));
      setError(completeError instanceof Error ? completeError.message : "La mise à jour a échoué.");
      setToast({ message: "La mise à jour a échoué.", actionLabel: "Réessayer", onAction: () => void complete(item) });
    } finally {
      setLoadingId(null);
    }
  }

  async function submitSnooze(item: ActionPlanUiItem, value: string) {
    setLoadingId(item.id);
    setError(null);
    const previous = items;
    setItems((current) => optimisticRemoveActionPlanItem(current, item.id));
    try {
      await postAction(buildSnoozePayload(item, isoFromLocal(value)));
      setToast({ message: "Action reportée." });
      setModal(null);
    } catch (snoozeError) {
      setItems(previous);
      setError(snoozeError instanceof Error ? snoozeError.message : "Le report a échoué.");
      setToast({ message: "Le report a échoué.", actionLabel: "Réessayer", onAction: () => setModal({ type: "snooze", item }) });
    } finally {
      setLoadingId(null);
    }
  }

  async function submitPlan(item: ActionPlanUiItem, value: string) {
    setLoadingId(item.id);
    setError(null);
    try {
      await postAction(buildPlanTaskPayload(item, isoFromLocal(value)));
      setItems((current) => optimisticRemoveActionPlanItem(current, item.id));
      setToast({ message: "Action planifiée." });
      setModal(null);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "La planification a échoué.");
      setToast({ message: "La planification a échoué.", actionLabel: "Réessayer", onAction: () => setModal({ type: "plan", item }) });
    } finally {
      setLoadingId(null);
    }
  }

  async function submitInteraction(item: ActionPlanUiItem, form: FormData) {
    setLoadingId(item.id);
    setError(null);
    try {
      await postAction({
        action: "add_interaction",
        itemId: item.id,
        organizationId: item.organizationId,
        personId: item.personId,
        relationshipId: item.relationshipId,
        typeId: String(form.get("typeId") ?? ""),
        notes: String(form.get("notes") ?? ""),
        interactionDate: isoFromLocal(String(form.get("interactionDate") ?? ""))
      });
      setItems((current) => optimisticRemoveActionPlanItem(current, item.id));
      setDone((current) => [{ id: item.id, title: item.title, href: actionPlanAddInteractionHref(item), label: "Échange ajouté", completedAt: new Date().toISOString() }, ...current]);
      setToast({ message: "Échange ajouté." });
      setModal(null);
    } catch (interactionError) {
      setError(interactionError instanceof Error ? interactionError.message : "La création de l’échange a échoué.");
      setToast({ message: "La création a échoué.", actionLabel: "Réessayer", onAction: () => setModal({ type: "interaction", item }) });
    } finally {
      setLoadingId(null);
    }
  }

  async function submitTask(item: ActionPlanUiItem, form: FormData) {
    setLoadingId(item.id);
    setError(null);
    try {
      await postAction({
        action: "create_task",
        itemId: item.id,
        organizationId: item.organizationId,
        personId: item.personId,
        relationshipId: item.relationshipId,
        title: String(form.get("title") ?? ""),
        dueAt: isoFromLocal(String(form.get("dueAt") ?? ""))
      });
      setItems((current) => optimisticRemoveActionPlanItem(current, item.id));
      setToast({ message: "Tâche créée." });
      setModal(null);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "La création de la tâche a échoué.");
      setToast({ message: "La création a échoué.", actionLabel: "Réessayer", onAction: () => setModal({ type: "task", item }) });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="error action-plan-error">{error}</p> : null}
      {items.length === 0 ? (
        <section className="empty-state">
          <h2>Tout est sous contrôle</h2>
          <p>Aucune action prioritaire n’est nécessaire pour le moment.</p>
        </section>
      ) : null}

      {groups.map((group) => (
        <section className="stack" key={group.category}>
          <h2 className="action-plan-section-title">{publicActionPlanCard(group.items[0]).categoryLabel}</h2>
          <div className="action-plan-list">
            {group.items.map((item) => {
              const card = publicActionPlanCard(item);
              return (
              <article className={`card action-plan-card action-plan-${item.category} stack`} key={item.id}>
                <div className="action-plan-card-header">
                  <div>
                    <p className="action-plan-type">{card.categoryLabel}</p>
                    <h3>{card.title}</h3>
                  </div>
                </div>
                <p><strong>Élément lié</strong><br />{card.entityName}</p>
                <p>{card.primaryReason}</p>
                {expanded === item.id ? (
                  <div className="action-plan-explanation">
                    {card.reasons.map((reason) => <p key={`${item.id}-${reason}`}>{reason}</p>)}
                  </div>
                ) : null}
                <div className="actions">
                  <button
                    className="button"
                    type="button"
                    disabled={loadingId === item.id}
                    onClick={() => {
                      if (item.sourceType === "task" && item.dueAt) void complete(item);
                      else if (item.sourceType === "task") setModal({ type: "plan", item });
                      else setModal({ type: "interaction", item });
                    }}
                  >
                    {loadingId === item.id ? "Traitement..." : card.primaryAction.label}
                  </button>
                  {card.secondaryActions.map((action) => {
                    if (action.key === "open") return <Link className="button subtle-button" href={actionPlanItemHref(item)} key={action.key}>{action.label}</Link>;
                    if (action.key === "create_task") return <button className="button subtle-button" type="button" key={action.key} onClick={() => setModal({ type: "task", item })}>{action.label}</button>;
                    return <button className="button subtle-button" type="button" key={action.key} onClick={() => setModal({ type: "snooze", item })}>{action.label}</button>;
                  })}
                  <button className="button subtle-button" type="button" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>Pourquoi cette action ?</button>
                </div>
              </article>
              );
            })}
          </div>
        </section>
      ))}

      <details className="card stack action-plan-done">
        <summary>{completedTodayLabel(done.length)}</summary>
        {done.length === 0 ? <p className="muted">Aucune action réalisée depuis le Plan d’action aujourd’hui.</p> : done.map((item) => (
          <p key={item.id}><Link href={item.href}>{item.title}</Link><br /><span className="muted">{item.label}</span></p>
        ))}
      </details>

      {modal ? (
        <ActionPlanModal
          modal={modal}
          interactionTypes={interactionTypes}
          onClose={() => setModal(null)}
          onSnooze={submitSnooze}
          onPlan={submitPlan}
          onInteraction={submitInteraction}
          onTask={submitTask}
        />
      ) : null}

      {toast ? (
        <div className="action-plan-toast" role="status">
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction ? <button type="button" onClick={toast.onAction}>{toast.actionLabel}</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function ActionPlanModal({ modal, interactionTypes, onClose, onSnooze, onPlan, onInteraction, onTask }: {
  modal: Exclude<ModalState, null>;
  interactionTypes: Pick<InteractionType, "id" | "label">[];
  onClose: () => void;
  onSnooze: (item: ActionPlanUiItem, value: string) => Promise<void>;
  onPlan: (item: ActionPlanUiItem, value: string) => Promise<void>;
  onInteraction: (item: ActionPlanUiItem, form: FormData) => Promise<void>;
  onTask: (item: ActionPlanUiItem, form: FormData) => Promise<void>;
}) {
  const tomorrow = addDays(todayAt(9), 1);
  const threeDays = addDays(todayAt(9), 3);

  return (
    <div className="action-plan-modal-backdrop">
      <div className="card action-plan-modal stack" role="dialog" aria-modal="true">
        <div className="page-header">
          <h2>{modal.type === "interaction" ? "Ajouter un échange" : modal.type === "task" ? "Créer une tâche" : modal.type === "plan" ? "Planifier" : "Reporter"}</h2>
          <button className="button subtle-button" type="button" onClick={onClose}>Fermer</button>
        </div>

        {modal.type === "snooze" ? (
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void onSnooze(modal.item, String(form.get("customSnooze") || form.get("snoozedUntil") || ""));
          }}>
            <select className="input" name="snoozedUntil" defaultValue={dateTimeLocal(tomorrow)}>
              <option value={dateTimeLocal(todayAt(17))}>Plus tard aujourd’hui</option>
              <option value={dateTimeLocal(tomorrow)}>Demain matin</option>
              <option value={dateTimeLocal(threeDays)}>Dans 3 jours</option>
              <option value={dateTimeLocal(nextMonday())}>Lundi prochain</option>
            </select>
            <label>Choisir une date<input className="input" name="customSnooze" type="datetime-local" /></label>
            <button className="button" type="submit">Reporter</button>
          </form>
        ) : null}

        {modal.type === "plan" ? (
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void onPlan(modal.item, String(form.get("customDue") || form.get("dueAt") || ""));
          }}>
            <select className="input" name="dueAt" defaultValue={dateTimeLocal(todayAt(18))}>
              <option value={dateTimeLocal(todayAt(18))}>Aujourd’hui</option>
              <option value={dateTimeLocal(tomorrow)}>Demain</option>
              <option value={dateTimeLocal(threeDays)}>Cette semaine</option>
            </select>
            <label>Choisir une date<input className="input" name="customDue" type="datetime-local" /></label>
            <button className="button" type="submit">Planifier</button>
          </form>
        ) : null}

        {modal.type === "interaction" ? (
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            void onInteraction(modal.item, new FormData(event.currentTarget));
          }}>
            <label>Type d’échange<select className="input" name="typeId" defaultValue={interactionTypes[0]?.id ?? ""}>{interactionTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
            <label>Notes<textarea className="input textarea" name="notes" /></label>
            <label>Date<input className="input" name="interactionDate" type="datetime-local" defaultValue={dateTimeLocal(new Date())} /></label>
            <button className="button" type="submit">Ajouter l’échange</button>
          </form>
        ) : null}

        {modal.type === "task" ? (
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            void onTask(modal.item, new FormData(event.currentTarget));
          }}>
            <label>Titre<input className="input" name="title" defaultValue={`Relancer ${modal.item.entityName}`} /></label>
            <label>Échéance<input className="input" name="dueAt" type="datetime-local" defaultValue={dateTimeLocal(tomorrow)} /></label>
            <p className="muted">Relation présélectionnée et priorité normale.</p>
            <button className="button" type="submit">Créer la tâche</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
