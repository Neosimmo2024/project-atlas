import { lfiOtherCampaignExclusions } from "./lfi-campaign-overlap";
import { randomBytes, randomUUID } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { TenantContext } from "@/types/domain";
import { canManageIonos, createIonosTransport, IONOS_SENDER } from "./ionos-connection";
import { LFI_PROJECT_ID, eligibleLfiContact, isRealEstateContact, escapeEmailHtml } from "./lfi-campaign-policy";
import { LFI_SIGNATURE_HTML, LFI_SIGNATURE_TEXT, lfiSignatureAttachments } from "./lfi-email-signature";

export async function lfiCampaignOverview(context: TenantContext) {
 if (!canManageIonos(context)) throw new Error("Accès non autorisé.");
 const db = createSupabaseServiceRoleClient();
 const campaign = await db.from("lfi_campaigns").select("id,status,hourly_limit,daily_limit,mailbox_checked_at").eq("tenant_id", context.tenantId).eq("project_id", LFI_PROJECT_ID).maybeSingle();
 if (campaign.error) throw new Error("Campagne temporairement indisponible.");
 if (!campaign.data) return { campaign: null, recipients: [], outbox: [] };
 const recipients = await db.from("lfi_recipients").select("id,email,status").eq("campaign_id", campaign.data.id).eq("tenant_id", context.tenantId).order("created_at").limit(100);
 if (recipients.error) throw new Error("Destinataires indisponibles.");
 if (!recipients.data.length) return { campaign: campaign.data, recipients: [], outbox: [] };
 const outbox = await db.from("lfi_outbox").select("id,recipient_id,step,status,subject,body_text,due_at").eq("tenant_id", context.tenantId).in("recipient_id", recipients.data.map(r => r.id)).order("due_at").limit(100);
 if (outbox.error) throw new Error("Messages indisponibles.");
 return { campaign: campaign.data, recipients: recipients.data, outbox: outbox.data };
}

export async function prepareLfiPilot(context: TenantContext) {
 if (!canManageIonos(context)) throw new Error("Accès non autorisé.");
 const db = createSupabaseServiceRoleClient();
 const project = await db.from("projects").select("id").eq("id", LFI_PROJECT_ID).eq("tenant_id", context.tenantId).eq("status", "open").is("archived_at", null).maybeSingle();
 if (project.error || !project.data) throw new Error("Projet de formation indisponible.");
 const created = await db.from("lfi_campaigns").upsert({ tenant_id: context.tenantId, project_id: LFI_PROJECT_ID }, { onConflict: "tenant_id,project_id", ignoreDuplicates: true });
 if (created.error) throw new Error("Préparation impossible.");
 return lfiCampaignOverview(context);
}

/** Explicit reviewed contact IDs only; caller cannot supply arbitrary addresses. No SMTP. */
export async function queueLfiInitialDrafts(context: TenantContext, ids: string[]) {
 if (!canManageIonos(context) || ids.length < 1 || ids.length > 20 || new Set(ids).size !== ids.length) throw new Error("Sélection de 1 à 20 contacts requise.");
 const overview = await prepareLfiPilot(context);
 if (!overview.campaign || overview.campaign.status !== "draft") throw new Error("La campagne doit être en brouillon.");
 const db = createSupabaseServiceRoleClient();
 const people = await db.from("people").select("id,first_name,primary_email,postal_code,job_title,talent_types,contact_allowed,do_not_contact,status").eq("tenant_id", context.tenantId).in("id", ids);
 if (people.error || people.data.length !== ids.length || people.data.some(p => (!eligibleLfiContact(p) || !isRealEstateContact(p)))) throw new Error("La sélection contient un contact exclu, sans email ou hors Île-de-France.");
 const overlaps = await lfiOtherCampaignExclusions(db, context.tenantId, ids);
 if (overlaps.size) throw new Error("Un contact est déjà sollicité par une autre campagne.");
 for (const person of people.data) {
  const email = person.primary_email.trim().toLowerCase();
  const suppressed = await db.from("lfi_suppressions").select("email").eq("tenant_id", context.tenantId).eq("email", email).maybeSingle();
  if (suppressed.error || suppressed.data) throw new Error("La sélection contient une adresse exclue.");
  const recipient = await db.from("lfi_recipients").upsert({ tenant_id: context.tenantId, campaign_id: overview.campaign.id, person_id: person.id, email, unsubscribe_token: randomBytes(32).toString("hex") }, { onConflict: "campaign_id,email", ignoreDuplicates: true });
  if (recipient.error) throw new Error("Enregistrement du brouillon impossible.");
  const stored = await db.from("lfi_recipients").select("id").eq("campaign_id", overview.campaign.id).eq("email", email).single();
  if (stored.error) throw new Error("Brouillon indisponible.");
  const body = `Bonjour${person.first_name ? " " + person.first_name : ""},\n\nVous passez du temps à visiter les biens, rechercher des références et expliquer leur valeur. Et si vous développiez une prestation d’expertise payante en complément de vos transactions ?\n\nNotre formation « Devenir expert immobilier – Expertise en valeur vénale » vous permet de travailler les méthodes d’évaluation et la rédaction d’un rapport argumenté.\n\nLa prochaine session se déroule en présentiel à Saint-Maur-des-Fossés, les 3 et 4 décembre 2026, puis les 13 et 14 janvier 2027.\n\n4 jours, 28 heures, 1 700 €.\n\nUne prise en charge AGEFICE est possible selon votre situation et sous réserve d’accord. C’est le moment de vérifier vos possibilités de financement.\n\nPaiement en 4 fois possible, sous conditions.\n\nLe programme :\nhttps://www.lesformateursimmo.com/formation/formation-expertise-valeur-venale\n\nVous souhaitez en parler ? Répondez simplement à cet e-mail.`;
  const queued = await db.from("lfi_outbox").upsert({ tenant_id: context.tenantId, recipient_id: stored.data.id, step: 1, due_at: new Date().toISOString(), subject: "Et si vous facturiez aussi votre expertise immobilière ?", body_text: body, message_id: `<lfi-${randomUUID()}@lesformateursimmo.com>` }, { onConflict: "recipient_id,step", ignoreDuplicates: true });
  if (queued.error) throw new Error("Enregistrement du message impossible.");
 }
 return lfiCampaignOverview(context);
}

/** Requires a deliberately enabled campaign and a fresh successful mailbox sync. No automatic retry. */
export async function dispatchLfiOne(context: TenantContext) {
 if (!canManageIonos(context)) throw new Error("Accès non autorisé.");
 const origin = process.env.LFI_CAMPAIGN_PUBLIC_ORIGIN;
 if (!origin || !/^https:\/\/[^/]+$/.test(origin) || !process.env.LFI_IONOS_SMTP_PASSWORD) throw new Error("Configuration de campagne incomplète.");
 const db = createSupabaseServiceRoleClient();
 const claimed = await db.rpc("lfi_claim_next", { p_tenant: context.tenantId, p_project: LFI_PROJECT_ID });
 if (claimed.error) throw new Error("File d’envoi indisponible.");
 const row = claimed.data?.[0];
 if (!row) return { success: true, message: "Aucun message à envoyer : campagne en pause, quota, exclusion ou contrôle des réponses requis." };
 const recipient = await db.from("lfi_recipients").select("email,status,unsubscribe_token,person_id").eq("id", row.recipient_id).eq("tenant_id", context.tenantId).single();
 const suppressions = recipient.data ? await db.from("lfi_suppressions").select("email").eq("tenant_id",context.tenantId).eq("email",recipient.data.email).maybeSingle() : null;
 const person = recipient.data ? await db.from("people").select("primary_email,postal_code,job_title,talent_types,contact_allowed,do_not_contact,status").eq("id",recipient.data.person_id).eq("tenant_id",context.tenantId).single() : null;
 if (recipient.error || !recipient.data || recipient.data.status !== "ready" || !suppressions || suppressions.error || suppressions.data || !person || person.error || (!eligibleLfiContact(person.data)||!isRealEstateContact(person.data)) || person.data.primary_email.trim().toLowerCase() !== recipient.data.email) {
  await db.from("lfi_outbox").update({status:"cancelled",completed_at:new Date().toISOString()}).eq("id",row.id);
  return { success:false, message:"Message bloqué par les exclusions ou un contrôle indisponible." };
 }
 const overlaps = await lfiOtherCampaignExclusions(db,context.tenantId,[recipient.data.person_id]);
 if(overlaps.size){await db.from("lfi_outbox").update({status:"cancelled",completed_at:new Date().toISOString()}).eq("id",row.id);return {success:false,message:"Contact déjà sollicité par une autre campagne."};}
 const unsubscribe = `${origin}/lfi/unsubscribe?token=${recipient.data.unsubscribe_token}`;
 const transport = createIonosTransport(process.env.LFI_IONOS_SMTP_PASSWORD);
 let accepted = false;
 try {
  const result = await transport.sendMail({ from:{name:"Renato Ponzio — Les Formateurs Immo",address:IONOS_SENDER},to:recipient.data.email,replyTo:IONOS_SENDER,messageId:row.message_id,subject:row.subject,
   text: `${row.body_text}\n\n${LFI_SIGNATURE_TEXT}\n\nNe plus recevoir nos e-mails : ${unsubscribe}`,
   html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#142345">${escapeEmailHtml(row.body_text).replaceAll("\n","<br>")}</div>${LFI_SIGNATURE_HTML}<p style="font:12px Arial"><a href="${unsubscribe}">Ne plus recevoir les e-mails des Formateurs Immo</a></p>`,
   attachments:lfiSignatureAttachments(),headers:{"List-Unsubscribe":`<${unsubscribe}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}
  });
  accepted=result.accepted.some(a=>typeof a==="string" && a.toLowerCase()===recipient.data.email);
 } catch { /* Ambiguous SMTP result: retain claim and never retry. */ } finally { transport.close(); }
 const saved=await db.from("lfi_outbox").update({status:accepted?"accepted":"uncertain",completed_at:new Date().toISOString()}).eq("id",row.id).eq("status","claimed");
 return {success:accepted&&!saved.error,message:accepted&&!saved.error?"Message accepté par IONOS.":"Résultat incertain : contrôle manuel requis, aucun renvoi automatique."};
}
