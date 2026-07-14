"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PERSON_STATUS_LABELS, PERSON_STATUSES, PRIORITIES, PRIORITY_LABELS } from "@/features/people/options";
import type { DuplicateMatch } from "@/features/people/search";
import type { Person } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FieldError = { field: string; message: string };

type PersonFormProps = {
  mode: "create" | "edit";
  person?: Person;
};

function valueOrEmpty(value: string | number | boolean | null | undefined) {
  if (typeof value === "boolean") return value;
  return value ?? "";
}

function formToPayload(form: HTMLFormElement, confirmDuplicate = false) {
  const data = new FormData(form);
  return {
    first_name: String(data.get("first_name") ?? ""),
    last_name: String(data.get("last_name") ?? ""),
    display_name: String(data.get("display_name") ?? ""),
    primary_email: String(data.get("primary_email") ?? ""),
    primary_phone: String(data.get("primary_phone") ?? ""),
    city: String(data.get("city") ?? ""),
    postal_code: String(data.get("postal_code") ?? ""),
    department: String(data.get("department") ?? ""),
    job_title: String(data.get("job_title") ?? ""),
    source: String(data.get("source") ?? ""),
    comments: String(data.get("comments") ?? ""),
    status: String(data.get("status") ?? "to_qualify"),
    priority: String(data.get("priority") ?? "medium"),
    talent_score: String(data.get("talent_score") ?? ""),
    contact_allowed: data.get("contact_allowed") === "on",
    do_not_contact: data.get("do_not_contact") === "on",
    confirmDuplicate
  };
}

export function PersonForm({ mode, person }: PersonFormProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const endpoint = mode === "create" ? "/api/people" : `/api/people/${person?.id}`;
  const errorsByField = fieldErrors.reduce<Record<string, string>>((acc, item) => {
    acc[item.field] = item.message;
    return acc;
  }, {});

  function FieldError({ name }: { name: string }) {
    const message = errorsByField[name];
    return message ? <span className="field-error">{message}</span> : null;
  }

  async function submitForm(form: HTMLFormElement, confirmDuplicate = false) {
    setLoading(true);
    setError(null);
    setFieldErrors([]);

    const payload = formToPayload(form, confirmDuplicate);
    const response = await fetch(endpoint, {
      method: mode === "create" ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    setLoading(false);

    if (response.status === 409) {
      setDuplicates(result.duplicates ?? []);
      return;
    }

    if (!response.ok) {
      setFieldErrors(result.fields ?? []);
      setError(result.error ?? "Impossible d'enregistrer la personne.");
      return;
    }

    router.push(`/people/${result.data.id}`);
    router.refresh();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitForm(event.currentTarget);
  }

  async function submitDespiteDuplicates(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    await submitForm(form, true);
  }

  return (
    <form className="form people-form" onSubmit={submit}>
      {error ? <p className="error">{error}</p> : null}
      {duplicates.length > 0 ? (
        <div className="warning">
          <strong>Doublon potentiel detecte</strong>
          <p>Verifiez ces personnes avant de confirmer la creation ou la modification.</p>
          <ul>
            {duplicates.map((duplicate) => (
              <li key={duplicate.person.id}>
                {duplicate.person.display_name} ({duplicate.reasons.join(", ")})
              </li>
            ))}
          </ul>
          <Button type="button" onClick={submitDespiteDuplicates} disabled={loading}>Continuer sans fusionner</Button>
        </div>
      ) : null}

      <div className="form-grid">
        <label>Prenom<Input name="first_name" defaultValue={valueOrEmpty(person?.first_name) as string} /><FieldError name="first_name" /></label>
        <label>Nom<Input name="last_name" defaultValue={valueOrEmpty(person?.last_name) as string} /><FieldError name="last_name" /></label>
        <label>Nom d&apos;affichage<Input name="display_name" required defaultValue={person?.display_name ?? ""} /><FieldError name="display_name" /></label>
        <label>Email<Input name="primary_email" type="email" defaultValue={valueOrEmpty(person?.primary_email) as string} /><FieldError name="primary_email" /></label>
        <label>Telephone<Input name="primary_phone" defaultValue={valueOrEmpty(person?.primary_phone) as string} /><FieldError name="primary_phone" /></label>
        <label>Ville<Input name="city" defaultValue={valueOrEmpty(person?.city) as string} /><FieldError name="city" /></label>
        <label>Code postal<Input name="postal_code" defaultValue={valueOrEmpty(person?.postal_code) as string} /><FieldError name="postal_code" /></label>
        <label>Departement<Input name="department" defaultValue={valueOrEmpty(person?.department) as string} /><FieldError name="department" /></label>
        <label>Fonction<Input name="job_title" defaultValue={valueOrEmpty(person?.job_title) as string} /><FieldError name="job_title" /></label>
        <label>Source<Input name="source" defaultValue={valueOrEmpty(person?.source) as string} /><FieldError name="source" /></label>
        <label>
          Statut
          <select className="input" name="status" defaultValue={person?.status ?? "to_qualify"}>
            {PERSON_STATUSES.map((status) => <option key={status} value={status}>{PERSON_STATUS_LABELS[status]}</option>)}
          </select>
          <FieldError name="status" />
        </label>
        <label>
          Priorite
          <select className="input" name="priority" defaultValue={person?.priority ?? "medium"}>
            {PRIORITIES.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}
          </select>
          <FieldError name="priority" />
        </label>
        <label>Score<Input name="talent_score" type="number" min={0} max={10} defaultValue={valueOrEmpty(person?.talent_score) as string} /><FieldError name="talent_score" /></label>
      </div>

      <label>Commentaires<textarea className="input textarea" name="comments" defaultValue={valueOrEmpty(person?.comments) as string} /><FieldError name="comments" /></label>
      <div className="checks">
        <label><input name="contact_allowed" type="checkbox" defaultChecked={person?.contact_allowed ?? false} /> Autorisation de contact</label>
        <label><input name="do_not_contact" type="checkbox" defaultChecked={person?.do_not_contact ?? false} /> Ne pas contacter</label>
      </div>
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
