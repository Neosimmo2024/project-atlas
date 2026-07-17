"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Interaction, InteractionType, Organization, Person, Relationship } from "@/types/domain";

type FieldError = { field: string; message: string };

type InteractionFormProps = {
  mode: "create" | "edit";
  interaction?: Interaction;
  types: Pick<InteractionType, "id" | "label">[];
  peopleOptions: Pick<Person, "id" | "display_name">[];
  organizationOptions: Pick<Organization, "id" | "name">[];
  relationshipOptions: Pick<Relationship, "id" | "relationship_type" | "pipeline_stage" | "status">[];
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

function formToPayload(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    person_id: String(data.get("person_id") ?? ""),
    organization_id: String(data.get("organization_id") ?? ""),
    relationship_id: String(data.get("relationship_id") ?? ""),
    type_id: String(data.get("type_id") ?? ""),
    title: String(data.get("title") ?? ""),
    summary: String(data.get("summary") ?? ""),
    interaction_date: String(data.get("interaction_date") ?? ""),
    duration_minutes: String(data.get("duration_minutes") ?? ""),
    location: String(data.get("location") ?? ""),
    change_reason: String(data.get("change_reason") ?? ""),
    main_obstacle: String(data.get("main_obstacle") ?? ""),
    timing: String(data.get("timing") ?? ""),
    dna_compatibility: String(data.get("dna_compatibility") ?? ""),
    work_with_person_desire: String(data.get("work_with_person_desire") ?? ""),
    comments: String(data.get("comments") ?? ""),
    metadata: String(data.get("metadata") ?? "")
  };
}

export function InteractionForm({ mode, interaction, types, peopleOptions, organizationOptions, relationshipOptions }: InteractionFormProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const endpoint = mode === "create" ? "/api/interactions" : `/api/interactions/${interaction?.id}`;
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
        setError(result.error ?? "Impossible d'enregistrer l'interaction.");
        return;
      }

      router.push(`/interactions/${result.data.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erreur reseau pendant l'enregistrement de l'interaction.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form interaction-form" onSubmit={submit}>
      {error ? <p className="error">{error}</p> : null}

      <div className="form-grid">
        <label>
          Type
          <select className="input" name="type_id" required defaultValue={interaction?.type_id ?? types[0]?.id ?? ""}>
            <option value="">Selectionner</option>
            {types.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
          <FieldError name="type_id" />
        </label>
        <label>Titre<Input name="title" required defaultValue={interaction?.title ?? ""} /><FieldError name="title" /></label>
        <label>Date<Input name="interaction_date" type="datetime-local" required defaultValue={toDateTimeLocal(interaction?.interaction_date) || new Date().toISOString().slice(0, 16)} /><FieldError name="interaction_date" /></label>
        <label>Duree minutes<Input name="duration_minutes" type="number" min={0} max={1440} defaultValue={valueOrEmpty(interaction?.duration_minutes) as string} /><FieldError name="duration_minutes" /></label>
        <label>Lieu<Input name="location" defaultValue={valueOrEmpty(interaction?.location) as string} /><FieldError name="location" /></label>
        <label>
          Personne
          <select className="input" name="person_id" defaultValue={interaction?.person_id ?? ""}>
            <option value="">Aucune personne</option>
            {peopleOptions.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
          </select>
          <FieldError name="person_id" />
        </label>
        <label>
          Organisation
          <select className="input" name="organization_id" defaultValue={interaction?.organization_id ?? ""}>
            <option value="">Aucune organisation</option>
            {organizationOptions.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
          <FieldError name="organization_id" />
        </label>
        <label>
          Relation
          <select className="input" name="relationship_id" defaultValue={interaction?.relationship_id ?? ""}>
            <option value="">Aucune relation</option>
            {relationshipOptions.map((relationship) => (
              <option key={relationship.id} value={relationship.id}>{relationship.relationship_type} - {relationship.pipeline_stage}</option>
            ))}
          </select>
          <FieldError name="relationship_id" />
        </label>
      </div>

      <label>Resume<textarea className="input textarea" name="summary" defaultValue={valueOrEmpty(interaction?.summary) as string} /><FieldError name="summary" /></label>

      <div className="form-grid">
        <label>Pourquoi cette personne souhaite-t-elle changer ?<textarea className="input textarea" name="change_reason" defaultValue={valueOrEmpty(interaction?.change_reason) as string} /><FieldError name="change_reason" /></label>
        <label>Frein principal<textarea className="input textarea" name="main_obstacle" defaultValue={valueOrEmpty(interaction?.main_obstacle) as string} /><FieldError name="main_obstacle" /></label>
        <label>Timing<Input name="timing" defaultValue={valueOrEmpty(interaction?.timing) as string} /><FieldError name="timing" /></label>
        <label>Compatibilite ADN<Input name="dna_compatibility" defaultValue={valueOrEmpty(interaction?.dna_compatibility) as string} /><FieldError name="dna_compatibility" /></label>
        <label>Envie de travailler avec cette personne<Input name="work_with_person_desire" defaultValue={valueOrEmpty(interaction?.work_with_person_desire) as string} /><FieldError name="work_with_person_desire" /></label>
      </div>

      <label>Commentaires<textarea className="input textarea" name="comments" defaultValue={valueOrEmpty(interaction?.comments) as string} /><FieldError name="comments" /></label>
      <label>Metadata JSON<textarea className="input textarea" name="metadata" defaultValue={valueOrEmpty(interaction?.metadata) as string} /><FieldError name="metadata" /></label>

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
