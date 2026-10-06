import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type PersonRow = {
  id: string;
  display_name: string;
  contact_allowed: boolean;
  do_not_contact: boolean;
};

type InteractionRow = {
  id: string;
  person_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
};

export async function GET() {
  const context = await getTenantContext();
  if (!context || (context.role !== "owner" && context.role !== "admin")) {
    return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
  }

  const db = createSupabaseServiceRoleClient();

  const interactionResult = await db
    .from("interactions")
    .select("id,person_id,summary,metadata")
    .eq("metadata->>campaign_key", "lmd-ab-20261004")
    .eq("metadata->>batch", "A")
    .order("created_at", { ascending: true });

  if (interactionResult.error) {
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }

  const interactions = (interactionResult.data ?? []) as InteractionRow[];
  const remaining = interactions.filter((row) => {
    const metadata = row.metadata ?? {};
    return metadata.status !== "sent" && typeof row.person_id === "string";
  });

  const personIds = Array.from(
    new Set(
      remaining
        .map((row) => row.person_id)
        .filter((value): value is string => typeof value === "string")
    )
  );

  let people: PersonRow[] = [];
  if (personIds.length > 0) {
    const peopleResult = await db
      .from("people")
      .select("id,display_name,contact_allowed,do_not_contact")
      .in("id", personIds);

    if (peopleResult.error) {
      return NextResponse.json({ error: "Lecture des contacts impossible." }, { status: 500 });
    }

    people = (peopleResult.data ?? []) as PersonRow[];
  }

  const peopleById = new Map<string, PersonRow>(
    people.map((person) => [person.id, person])
  );

  const items = remaining.reduce<Array<{
    interactionId: string;
    displayName: string;
    recipientEmail: string;
    subject: string;
  }>>((acc, row) => {
    if (!row.person_id) return acc;

    const person = peopleById.get(row.person_id);
    if (!person || !person.contact_allowed || person.do_not_contact) return acc;

    const metadata = row.metadata ?? {};
    const recipientEmail =
      typeof metadata.recipient_email === "string" ? metadata.recipient_email : "";

    const objectLine = (row.summary ?? "")
      .split("\n")
      .find((line) => line.startsWith("Objet : "));

    acc.push({
      interactionId: row.id,
      displayName: person.display_name,
      recipientEmail,
      subject: objectLine?.slice(8).trim() ?? ""
    });

    return acc;
  }, []);

  return NextResponse.json({ data: items });
}
