"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/features/tasks/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Interaction, Organization, Person, Project, Relationship, Task, TaskSourceType } from "@/types/domain";

type FieldError = { field: string; message: string };

type TaskFormProps = {
  mode: "create" | "edit";
  task?: Task;
  defaults?: Partial<Pick<Task, "person_id" | "organization_id" | "relationship_id" | "interaction_id" | "project_id" | "source_type" | "source_id" | "due_at" | "priority">>;
  peopleOptions: Pick<Person, "id" | "display_name">[];
  organizationOptions: Pick<Organization, "id" | "name">[];
  relationshipOptions: Pick<Relationship, "id" | "relationship_type" | "pipeline_stage">[];
  interactionOptions: Pick<Interaction, "id" | "title">[];
  projectOptions?: Pick<Project, "id" | "title">[];
};

function valueOrEmpty(value: string | number | Record<string, unknown> | null | undefined) {
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return value ?? "";
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function defaultValue(task: Task | undefined, defaults: TaskFormProps["defaults"], key: keyof NonNullable<TaskFormProps["defaults"]>) {
  return task?.[key] ?? defaults?.[key] ?? "";
}

function formToPayload(form: HTMLFormElement) {
  const data = new FormData(form);
  const sourceType = String(data.get("source_type") ?? "") as TaskSourceType | "";
  return {
    title: String(data.get("title") ?? ""),
    description: String(data.get("description") ?? ""),
    status: String(data.get("status") ?? "todo"),
    priority: String(data.get("priority") ?? "normal"),
    due_at: String(data.get("due_at") ?? ""),
    assigned_to: String(data.get("assigned_to") ?? ""),
    person_id: String(data.get("person_id") ?? ""),
    organization_id: String(data.get("organization_id") ?? ""),
    relationship_id: String(data.get("relationship_id") ?? ""),
    interaction_id: String(data.get("interaction_id") ?? ""),
    project_id: String(data.get("project_id") ?? ""),
    source_type: sourceType || null,
    source_id: String(data.get("source_id") ?? ""),
    reason: String(data.get("reason") ?? ""),
    metadata: String(data.get("metadata") ?? "")
  };
}

function sourceTypeValue(task: Task | undefined, defaults: TaskFormProps["defaults"]) {
  if (task?.source_type) return task.source_type;
  return defaults?.source_id ? defaults.source_type ?? "" : "";
}

export function TaskForm({ mode, task, defaults, peopleOptions, organizationOptions, relationshipOptions, interactionOptions, projectOptions = [] }: TaskFormProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const endpoint = mode === "create" ? "/api/tasks" : `/api/tasks/${task?.id}`;
  const errorsByField = fieldErrors.reduce<Record<string, string>>((acc, item) => {
    acc[item.field] = item.message;
    return acc;
  }, {});

  function FieldError({ name }: { name: string }) {
    const message = errorsByField[name];
    return message ? <span className="field-error">{message}</span> : null;
  }

  async function readResponseBody(response: Response) {
    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors([]);

    try {
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(formToPayload(event.currentTarget))
      });
      const result = await readResponseBody(response);

      if (!response.ok) {
        setFieldErrors(result.fields ?? []);
        setError(result.error ?? "Impossible d'enregistrer la tache.");
        return;
      }

      router.push(`/tasks/${result.data.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erreur reseau pendant l'enregistrement de la tache.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form task-form" onSubmit={submit}>
      {error ? <p className="error">{error}</p> : null}

      <div className="form-grid">
        <label>Titre<Input name="title" required defaultValue={task?.title ?? ""} /><FieldError name="title" /></label>
        <label>
          Statut
          <select className="input" name="status" defaultValue={task?.status ?? "todo"}>
            {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <FieldError name="status" />
        </label>
        <label>
          Priorite
          <select className="input" name="priority" defaultValue={task?.priority ?? "normal"}>
            {TASK_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <FieldError name="priority" />
        </label>
        <label>Echeance<Input name="due_at" type="datetime-local" defaultValue={toDateTimeLocal(task?.due_at)} /><FieldError name="due_at" /></label>
      </div>
      <input type="hidden" name="assigned_to" value={valueOrEmpty(task?.assigned_to) as string} />

      <label>Description<textarea className="input textarea" name="description" defaultValue={valueOrEmpty(task?.description) as string} /><FieldError name="description" /></label>

      <div className="form-grid">
        <label>
          Personne
          <select className="input" name="person_id" defaultValue={defaultValue(task, defaults, "person_id")}>
            <option value="">Aucune personne</option>
            {peopleOptions.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
          </select>
          <FieldError name="person_id" />
        </label>
        <label>
          Organisation
          <select className="input" name="organization_id" defaultValue={defaultValue(task, defaults, "organization_id")}>
            <option value="">Aucune organisation</option>
            {organizationOptions.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
          <FieldError name="organization_id" />
        </label>
        <label>
          Relation
          <select className="input" name="relationship_id" defaultValue={defaultValue(task, defaults, "relationship_id")}>
            <option value="">Aucune relation</option>
            {relationshipOptions.map((relationship) => <option key={relationship.id} value={relationship.id}>{relationship.relationship_type} - {relationship.pipeline_stage}</option>)}
          </select>
          <FieldError name="relationship_id" />
        </label>
        <label>
          Interaction
          <select className="input" name="interaction_id" defaultValue={defaultValue(task, defaults, "interaction_id")}>
            <option value="">Aucune interaction</option>
            {interactionOptions.map((interaction) => <option key={interaction.id} value={interaction.id}>{interaction.title}</option>)}
          </select>
          <FieldError name="interaction_id" />
        </label>
        <label>
          Projet
          <select className="input" name="project_id" defaultValue={defaultValue(task, defaults, "project_id")}>
            <option value="">Aucun projet</option>
            {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
          <FieldError name="project_id" />
        </label>
      </div>

      <label>Raison<Input name="reason" defaultValue={valueOrEmpty(task?.reason) as string} /><FieldError name="reason" /></label>
      <input type="hidden" name="source_type" value={sourceTypeValue(task, defaults)} />
      <input type="hidden" name="source_id" value={defaultValue(task, defaults, "source_id")} />
      <input type="hidden" name="metadata" value={valueOrEmpty(task?.metadata) as string} />
      <FieldError name="source_type" />
      <FieldError name="source_id" />
      <FieldError name="metadata" />

      {fieldErrors.length > 0 ? (
        <ul className="error-list">
          {fieldErrors.map((item) => <li key={`${item.field}-${item.message}`}>{item.message}</li>)}
        </ul>
      ) : null}
      <div className="actions">
        <Button type="submit" disabled={loading}>{loading ? "Enregistrement..." : "Enregistrer"}</Button>
      </div>
    </form>
  );
}
