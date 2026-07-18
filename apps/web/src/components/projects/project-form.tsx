"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PROJECT_STAGE_LABELS, PROJECT_TYPE_LABELS } from "@/features/projects/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectOwnerOption, ProjectRelationshipOption } from "@/repositories/projects";
import type { Organization, Person, Project, ProjectStage, ProjectType } from "@/types/domain";

type FieldError = { field: string; message: string };

type ProjectFormProps = {
  mode: "create" | "edit";
  project?: Project;
  defaults?: Partial<Pick<Project, "person_id" | "organization_id" | "relationship_id">>;
  peopleOptions: Pick<Person, "id" | "display_name">[];
  organizationOptions: Pick<Organization, "id" | "name">[];
  relationshipOptions: ProjectRelationshipOption[];
  ownerOptions: ProjectOwnerOption[];
  currentUserId: string;
};

const projectTypes = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];
const projectStages = Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[];

function valueOrEmpty(value: string | number | Record<string, unknown> | null | undefined) {
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return value ?? "";
}

function dateValue(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function formToPayload(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    title: String(data.get("title") ?? ""),
    short_description: String(data.get("short_description") ?? ""),
    project_type: String(data.get("project_type") ?? ""),
    stage: String(data.get("stage") ?? "new"),
    owner_user_id: String(data.get("owner_user_id") ?? ""),
    relationship_id: String(data.get("relationship_id") ?? ""),
    person_id: String(data.get("person_id") ?? ""),
    organization_id: String(data.get("organization_id") ?? ""),
    estimated_value: String(data.get("estimated_value") ?? ""),
    currency: String(data.get("currency") ?? "EUR"),
    expected_close_at: String(data.get("expected_close_at") ?? ""),
    metadata: String(data.get("metadata") ?? "")
  };
}

function changedPayload(project: Project, payload: ReturnType<typeof formToPayload>) {
  const changes: Record<string, unknown> = {};
  const comparable = {
    title: project.title,
    short_description: project.short_description ?? "",
    project_type: project.project_type,
    stage: project.stage,
    owner_user_id: project.owner_user_id,
    relationship_id: project.relationship_id ?? "",
    person_id: project.person_id ?? "",
    organization_id: project.organization_id ?? "",
    estimated_value: project.estimated_value ?? "",
    currency: project.currency,
    expected_close_at: dateValue(project.expected_close_at),
    metadata: JSON.stringify(project.metadata ?? {})
  };

  for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
    if (payload[key] !== comparable[key]) changes[key] = payload[key];
  }
  return changes;
}

export function ProjectForm({ mode, project, defaults, peopleOptions, organizationOptions, relationshipOptions, ownerOptions, currentUserId }: ProjectFormProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [personId, setPersonId] = useState(project?.person_id ?? defaults?.person_id ?? "");
  const [organizationId, setOrganizationId] = useState(project?.organization_id ?? defaults?.organization_id ?? "");
  const [relationshipId, setRelationshipId] = useState(project?.relationship_id ?? defaults?.relationship_id ?? "");
  const errorsByField = fieldErrors.reduce<Record<string, string>>((acc, item) => {
    acc[item.field] = item.message;
    return acc;
  }, {});
  const endpoint = mode === "create" ? "/api/projects" : `/api/projects/${project?.id}`;
  const ownerDefault = project?.owner_user_id ?? currentUserId;
  const relationshipById = useMemo(() => new Map(relationshipOptions.map((relationship) => [relationship.id, relationship])), [relationshipOptions]);

  function FieldError({ name }: { name: string }) {
    const message = errorsByField[name];
    return message ? <span className="field-error">{message}</span> : null;
  }

  function onRelationshipChange(value: string) {
    setRelationshipId(value);
    const relationship = relationshipById.get(value);
    if (relationship) {
      setPersonId(relationship.person_id);
      setOrganizationId(relationship.organization_id ?? "");
    }
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
      const raw = formToPayload(event.currentTarget);
      const payload = mode === "edit" && project ? changedPayload(project, raw) : raw;
      if (mode === "edit" && Object.keys(payload).length === 0) {
        setError("Aucune modification a enregistrer.");
        return;
      }

      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await readResponseBody(response);

      if (!response.ok) {
        setFieldErrors(result.fields ?? []);
        setError(result.error ?? "Impossible d'enregistrer le Projet.");
        return;
      }

      router.push(`/projects/${result.data.id}?projectSaved=1`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erreur reseau pendant l'enregistrement du Projet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form project-form" onSubmit={submit}>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="stack">
        <h2>Projet</h2>
        <div className="form-grid">
          <label>Titre<Input name="title" required defaultValue={project?.title ?? ""} /><FieldError name="title" /></label>
          <label>
            Type
            <select className="input" name="project_type" required defaultValue={project?.project_type ?? "recruitment"}>
              {projectTypes.map((type) => <option key={type} value={type}>{PROJECT_TYPE_LABELS[type]}</option>)}
            </select>
            <FieldError name="project_type" />
          </label>
          <label>
            Responsable
            <select className="input" name="owner_user_id" required defaultValue={ownerDefault}>
              {ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
            </select>
            <FieldError name="owner_user_id" />
          </label>
        </div>
        <label>Description<textarea className="input textarea" name="short_description" defaultValue={valueOrEmpty(project?.short_description) as string} /><FieldError name="short_description" /></label>
      </section>

      <section className="stack">
        <h2>Contacts lies</h2>
        <p className="muted">La personne et organisation sont automatiquement renseignees a partir de la relation selectionnee.</p>
        <div className="form-grid">
          <label>
            Relation
            <select className="input" name="relationship_id" value={relationshipId} onChange={(event) => onRelationshipChange(event.target.value)}>
              <option value="">Aucune relation</option>
              {relationshipOptions.map((relationship) => <option key={relationship.id} value={relationship.id}>{relationship.relationship_type} - {relationship.pipeline_stage}</option>)}
            </select>
            <FieldError name="relationship_id" />
          </label>
          <label>
            Personne
            <select className="input" name="person_id" value={personId} onChange={(event) => setPersonId(event.target.value)}>
              <option value="">Aucune personne</option>
              {peopleOptions.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
            </select>
            <FieldError name="person_id" />
          </label>
          <label>
            Organisation
            <select className="input" name="organization_id" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
              <option value="">Aucune organisation</option>
              {organizationOptions.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
            <FieldError name="organization_id" />
          </label>
        </div>
      </section>

      <section className="stack">
        <h2>Suivi</h2>
        <div className="form-grid">
          <label>
            Etape
            <select className="input" name="stage" defaultValue={project?.stage ?? "new"}>
              {projectStages.map((stage) => <option key={stage} value={stage}>{PROJECT_STAGE_LABELS[stage]}</option>)}
            </select>
            <FieldError name="stage" />
          </label>
          <label>Valeur estimee<Input name="estimated_value" inputMode="decimal" defaultValue={valueOrEmpty(project?.estimated_value) as string} /><FieldError name="estimated_value" /></label>
          <label>Devise<Input name="currency" maxLength={3} defaultValue={project?.currency ?? "EUR"} /><FieldError name="currency" /></label>
          <label>Date de cloture prevue<Input name="expected_close_at" type="date" defaultValue={dateValue(project?.expected_close_at)} /><FieldError name="expected_close_at" /></label>
        </div>
      </section>

      <input type="hidden" name="metadata" value={project ? JSON.stringify(project.metadata ?? {}) : "{}"} />
      {fieldErrors.length > 0 ? <ul className="error-list">{fieldErrors.map((item) => <li key={`${item.field}-${item.message}`}>{item.message}</li>)}</ul> : null}
      <div className="actions">
        <Button type="submit" disabled={loading}>{loading ? "Enregistrement..." : mode === "create" ? "Creer le Projet" : "Enregistrer"}</Button>
        <Link className="button subtle-button" href={project ? `/projects/${project.id}` : "/projects"}>Annuler</Link>
      </div>
    </form>
  );
}
