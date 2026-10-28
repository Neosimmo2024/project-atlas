/**
 * VSC read-only reply reconciliation preview.
 * This function never modifies the mailbox, writes a database row,
 * cancels a campaign or dispatches an email.
 */
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { inspectVscInboxHeaders } from "@/services/vsc-ovh-imap";
import { matchVscInboxReplies } from "@/features/vsc-campaign/reply-matching";

export async function previewVscReplyReconciliation(tenantId: string) {
  if (!tenantId || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim())
    throw new Error("Entreprise OVH non autorisée");

  const supabase = createSupabaseServiceRoleClient();
  const { data: sent, error } = await supabase.from("vsc_campaign_deliveries")
    .select("tenant_id,campaign_id,person_id,provider_message_id,people!vsc_delivery_person_tenant_fk(email)")
    .eq("tenant_id", tenantId).eq("channel", "email").eq("status", "sent")
    .not("provider_message_id", "is", null).limit(500);
  if (error) throw error;

  const outbounds = (sent ?? []).flatMap((row) => {
    const people = row.people as unknown as { email?: string | null } | { email?: string | null }[] | null;
    const person = Array.isArray(people) ? people[0] : people;
    return person?.email && row.provider_message_id ? [{
      tenantId: row.tenant_id, campaignId: row.campaign_id, personId: row.person_id,
      recipientEmail: person.email, providerMessageId: row.provider_message_id
    }] : [];
  });
  if (!outbounds.length) return { inspected: 0, matches: [], dryRun: true as const };
  const envelopes = await inspectVscInboxHeaders(100);
  return {
    inspected: envelopes.length,
    matches: matchVscInboxReplies({ tenantId, envelopes, outbounds }),
    dryRun: true as const
  };
}
