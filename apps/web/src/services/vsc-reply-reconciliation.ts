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
    .select("tenant_id,campaign_id,person_id,provider_message_id,people!vsc_delivery_person_tenant_fk(primary_email)")
    .eq("tenant_id", tenantId).eq("channel", "email").eq("status", "sent")
    .not("provider_message_id", "is", null).limit(500);
  if (error) throw error;

  const outbounds = (sent ?? []).flatMap((row) => {
    const people = row.people as unknown as { primary_email?: string | null } | { primary_email?: string | null }[] | null;
    const person = Array.isArray(people) ? people[0] : people;
    return person?.primary_email && row.provider_message_id ? [{
      tenantId: row.tenant_id, campaignId: row.campaign_id, personId: row.person_id,
      recipientEmail: person.primary_email, providerMessageId: row.provider_message_id
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

/** Match against the entire sent history by exact message IDs, in bounded pages. */
export async function matchVscReplyBatch(tenantId: string, envelopes: import("@/features/vsc-campaign/imap-envelope").VscInboundEnvelope[]) {
  if (!tenantId || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error("Entreprise OVH non autorisée");
  const ids = [...new Set(envelopes.flatMap(e => [e.inReplyTo, ...e.references]).filter((id): id is string => !!id))];
  const db = createSupabaseServiceRoleClient();
  const outbounds: import("@/features/vsc-campaign/reply-matching").VscOutboundMatch[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    let after: string | null = null;
    while (true) {
      let query = db.from("vsc_campaign_deliveries")
        .select("id,tenant_id,campaign_id,person_id,provider_message_id,people!vsc_delivery_person_tenant_fk(primary_email)")
        .eq("tenant_id", tenantId).eq("channel", "email").eq("status", "sent")
        .in("provider_message_id", ids.slice(offset, offset + 100)).order("id").limit(500);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      for (const row of rows) {
        const people = row.people as unknown as { primary_email?: string | null } | { primary_email?: string | null }[] | null;
        const person = Array.isArray(people) ? people[0] : people;
        if (person?.primary_email && row.provider_message_id) outbounds.push({
          tenantId: row.tenant_id, campaignId: row.campaign_id, personId: row.person_id,
          recipientEmail: person.primary_email, providerMessageId: row.provider_message_id
        });
      }
      if (rows.length < 500) break;
      after = rows[rows.length - 1].id;
    }
  }
  return matchVscInboxReplies({ tenantId, envelopes, outbounds });
}
