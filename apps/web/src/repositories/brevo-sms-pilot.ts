import "server-only";
import { createHash } from "node:crypto";
import { getTenantContext } from "./tenant-context";
import { isBrevoQaScope } from "./brevo-account-diagnostic";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyBrevoAccountBinding } from "@/services/brevo-account-binding";
import { sendBrevoSmsPilot, type SmsPilotJournal } from "@/services/brevo-sms-pilot";
import { SMS_PILOT_MESSAGE } from "@/features/recruitment-sms/pilot-preview";

const tenantId = "8e27b0ff-3f1a-41fa-8390-628c718723a2";
const organizationId = "69aae9fea303e8f4220b4e98";
const ownerId = "5ab1ce0d-a43a-4f4a-b576-0f9d10c606e6";
export const smsPilotConfirmation = "send_one_personal_technical_sms";
function configuration() {
  const recipient = process.env.ATLAS_SMS_PILOT_RECIPIENT ?? "";
  const key = process.env.BREVO_API_KEY?.trim();
  return { recipient, key, enabled: process.env.ATLAS_SMS_PILOT_ENABLED === "1"
    && /^\+33[67][0-9]{8}$/.test(recipient) && !!key
    && process.env.ATLAS_BREVO_CONTACT_TENANT_ID === tenantId
    && process.env.ATLAS_BREVO_ORGANIZATION_ID === organizationId };
}
async function authorize() {
  if (!isBrevoQaScope()) throw new Error("SMS_SCOPE_REJECTED");
  const actor = await getTenantContext();
  if (!actor || actor.role !== "owner" || actor.tenantId !== tenantId || actor.userId !== ownerId) throw new Error("SMS_FORBIDDEN");
}
const states = ["pending", "accepted", "rejected", "unknown", "cancelled"] as const;
export type SmsPilotView = { status: "disabled" | "unavailable" | typeof states[number] } | { status: "ready"; recipient: string };
export async function getSmsPilotView(): Promise<SmsPilotView> {
  try {
    await authorize();
    const config = configuration();
    if (!config.enabled) return { status: "disabled" };
    const db = createSupabaseServiceRoleClient();
    const { data, error } = await db.from("sms_personal_pilot_attempts").select("status").eq("tenant_id", tenantId).maybeSingle();
    if (error || (data && !states.includes(data.status))) return { status: "unavailable" };
    return data ? { status: data.status } : { status: "ready", recipient: config.recipient };
  } catch { return { status: "disabled" }; }
}

export async function runSmsPersonalPilot(confirmation: string, confirmedRecipient: string, confirmedMessage = "") {
  if (confirmation !== smsPilotConfirmation || confirmedMessage !== SMS_PILOT_MESSAGE) return { status: "confirmation_required" } as const;
  try {
    await authorize();
    const config = configuration();
    if (!config.enabled || !config.key) return { status: "disabled" } as const;
    if (confirmedRecipient !== config.recipient) return { status: "recipient_mismatch" } as const;
    const freshAuthorization = async () => {
      await authorize();
      const fresh = configuration();
      if (!fresh.enabled || fresh.recipient !== config.recipient || fresh.key !== config.key) throw new Error("SMS_CONFIG_CHANGED");
    };
    const db = createSupabaseServiceRoleClient();
    const journal: SmsPilotJournal = {
      async begin() {
        await freshAuthorization();
        const { data, error } = await db.from("sms_personal_pilot_attempts").insert({
          tenant_id: tenantId, user_id: ownerId, recipient_last4: config.recipient.slice(-4),
          message_sha256: createHash("sha256").update(SMS_PILOT_MESSAGE).digest("hex"),
        }).select("id").single();
        if (error || !data?.id) throw new Error("SMS_CLAIM_UNAVAILABLE");
        return data.id as string;
      },
      async finish(id, outcome) {
        // Persist even if the session was revoked after the provider call.
        const { data, error } = await db.from("sms_personal_pilot_attempts").update({
          status: outcome.status, provider_message_id: outcome.status === "accepted" ? outcome.messageId : null,
        }).eq("tenant_id", tenantId).eq("id", id).eq("status", "pending").select("id").single();
        if (error || data?.id !== id) throw new Error("SMS_COMPLETION_UNAVAILABLE");
      },
    };
    return await sendBrevoSmsPilot({ enabled: true, recipient: config.recipient, apiKey: config.key,
      authorize: freshAuthorization, journal,
      verifyAccount: async () => (await verifyBrevoAccountBinding(tenantId, {
        enabled: true, accountTenantId: tenantId, expectedOrganizationId: organizationId, apiKey: config.key,
      })).status === "verified",
    });
  } catch { return { status: "unavailable" } as const; }
}
