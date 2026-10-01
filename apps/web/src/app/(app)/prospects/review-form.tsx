import { saveProspectReview } from "./review-actions";
export type ProspectReview = {
  list_id: string; siret: string; status: string; kind: string; email: string;
  phone: string; source_url: string; notes: string; reviewed_at: string;
  first_name: string; last_name: string;
  linkedin_url: string; linkedin_status: string; linkedin_role: string;
  linkedin_network: string; linkedin_area: string; linkedin_evidence: string; linkedin_checked_on: string | null;
};
export function ProspectReviewForm({ listId, siret, review }: { listId: string; siret: string; review?: ProspectReview }) {
  return <form action={saveProspectReview} className="stack">
    <input type="hidden" name="listId" value={listId} />
    <input type="hidden" name="siret" value={siret} />
    <label>Activité confirmée<select name="kind" defaultValue={review?.kind ?? "unknown"}>
      <option value="unknown">À confirmer</option><option value="mandataire">Mandataire</option><option value="agence">Agence immobilière</option>
    </select></label>
    <label>Prénom de l’interlocuteur<input name="firstName" maxLength={80} defaultValue={review?.first_name ?? ""} /></label>
    <label>Nom de l’interlocuteur<input name="lastName" maxLength={80} defaultValue={review?.last_name ?? ""} /></label>
    <label>Email professionnel<input name="email" type="email" maxLength={254} defaultValue={review?.email ?? ""} /></label>
    <label>Téléphone professionnel<input name="phone" type="tel" maxLength={30} defaultValue={review?.phone ?? ""} /></label>
    <label>Page source des coordonnées<input name="sourceUrl" type="url" maxLength={2000} defaultValue={review?.source_url ?? ""} placeholder="https://…" /></label>
    <fieldset className="stack">
      <legend>Contrôle LinkedIn</legend>
      <p className="muted">Comparez l’identité, l’activité actuelle, le réseau et le secteur avec la fiche du professionnel. « Paris et périphérie » ne confirme pas Saint-Maur. Ce contrôle est renseigné manuellement.</p>
      <label>Profil LinkedIn<input name="linkedinUrl" type="url" maxLength={2000} defaultValue={review?.linkedin_url ?? ""} placeholder="https://www.linkedin.com/in/…" /></label>
      <label>Résultat du contrôle<select name="linkedinStatus" defaultValue={review?.linkedin_status ?? "not_checked"}>
        <option value="not_checked">Non contrôlé</option><option value="not_found">Profil introuvable</option>
        <option value="unavailable">Profil inaccessible</option><option value="consistent">Cohérent avec les autres sources</option>
        <option value="conflict">Contradiction à résoudre</option>
      </select></label>
      <label>Activité actuelle observée<input name="linkedinRole" maxLength={200} defaultValue={review?.linkedin_role ?? ""} /></label>
      <label>Réseau ou agence observé<input name="linkedinNetwork" maxLength={200} defaultValue={review?.linkedin_network ?? ""} /></label>
      <label>Secteur observé<input name="linkedinArea" maxLength={200} defaultValue={review?.linkedin_area ?? ""} /></label>
      <label>Faits observés et rapprochement avec les autres sources<textarea name="linkedinEvidence" maxLength={1000} defaultValue={review?.linkedin_evidence ?? ""} /></label>
      <label>Date de consultation ou de tentative<input name="linkedinCheckedOn" type="date" defaultValue={review?.linkedin_checked_on ?? ""} /></label>
      <p className="muted">Un profil introuvable ou inaccessible ne suffit pas à écarter un prospect. Une contradiction doit être résolue avant de le retenir.</p>
    </fieldset>
    <label>Notes de vérification<textarea name="notes" maxLength={2000} defaultValue={review?.notes ?? ""} /></label>
    <label>Décision<select name="status" defaultValue={review?.status ?? "pending"}>
      <option value="pending">À vérifier</option><option value="qualified">Retenu après vérification</option><option value="rejected">Écarté</option>
    </select></label>
    <p className="muted">Pour retenir un profil : confirmez son activité, renseignez au moins une coordonnée et sa source. Cette décision ne déclenche aucun envoi.</p>
    <button className="button" type="submit">Enregistrer la vérification</button>
  </form>;
}
