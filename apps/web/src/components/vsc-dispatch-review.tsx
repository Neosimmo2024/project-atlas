import { getVscDispatchReview } from "@/services/vsc-dispatch-review";

function dateLabel(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date indisponible";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

/** Server-only component, rendered after the page's VSC administrator authorization. */
export async function VscDispatchReview({ tenantId }: { tenantId: string }) {
  let review;
  try { review = await getVscDispatchReview(tenantId); }
  catch { return <section className="card stack"><h2>Tentatives à vérifier</h2><p role="alert">La liste est temporairement indisponible. Aucun nouvel envoi ne doit être déduit de cette absence de résultat.</p></section>; }
  return <section className="card stack" aria-label="Vérification des tentatives email">
    <h2>Tentatives à vérifier</h2>
    <p>Les résultats incertains et les tentatives en cours sont bloqués contre un second envoi. Une tentative en cours peut encore se terminer : rechargez la page avant toute vérification.</p>
    {review.rows.length === 0 ? <p>Aucune tentative en cours ou incertaine à vérifier.</p> : <ul className="stack">{review.rows.map(row => <li key={row.deliveryId}>
      <p><strong>{row.outcome === "unknown" ? "Résultat incertain" : "Tentative en cours ou interrompue"}</strong> — {dateLabel(row.startedAt)} (Paris)</p>
      <p>Livraison : <code>{row.deliveryId}</code><br />Campagne : <code>{row.campaignId}</code><br />Contact : <code>{row.personId}</code></p>
      <p>Identifiant du message à rechercher : <code>{row.messageId}</code></p>
    </li>)}</ul>}
    {review.truncated ? <p role="status">Liste partielle : les 50 premières tentatives sont affichées. Demandez une vérification technique de la suite.</p> : null}
    <details><summary>Comment vérifier un résultat incertain</summary>
      <ol>
        <li>Relever la livraison et l’identifiant exact du message ; vérifier que la tentative ne se termine plus.</li>
        <li>Demander la trace d’acceptation ou de refus SMTP correspondant à cet identifiant auprès d’OVH. L’absence dans le dossier Envoyés ne prouve pas l’absence d’envoi.</li>
        <li>Conserver la preuve et faire vérifier le résultat par l’administrateur technique. Sans preuve concluante, laisser la livraison bloquée.</li>
      </ol>
      <p>Cette page ne modifie aucun résultat et ne permet aucun renvoi. Une acceptation SMTP ne garantit pas la livraison finale dans la boîte du destinataire.</p>
    </details>
  </section>;
}
