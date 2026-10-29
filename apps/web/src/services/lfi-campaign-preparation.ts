import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { TenantContext } from "@/types/domain";
import { canManageIonos } from "./ionos-connection";
import { LFI_PROJECT_ID } from "./lfi-campaign-policy";

export async function confirmLfiRegistration(context: TenantContext, recipientId: string) {
 if (!canManageIonos(context)) throw new Error("Accès non autorisé.");
 const db = createSupabaseServiceRoleClient();
 const campaign = await db.from("lfi_campaigns").select("id").eq("tenant_id", context.tenantId).eq("project_id", LFI_PROJECT_ID).single();
 if (campaign.error) throw new Error("Campagne indisponible.");
 const recipient = await db.from("lfi_recipients").select("email").eq("id", recipientId).eq("tenant_id", context.tenantId).eq("campaign_id", campaign.data.id).single();
 if (recipient.error || !recipient.data) throw new Error("Destinataire indisponible.");
 const stopped = await db.rpc("lfi_stop_recipient", { p_tenant: context.tenantId, p_email: recipient.data.email, p_reason: "registered" });
 if (stopped.error) throw new Error("Arrêt non enregistré.");
 return { message: "Inscription confirmée : les messages encore en attente sont annulés pour ce contact." };
}

export function plannedLfiDate(value: string, now = Date.now()) {
 const date = new Date(value);
 if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) || !Number.isFinite(date.getTime()) || date.getTime() <= now || date.getTime() >= Date.parse("2026-12-03T00:00:00+01:00")) throw new Error("Choisissez une date future avant le début de la formation.");
 return date.toISOString();
}

export async function planLfiDrafts(context: TenantContext, value: string) {
 if (!canManageIonos(context)) throw new Error("Accès non autorisé.");
 const dueAt = plannedLfiDate(value);
 const db = createSupabaseServiceRoleClient();
 const campaign = await db.from("lfi_campaigns").select("id,status").eq("tenant_id", context.tenantId).eq("project_id", LFI_PROJECT_ID).single();
 if (campaign.error || campaign.data.status !== "draft") throw new Error("La campagne doit être en brouillon.");
 const recipients = await db.from("lfi_recipients").select("id").eq("tenant_id", context.tenantId).eq("campaign_id", campaign.data.id).eq("status", "ready").limit(1001);
 if (recipients.error || !recipients.data.length || recipients.data.length > 1000) throw new Error("Préparez d’abord les destinataires.");
 const saved = await db.from("lfi_outbox").update({ due_at: dueAt }).eq("tenant_id", context.tenantId).in("recipient_id", recipients.data.map(r => r.id)).eq("status", "queued").eq("step", 1).select("id");
 if (saved.error || !saved.data.length) throw new Error("Aucun brouillon à programmer.");
 return { message: `Date prévue enregistrée pour ${saved.data.length} message(s). La campagne reste en brouillon : aucun envoi automatique n’est activé.` };
}
