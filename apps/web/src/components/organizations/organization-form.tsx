"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ORGANIZATION_STATUS_LABELS, ORGANIZATION_STATUSES, ORGANIZATION_TYPE_LABELS, ORGANIZATION_TYPES } from "@/features/organizations/options";
import type { OrganizationDuplicateMatch } from "@/features/organizations/search";
import type { Organization } from "@/types/domain";

type FieldError = { field: string; message: string };

type OrganizationFormProps = {
  mode: "create" | "edit";
  organization?: Organization;
  parentOptions: Pick<Organization, "id" | "name">[];
};

function valueOrEmpty(value: string | boolean | null | undefined) {
  if (typeof value === "boolean") return value;
  return value ?? "";
}

function formToPayload(form: HTMLFormElement, confirmDuplicate = false) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") ?? ""),
    legal_name: String(data.get("legal_name") ?? ""),
    organization_type: String(data.get("organization_type") ?? "other"),
    status: String(data.get("status") ?? "active"),
    address_line1: String(data.get("address_line1") ?? ""),
    address_line2: String(data.get("address_line2") ?? ""),
    postal_code: String(data.get("postal_code") ?? ""),
    city: String(data.get("city") ?? ""),
    department: String(data.get("department") ?? ""),
    country: String(data.get("country") ?? ""),
    primary_phone: String(data.get("primary_phone") ?? ""),
    primary_email: String(data.get("primary_email") ?? ""),
    website_url: String(data.get("website_url") ?? ""),
    siren: String(data.get("siren") ?? ""),
    siret: String(data.get("siret") ?? ""),
    vat_number: String(data.get("vat_number") ?? ""),
    parent_organization_id: String(data.get("parent_organization_id") ?? ""),
    source: String(data.get("source") ?? ""),
    comments: String(data.get("comments") ?? ""),
    contact_allowed: data.get("contact_allowed") === "on",
    do_not_contact: data.get("do_not_contact") === "on",
    confirmDuplicate
  };
}

export function OrganizationForm({ mode, organization, parentOptions }: OrganizationFormProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<OrganizationDuplicateMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const endpoint = mode === "create" ? "/api/organizations" : `/api/organizations/${organization?.id}`;
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

  async function submitForm(form: HTMLFormElement, confirmDuplicate = false) {
    setLoading(true);
    setError(null);
    setFieldErrors([]);
    setDuplicates([]);

    try {
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(formToPayload(form, confirmDuplicate))
      });
      const result = await readResponseBody(response);

      if (response.status === 409) {
        setDuplicates(result.duplicates ?? []);
        return;
      }

      if (!response.ok) {
        setFieldErrors(result.fields ?? []);
        setError(result.error ?? "Impossible d'enregistrer l'organisation.");
        return;
      }

      router.push(`/organizations/${result.data.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erreur reseau pendant l'enregistrement de l'organisation.");
    } finally {
      setLoading(false);
    }
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
    <form className="form organization-form" onSubmit={submit}>
      {error ? <p className="error">{error}</p> : null}
      {duplicates.length > 0 ? (
        <div className="warning">
          <strong>Doublon potentiel detecte</strong>
          <p>Verifiez ces organisations avant de confirmer la creation ou la modification.</p>
          <ul>
            {duplicates.map((duplicate) => (
              <li key={duplicate.organization.id}>
                {duplicate.organization.name} ({duplicate.reasons.join(", ")})
              </li>
            ))}
          </ul>
          <Button type="button" onClick={submitDespiteDuplicates} disabled={loading}>Continuer sans fusionner</Button>
        </div>
      ) : null}

      <div className="form-grid">
        <label>Nom<Input name="name" required defaultValue={organization?.name ?? ""} /><FieldError name="name" /></label>
        <label>Raison sociale<Input name="legal_name" defaultValue={valueOrEmpty(organization?.legal_name) as string} /><FieldError name="legal_name" /></label>
        <label>
          Type
          <select className="input" name="organization_type" defaultValue={organization?.organization_type ?? "other"}>
            {ORGANIZATION_TYPES.map((type) => <option key={type} value={type}>{ORGANIZATION_TYPE_LABELS[type]}</option>)}
          </select>
          <FieldError name="organization_type" />
        </label>
        <label>
          Statut
          <select className="input" name="status" defaultValue={organization?.status ?? "active"}>
            {ORGANIZATION_STATUSES.map((status) => <option key={status} value={status}>{ORGANIZATION_STATUS_LABELS[status]}</option>)}
          </select>
          <FieldError name="status" />
        </label>
        <label>Adresse<Input name="address_line1" defaultValue={valueOrEmpty(organization?.address_line1) as string} /><FieldError name="address_line1" /></label>
        <label>Complement d&apos;adresse<Input name="address_line2" defaultValue={valueOrEmpty(organization?.address_line2) as string} /><FieldError name="address_line2" /></label>
        <label>Code postal<Input name="postal_code" defaultValue={valueOrEmpty(organization?.postal_code) as string} /><FieldError name="postal_code" /></label>
        <label>Ville<Input name="city" defaultValue={valueOrEmpty(organization?.city) as string} /><FieldError name="city" /></label>
        <label>Departement<Input name="department" defaultValue={valueOrEmpty(organization?.department) as string} /><FieldError name="department" /></label>
        <label>Pays<Input name="country" defaultValue={valueOrEmpty(organization?.country) as string} /><FieldError name="country" /></label>
        <label>Telephone<Input name="primary_phone" defaultValue={valueOrEmpty(organization?.primary_phone) as string} /><FieldError name="primary_phone" /></label>
        <label>Email<Input name="primary_email" type="email" defaultValue={valueOrEmpty(organization?.primary_email) as string} /><FieldError name="primary_email" /></label>
        <label>Site internet<Input name="website_url" type="url" defaultValue={valueOrEmpty(organization?.website_url) as string} /><FieldError name="website_url" /></label>
        <label>SIREN<Input name="siren" inputMode="numeric" defaultValue={valueOrEmpty(organization?.siren) as string} /><FieldError name="siren" /></label>
        <label>SIRET<Input name="siret" inputMode="numeric" defaultValue={valueOrEmpty(organization?.siret) as string} /><FieldError name="siret" /></label>
        <label>TVA intracommunautaire<Input name="vat_number" defaultValue={valueOrEmpty(organization?.vat_number) as string} /><FieldError name="vat_number" /></label>
        <label>
          Reseau parent eventuel
          <select className="input" name="parent_organization_id" defaultValue={organization?.parent_organization_id ?? ""}>
            <option value="">Aucun parent</option>
            {parentOptions.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
          </select>
          <FieldError name="parent_organization_id" />
        </label>
        <label>Source<Input name="source" defaultValue={valueOrEmpty(organization?.source) as string} /><FieldError name="source" /></label>
      </div>

      <label>Commentaires<textarea className="input textarea" name="comments" defaultValue={valueOrEmpty(organization?.comments) as string} /><FieldError name="comments" /></label>
      <div className="checks">
        <label><input name="contact_allowed" type="checkbox" defaultChecked={organization?.contact_allowed ?? false} /> Autorisation de contact</label>
        <label><input name="do_not_contact" type="checkbox" defaultChecked={organization?.do_not_contact ?? false} /> Ne pas contacter</label>
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
