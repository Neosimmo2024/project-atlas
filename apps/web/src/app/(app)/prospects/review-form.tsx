import { saveProspectReview } from "./review-actions";
export type ProspectReview = {
  list_id: string; siret: string; status: string; kind: string; email: string;
  phone: string; source_url: string; notes: string; reviewed_at: string;
};
export function ProspectReviewForm({ listId, siret, review }: { listId: string; siret: string; review?: ProspectReview }) {
  return <form action={saveProspectReview} className="stack">
    <input type="hidden" name="listId" value={listId} />
    <input type="hidden" name="siret" value={siret} />
    <label>Activité confirmée<select name="kind" defaultValue={review?.kind ?? "unknown"}>
      <option value="unknown">À confirmer</option><option value="mandataire">Mandataire</option><option value="agence">Agence immobilière</option>
    </select></label>
    <label>Email professionnel<input name="email" type="email" maxLength={254} defaultValue={review?.email ?? ""} /></label>
    <label>Téléphone professionnel<input name="phone" type="tel" maxLength={30} defaultValue={review?.phone ?? ""} /></label>
    <label>Page source des coordonnées<input name="sourceUrl" type="url" maxLength={2000} defaultValue={review?.source_url ?? ""} placeholder="https://…" /></label>
    <label>Notes de vérification<textarea name="notes" maxLength={2000} defaultValue={review?.notes ?? ""} /></label>
    <label>Décision<select name="status" defaultValue={review?.status ?? "pending"}>
      <option value="pending">À vérifier</option><option value="qualified">Retenu après vérification</option><option value="rejected">Écarté</option>
    </select></label>
    <p className="muted">Pour retenir un profil : confirmez son activité, renseignez au moins une coordonnée et sa source. Cette décision ne déclenche aucun envoi.</p>
    <button className="button" type="submit">Enregistrer la vérification</button>
  </form>;
}
