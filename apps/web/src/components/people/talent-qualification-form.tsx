"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QUALIFICATION_CONCLUSIONS, QUALIFICATION_CONCLUSION_LABELS } from "@/features/talent-qualification/options";
import type { TalentQualification } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = { personId: string; qualification: TalentQualification | null; canEdit: boolean };
type FieldError = { field: string; message: string };
const value = (input: string | number | null | undefined) => input ?? "";

export function TalentQualificationForm({ personId, qualification, canEdit }: Props) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries());
    payload.action = submitter.value;
    setLoading(true); setErrors([]); setMessage(null);
    const response = await fetch(`/api/people/${personId}/qualification`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) { setErrors(result.fields ?? []); setMessage(result.error ?? "Enregistrement impossible."); return; }
    setMessage(payload.action === "finalize" ? "Qualification terminée." : "Brouillon enregistré.");
    router.refresh();
  }

  const errorFor = (name: string) => errors.find((item) => item.field === name)?.message;

  return (
    <form className="form qualification-form" onSubmit={submit}>
      {message ? <p className={errors.length ? "error" : "success"}>{message}</p> : null}
      <div className="form-grid">
        <label>Expérience immobilière<Input name="experience_level" defaultValue={value(qualification?.experience_level)} disabled={!canEdit} /></label>
        <label>Statut professionnel actuel<Input name="professional_status" defaultValue={value(qualification?.professional_status)} disabled={!canEdit} /></label>
        <label>Ancienneté dans l’immobilier (années)<Input name="years_in_real_estate" type="number" min={0} max={80} defaultValue={value(qualification?.years_in_real_estate)} disabled={!canEdit} />{errorFor("years_in_real_estate") ? <span className="field-error">{errorFor("years_in_real_estate")}</span> : null}</label>
        <label>Situation vis-à-vis de la TVA<Input name="vat_situation" defaultValue={value(qualification?.vat_situation)} disabled={!canEdit} /></label>
        <label>Réseau ou structure actuelle<Input name="current_network" defaultValue={value(qualification?.current_network)} disabled={!canEdit} /></label>
        <label>Secteur géographique travaillé<Input name="geographic_area" defaultValue={value(qualification?.geographic_area)} disabled={!canEdit} /></label>
        <label>Disponibilité<Input name="availability" defaultValue={value(qualification?.availability)} disabled={!canEdit} /></label>
        <label>Niveau de maturité du projet<Input name="project_maturity" defaultValue={value(qualification?.project_maturity)} disabled={!canEdit} /></label>
      </div>
      <label>Motivation<textarea className="input textarea" name="motivation" defaultValue={value(qualification?.motivation)} disabled={!canEdit} /></label>
      <label>Besoin principal identifié<textarea className="input textarea" name="primary_need" defaultValue={value(qualification?.primary_need)} disabled={!canEdit} /></label>
      <label>Commentaire de qualification<textarea className="input textarea" name="comments" defaultValue={value(qualification?.comments)} disabled={!canEdit} /></label>
      <label>Conclusion
        <select className="input" name="conclusion" defaultValue={qualification?.conclusion ?? ""} disabled={!canEdit}>
          <option value="">À décider</option>
          {QUALIFICATION_CONCLUSIONS.map((item) => <option key={item} value={item}>{QUALIFICATION_CONCLUSION_LABELS[item]}</option>)}
        </select>
        {errorFor("conclusion") ? <span className="field-error">{errorFor("conclusion")}</span> : null}
      </label>
      {canEdit ? <div className="actions qualification-actions">
        <Button type="submit" name="action" value="draft" disabled={loading}>Enregistrer le brouillon</Button>
        <Button type="submit" name="action" value="finalize" disabled={loading}>Terminer la qualification</Button>
      </div> : <p className="muted">Votre rôle permet la consultation, mais pas la modification.</p>}
    </form>
  );
}
