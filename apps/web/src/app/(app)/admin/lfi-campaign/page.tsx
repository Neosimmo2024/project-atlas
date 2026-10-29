import { LfiCampaignPreparation } from "@/components/lfi-campaign-preparation";
import { lfiSignaturePreviewHtml } from "@/services/lfi-email-signature";
import { escapeEmailHtml } from "@/services/lfi-campaign-policy";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageIonos } from "@/services/ionos-connection";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { lfiCampaignOverview } from "@/services/lfi-campaigns";
import { eligibleLfiContact, isRealEstateContact } from "@/services/lfi-campaign-policy";
import { LfiCampaignPanel } from "@/components/lfi-campaign-panel";
const statusLabels: Record<string, string> = { draft: "Brouillon", active: "Active", paused: "En pause", completed: "Terminée", queued: "En attente", claimed: "En cours de traitement", accepted: "Accepté par IONOS", uncertain: "À vérifier — résultat incertain", cancelled: "Annulé" };
export const dynamic="force-dynamic";
export default async function Page(){
 const context=await getTenantContext();
 if(!context || !canManageIonos(context))return <p>Accès réservé aux administrateurs de cet espace.</p>;
 try{
  const db=createSupabaseServiceRoleClient();
  const result=await db.from("people").select("id,first_name,last_name,city,primary_email,postal_code,job_title,talent_types,contact_allowed,do_not_contact,status").eq("tenant_id",context.tenantId).eq("contact_allowed",true).eq("do_not_contact",false).not("status","in","(archived,rejected)").not("primary_email","is",null).or("postal_code.like.75%,postal_code.like.77%,postal_code.like.78%,postal_code.like.91%,postal_code.like.92%,postal_code.like.93%,postal_code.like.94%,postal_code.like.95%").order("id").limit(100);
  const suppressed=await db.from("lfi_suppressions").select("email").eq("tenant_id",context.tenantId);
  if(result.error || suppressed.error)throw new Error("UNAVAILABLE");
  const excluded=new Set(suppressed.data.map(r=>r.email));
  const candidates=result.data.filter(p=>eligibleLfiContact(p)&&isRealEstateContact(p)&&!excluded.has(p.primary_email?.trim().toLowerCase())).slice(0,20);
  const overview=await lfiCampaignOverview(context);
  return <div className="page stack"><h1>Campagne Les Formateurs Immo</h1><p>Expertise immobilière — présentiel à Saint-Maur-des-Fossés.</p><section className="card stack"><h2>Préparation uniquement</h2><p>Expéditeur : contact@lesformateursimmo.com. Logo et signature intégrés.</p><p>État : {statusLabels[overview.campaign?.status ?? ""] ?? "À préparer"}. Aucun lancement depuis cet écran.</p><p>Cadence initiale prévue : au plus 20 emails par heure et 100 sur 24 heures, espacés d’au moins 3 minutes.</p><p>Les désinscriptions, réponses et rebonds bloquent les prochains envois. Une invitation au webinaire attend encore sa date et son lien.</p></section><LfiCampaignPanel candidates={candidates}/><LfiCampaignPreparation recipients={overview.recipients} plannedAt={overview.outbox.filter(m=>m.status==="queued" && Date.parse(m.due_at)>Date.now()).map(m=>m.due_at).sort()[0] ?? null}/><section className="card stack"><h2>Brouillons ({overview.outbox.length})</h2><p>« En attente » signifie que le message est préparé. Tant que la campagne reste en brouillon, aucun email ne part.</p>{overview.outbox.map(m=><article key={m.id}><h3>{m.subject}</h3><p>{overview.recipients.find(r=>r.id===m.recipient_id)?.email} — {statusLabels[m.status] ?? "À vérifier"}</p><iframe title={`Aperçu du message : ${m.subject}`} sandbox="" referrerPolicy="no-referrer" style={{width:"100%",height:950,border:"1px solid #e5e7eb",borderRadius:8,background:"white"}} srcDoc={`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>a{pointer-events:none}</style></head><body style="margin:0;padding:24px;background:white"><div style="font-family:Arial,sans-serif;line-height:1.6;color:#142345">${escapeEmailHtml(m.body_text).replaceAll("\n","<br>")}</div>${lfiSignaturePreviewHtml()}<p style="font:12px Arial;color:#666;text-decoration:underline">Ne plus recevoir les e-mails des Formateurs Immo</p></body></html>`}/><p>Logo et signature inclus. Le lien personnel de désinscription sera actif dans l’email envoyé. Les liens sont désactivés dans cet aperçu.</p></article>)}</section></div>;
 }catch{return <div className="page stack"><h1>Campagne Les Formateurs Immo</h1><p>La préparation est temporairement indisponible. Aucun envoi n’a été lancé.</p></div>;}
}
