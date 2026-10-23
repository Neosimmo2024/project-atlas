import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCAL_CAMPAIGN_KEY, LOCAL_SENDER } from "@/features/recruitment-email/local-campaign";

async function calendly(path: string) {
  const token = process.env.CALENDLY_PERSONAL_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("Calendly recruitment guard is not configured.");
  const response = await fetch(`https://api.calendly.com${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Calendly recruitment guard unavailable.");
  return await response.json();
}
function resourcePath(uri: string, kind: string) {
  const match = uri?.match(new RegExp(`^https://api\\.calendly\\.com/${kind}/([A-Za-z0-9_-]+)$`));
  if (!match) throw new Error("Invalid Calendly resource.");
  return `/${kind}/${match[1]}`;
}
async function collection(path: string, query: Record<string,string>) {
  const rows: Record<string, string>[] = [];
  const seen = new Set<string>(); let page="";
  for (let i=0;i<50;i++) {
    const params=new URLSearchParams({ ...query, count: "100", ...(page ? { page_token: page } : {}) });
    const data=await calendly(`${path}?${params}`);
    if (!Array.isArray(data.collection) || !data.pagination) throw new Error("Invalid Calendly collection.");
    rows.push(...data.collection);
    const next=data.pagination.next_page_token;
    if (next===null || next===undefined || next==="") return rows;
    if (typeof next!=="string" || seen.has(next)) throw new Error("Invalid Calendly pagination.");
    seen.add(next); page=next;
  }
  throw new Error("Calendly pagination limit exceeded.");
}
export async function getLocalBookedEmails() {
  const me=(await calendly("/users/me")).resource;
  if (me?.email?.toLowerCase()!==LOCAL_SENDER) throw new Error("Calendly recruitment account mismatch.");
  resourcePath(me.uri,"users");
  const types=await collection("/event_types",{ user: me.uri });
  const targets=types.filter(type=>type.scheduling_url==="https://calendly.com/renato-ponzio/30min");
  if (targets.length!==1) throw new Error("Calendly recruitment event is ambiguous.");
  resourcePath(targets[0].uri,"event_types");
  const events=await collection("/scheduled_events",{ user: me.uri });
  const emails=new Set<string>();
  for (const event of events) {
    if (event.event_type!==targets[0].uri) continue;
    for (const invitee of await collection(`${resourcePath(event.uri,"scheduled_events")}/invitees`,{})) {
      const email=invitee.email?.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Calendly booking email cannot be verified.");
      // A previous booking remains a stop, including cancelled/rescheduled appointments.
      emails.add(email);
    }
  }
  return emails;
}

export async function syncLocalCalendarStops(db: SupabaseClient) {
  const { data, error }=await db.from("recruitment_email_sequences").select("id,tenant_id,person_id,email")
    .in("campaign_snapshot->>key", [LOCAL_CAMPAIGN_KEY, "lyon-development", "bordeaux-marketing-20261023"]).in("status",["pending","sent"])
    .neq("lifecycle_status","stopped").neq("lifecycle_status","completed");
  if (error) throw error;
  if (!data?.length) return { stopped: 0, verified: true };
  let emails: Set<string>;
  try { emails=await getLocalBookedEmails(); }
  catch { return { stopped: 0, verified: false }; }
  let stopped=0;
  for (const sequence of data) {
    if (!emails.has(sequence.email.trim().toLowerCase())) continue;
    const { data: changed,error: stopError }=await db.from("recruitment_email_sequences")
      .update({ status: "stopped", lifecycle_status: "stopped", next_action_at: null, stopped_at: new Date().toISOString(), stop_reason: "appointment" })
      .eq("id",sequence.id).eq("tenant_id",sequence.tenant_id).in("status",["pending","sent"]).select("id");
    if (stopError) throw stopError;
    if (!changed?.length) continue;
    // The existing status trigger cancels scheduled steps and processing attempts.
    const { error: eventError }=await db.from("timeline_events").upsert({ tenant_id: sequence.tenant_id, person_id: sequence.person_id,
      event_type: "recruitment_email_stopped", title: "Séquence de recrutement arrêtée après rendez-vous", description: "Rendez-vous Calendly identifié par adresse email exacte.",
      occurred_at: new Date().toISOString(), created_by: null, source_type: "person", source_id: sequence.person_id, visibility: "tenant",
      metadata: { sequence_id: sequence.id, reason: "appointment", source: "calendly_local_recruitment" }, idempotency_key: `local-appointment-stop:${sequence.id}`
    },{ onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true });
    if (eventError) throw eventError;
    stopped++;
  }
  return { stopped, verified: true };
}
