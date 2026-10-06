import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { sendLmdSingleEmail } from "@/services/lmd-single-send";

function messageParts(summary: string) {
  const lines = summary.split("\n");
  const index = lines.findIndex(line => line.startsWith("Objet : "));
  if (index < 0) return null;
  return { subject: lines[index].slice(8).trim(), body: lines.slice(index + 1).join("\n").trim() };
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context || (context.role !== "owner" && context.role !== "admin")) {
    return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
  }
  const { interactionId } = await request.json() as { interactionId?: string };
  if (!interactionId) return NextResponse.json({ error: "Interaction requise." }, { status: 400 });

  const db = createSupabaseServiceRoleClient();
  const { data: item } = await db.from("interactions").select("id,person_id,summary,metadata").eq("id", interactionId).maybeSingle();
  if (!item || !item.person_id || !item.summary) return NextResponse.json({ error: "Interaction introuvable." }, { status: 404 });

  const metadata = (item.metadata ?? {}) as Record<string, string>;
  if (metadata.campaign_key !== "lmd-ab-20261004") return NextResponse.json({ error: "Campagne non autorisée." }, { status: 409 });
  if (metadata.status === "sent" && metadata.provider_message_id) return NextResponse.json({ data: { duplicatePrevented: true } });

  const { data: person } = await db.from("people").select("display_name,contact_allowed,do_not_contact").eq("id", item.person_id).maybeSingle();
  if (!person || !person.contact_allowed || person.do_not_contact) return NextResponse.json({ error: "Contact interdit." }, { status: 409 });

  const parts = messageParts(item.summary);
  if (!parts || !metadata.recipient_email) return NextResponse.json({ error: "Message préparé incomplet." }, { status: 409 });

  const sent = await sendLmdSingleEmail({
    requestId: ["lmd-ab-20261004", metadata.batch, item.person_id].join(":"),
    recipient: metadata.recipient_email,
    recipientName: person.display_name,
    subject: parts.subject,
    textContent: parts.body
  });
  if (!sent.success) return NextResponse.json({ error: sent.error }, { status: 502 });

  const now = new Date().toISOString();
  await db.from("interactions").update({ metadata: { ...metadata, status: "sent", provider_message_id: sent.messageId, sent_at: now }, updated_at: now }).eq("id", item.id);
  return NextResponse.json({ data: { messageId: sent.messageId, sentAt: now } });
}
