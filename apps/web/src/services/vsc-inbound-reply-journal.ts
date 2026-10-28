/**
 * Persist an already verified OVH reply. Not exposed to browser or cron.
 * Mailbox ingestion must independently authenticate mailbox ownership and
 * verify In-Reply-To/References against an outbound message in this tenant.
 */
import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { validateVscReplyCandidate, type VscReplyCandidate } from "@/features/vsc-campaign/inbound-replies";

export async function recordVerifiedVscReply(
  candidate: VscReplyCandidate,
  configuredTenantId: string
): Promise<{ recorded: boolean }> {
  const check = validateVscReplyCandidate(candidate, configuredTenantId);
  if (!check.accepted) throw new Error("Réponse non attribuable : " + check.reason);

  const supabase = createSupabaseServiceRoleClient();
  // Do not trust a caller-supplied isReplyToCampaign flag alone.
  // Match the exact original outbound Message-ID to the same tenant/person.
  const { data: outbound, error: outboundError } = await supabase
    .from("vsc_campaign_deliveries")
    .select("id")
    .eq("tenant_id", candidate.tenantId)
    .eq("campaign_id", candidate.campaignId)
    .eq("person_id", candidate.personId)
    .eq("channel", "email")
    .eq("status", "sent")
    .eq("provider_message_id", candidate.originalOutboundMessageId)
    .maybeSingle();
  if (outboundError) throw outboundError;
  if (!outbound) throw new Error("Message d'origine non reconnu pour ce prospect");

  const { data, error } = await supabase.rpc("vsc_record_verified_reply", {
    p_tenant_id: candidate.tenantId,
    p_campaign_id: candidate.campaignId,
    p_person_id: candidate.personId,
    p_message_id: candidate.inboundMessageId,
    p_received_at: candidate.receivedAt
  });
  if (error) throw error;
  return { recorded: data === true };
}
