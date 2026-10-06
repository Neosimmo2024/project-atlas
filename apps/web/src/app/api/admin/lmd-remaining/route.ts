import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const context = await getTenantContext();
  if (!context || (context.role !== "owner" && context.role !== "admin")) {
    return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
  }

  const db = createSupabaseServiceRoleClient();
  const { data: interactions, error } = await db
    .from("interactions")
    .select("id,person_id,summary,metadata")
    .eq("metadata->>campaign_key", "lmd-ab-20261004")
    .eq("metadata->>batch", "A")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });

  const remaining = (interactions ?? []).filter((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, string>;
    return metadata.status !== "sent" && Boolean(row.person_id);
  });

  const personIds = [...new Set(remaining.map((row) => row.person_id).filter(Boolean))] as string[];
  const { data: people } = personIds.length
    ? await db.from("people").select("id,display_name,contact_allowed,do_not_contact").in("id", personIds)
    : { data: [] as Array<{ id: string; display_name: string; contact_allowed: boolean; do_not_contact: boolean }> };

  const peopleById = new Map((people ?? []).map((person) => [person.id, person]));

  const items = remaining.flatMap((row) => {
    if (!row.person_id) return [];
    const person = peopleById.get(row.person_id);
    if (!person || !person.contact_allowed || person.do_not_contact) return [];

    const metadata = (row.metadata ?? {}) as Record<string, string>;
    const lines = (row.summary ?? "").split("\n");
    const objectLine = lines.find((line) => line.startsWith("Objet : "));

    return [{
      interactionId: row.id,
      displayName: person.display_name,
      recipientEmail: metadata.recipient_email ?? "",
      subject: objectLine?.slice(8).trim() ?? ""
    }];
  });

  return NextResponse.json({ data: items });
}
