import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const context = await getTenantContext();
  if (!context || (context.role !== "owner" && context.role !== "admin")) {
    return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
  }

  const db = createSupabaseServiceRoleClient();
  const { data, error } = await db
    .from("interactions")
    .select("id,person_id,summary,metadata,people(display_name,contact_allowed,do_not_contact)")
    .eq("metadata->>campaign_key", "lmd-ab-20261004")
    .eq("metadata->>batch", "A")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });

  const items = (data ?? [])
    .filter((row) => {
      const m = (row.metadata ?? {}) as Record<string, string>;
      const person = Array.isArray(row.people) ? row.people[0] : row.people;
      return m.status !== "sent" && person?.contact_allowed && !person?.do_not_contact;
    })
    .map((row) => {
      const m = (row.metadata ?? {}) as Record<string, string>;
      const person = Array.isArray(row.people) ? row.people[0] : row.people;
      const lines = (row.summary ?? "").split("\n");
      const objectLine = lines.find((line) => line.startsWith("Objet : "));
      return {
        interactionId: row.id,
        displayName: person?.display_name ?? "",
        recipientEmail: m.recipient_email ?? "",
        subject: objectLine?.slice(8).trim() ?? ""
      };
    });

  return NextResponse.json({ data: items });
}
