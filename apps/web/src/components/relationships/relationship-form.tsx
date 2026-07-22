"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RELATIONSHIP_PIPELINE_STAGE_LABELS,
  RELATIONSHIP_PIPELINE_STAGES,
  RELATIONSHIP_STATUS_LABELS,
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_TYPE_LABELS,
  RELATIONSHIP_TYPES
} from "@/features/relationships/options";
import type { RelationshipDuplicateMatch } from "@/features/relationships/search";
import type { Organization, Person, Relationship } from "@/types/domain";

type FieldError = { field: string; message: string };

type RelationshipFormProps = {
  mode: "create" | "edit";
  relationship?: Relationship;
  peopleOptions: Pick<Person, "id" | "display_name">[];
  organizationOptions: Pick<Organization, "id" | "name">[];
};

function valueOrEmpty(value: string | number | boolean | string[] | Record<string, unknown> | null | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  if (typeof value === "boolean") return value;
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
    relationship_type: String(data.get("relationship_type") ?? "recruiting"),
    pipeline_stage: String(data.get("pipeline_stage") ?? "detection"),
    status: String(data.get("status") ?? "active"),
    owner_user_id: String(data.get("owner_user_id") ?? ""),
    score: String(data.get("score") ?? ""),
    confidence: String(data.get("confidence") ?? ""),
    started_at: String(data.get("started_at") ?? ""),
    ended_at: String(data.get("ended_at") ?? ""),
    next_action_at: String(data.get("next_action_at") ?? ""),
    last_interaction_at: String(data.get("last_interaction_at") ?? ""),
    notes: String(data.get("notes") ?? ""),
    tags: String(data.get("tags") ?? ""),
    metadata: String(data.get("metadata") ?? "")
  };
}

export function RelationshipForm({ mode, relationship, peopleOptions, organizationOptions }: RelationshipFormProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<RelationshipDuplicateMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const endpoint = mode === "create" ? "/api/relationships" : `/api/relationships/${relationship?.id}`;
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

  async function submitForm(form: HTMLFormElement) {
    if (submittingRef.current) return;

    submittingRef.current = true;
    let unlockSubmit = true;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setFieldErrors([]);
    setDuplicates([]);

    try {
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(formToPayload(form))
      });
      const result = await readResponseBody(response);

      if (response.status === 409) {
        setDuplicates(result.duplicates ?? []);
        setError(result.error ?? "Une relation active identique existe déjà pour cette personne, cette organisation et ce type.");
        return;
      }

      if (!response.ok) {
        setFieldErrors(result.fields ?? []);
        setError(result.error ?? "Impossible d'enregistrer la relation.");
        return;
      }

      const relationshipId = typeof result.data?.id === "string" ? result.data.id : null;
      if (!relationshipId) {
        setError("La relation a été enregistrée, mais la réponse serveur est incomplète. Ouvrez le Pipeline pour la retrouver.");
        return;
      }

      unlockSubmit = false;
      setSuccess(mode === "create" ? "Relation créée. Redirection en cours..." : "Relation enregistrée. Redirection en cours...");
      router.push(`/relationships/${relationshipId}${mode === "create" ? "?relationshipCreated=1" : "?relationshipSaved=1"}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erreur réseau pendant l'enregistrement de la relation.");
    } finally {
      if (unlockSubmit) submittingRef.current = false;
      setLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitForm(event.currentTarget);
  }

  return (
    <form className="form relationship-form" onSubmit={submit}>
      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="success" role="status">{success}</p> : null}
      {duplicates.length > 0 ? (
        <div className="warning">
          <strong>Relation active identique détectée</strong>
          <p>Vérifiez la relation existante avant de continuer. Aucune fusion automatique n&apos;est effectuée.</p>
          <ul>
            {duplicates.map((duplicate) => (
              <li key={duplicate.relationship.id}>
                {duplicate.relationship.relationship_type} ({duplicate.reasons.join(", ")})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="form-grid">
        <label>
          Personne
          <select className="input" name="person_id" required defaultValue={relationship?.person_id ?? ""}>
            <option value="">Selectionner</option>
            {peopleOptions.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
          </select>
          <FieldError name="person_id" />
        </label>
        <label>
          Organisation
          <select className="input" name="organization_id" required defaultValue={relationship?.organization_id ?? ""}>
            <option value="">Selectionner</option>
            {organizationOptions.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
          <FieldError name="organization_id" />
        </label>
        <label>
          Type
          <select className="input" name="relationship_type" defaultValue={relationship?.relationship_type ?? "recruiting"}>
            {RELATIONSHIP_TYPES.map((type) => <option key={type} value={type}>{RELATIONSHIP_TYPE_LABELS[type]}</option>)}
          </select>
          <FieldError name="relationship_type" />
        </label>
        <label>
          Phase
          <select className="input" name="pipeline_stage" defaultValue={relationship?.pipeline_stage ?? "detection"}>
            {RELATIONSHIP_PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{RELATIONSHIP_PIPELINE_STAGE_LABELS[stage]}</option>)}
          </select>
          <FieldError name="pipeline_stage" />
        </label>
        <label>
          Statut
          <select className="input" name="status" defaultValue={relationship?.status ?? "active"}>
            {RELATIONSHIP_STATUSES.map((status) => <option key={status} value={status}>{RELATIONSHIP_STATUS_LABELS[status]}</option>)}
          </select>
          <FieldError name="status" />
        </label>
        <label>Responsable utilisateur<Input name="owner_user_id" defaultValue={valueOrEmpty(relationship?.owner_user_id) as string} /><FieldError name="owner_user_id" /></label>
        <label>Score<Input name="score" type="number" min={0} max={100} defaultValue={valueOrEmpty(relationship?.score) as string} /><FieldError name="score" /></label>
        <label>Confiance<Input name="confidence" type="number" min={0} max={100} defaultValue={valueOrEmpty(relationship?.confidence) as string} /><FieldError name="confidence" /></label>
        <label>Debut<Input name="started_at" type="datetime-local" defaultValue={toDateTimeLocal(relationship?.started_at)} /><FieldError name="started_at" /></label>
        <label>Fin<Input name="ended_at" type="datetime-local" defaultValue={toDateTimeLocal(relationship?.ended_at)} /><FieldError name="ended_at" /></label>
        <label>Prochaine action<Input name="next_action_at" type="datetime-local" defaultValue={toDateTimeLocal(relationship?.next_action_at)} /><FieldError name="next_action_at" /></label>
        <label>Derniere interaction<Input name="last_interaction_at" type="datetime-local" defaultValue={toDateTimeLocal(relationship?.last_interaction_at)} /><FieldError name="last_interaction_at" /></label>
        <label>Tags<Input name="tags" defaultValue={valueOrEmpty(relationship?.tags) as string} placeholder="recrutement, prioritaire" /><FieldError name="tags" /></label>
      </div>

      <label>Notes<textarea className="input textarea" name="notes" defaultValue={valueOrEmpty(relationship?.notes) as string} /><FieldError name="notes" /></label>
      <label>Metadata JSON<textarea className="input textarea" name="metadata" defaultValue={valueOrEmpty(relationship?.metadata) as string} /><FieldError name="metadata" /></label>
      {fieldErrors.length > 0 ? (
        <ul className="error-list">
          {fieldErrors.map((item) => <li key={`${item.field}-${item.message}`}>{item.message}</li>)}
        </ul>
      ) : null}
      <div className="actions">
        <Button type="submit" disabled={loading || Boolean(success)}>{loading ? "Enregistrement..." : "Enregistrer"}</Button>
      </div>
    </form>
  );
}
