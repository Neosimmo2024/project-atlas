import { getVscSmsDraftContacts } from "@/services/vsc-sms-draft-contacts";
export async function VscSmsDraftContacts({ tenantId }: { tenantId: string }) {
  let result;
  try { result = await getVscSmsDraftContacts(tenantId); }
  catch { return <section className="card stack"><h2>Contacts mobiles VSC</h2><p role="alert">La liste est temporairement indisponible. Rechargez la page pour réessayer.</p></section>; }
  return <section className="card stack" aria-label="Contacts mobiles VendreSonCommerce">
    <h2>Contacts mobiles VSC</h2>
    <p>Mobiles français 06/07 avec autorisation de contact dans VSC, sans opposition globale ou SMS ni réponse connue. Les variantes d’un même numéro sont regroupées ; une opposition ou réponse sur une fiche VSC liée à ce mobile l’exclut.</p>
    <p>Consultation uniquement : aucune sélection enregistrée, aucun destinataire transmis à Brevo. Les contrôles devront être refaits avant toute future sauvegarde de destinataires ou tentative d’envoi.</p>
    {result.contacts.length === 0 ? <p>Aucun contact mobile éligible dans VendreSonCommerce.</p> : <ul>{result.contacts.map(contact => <li key={contact.id}>
      <strong>{contact.display_name}</strong> — {contact.mobile} — {contact.has_email ? "Email disponible : parcours avec rappel SMS à J+5 à vérifier" : "Mobile seul : parcours SMS à J0, J+15, J+30 et J+45 à vérifier"}
    </li>)}</ul>}
    {result.truncated ? <p>Liste partielle : les 100 premiers mobiles sont affichés.</p> : null}
    <p className="muted">Les autres pays, numéros fixes, formats ambigus et numéros incomplets ne sont pas proposés. La séparation des données Brevo et les retours STOP restent à finaliser.</p>
  </section>;
}
