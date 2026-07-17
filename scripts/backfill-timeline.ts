import { createClient } from "@supabase/supabase-js";
import {
  buildInteractionBackfillEvent,
  buildOrganizationBackfillEvent,
  buildPersonBackfillEvent,
  buildRelationshipBackfillEvents,
  buildTaskBackfillEvent,
  type BackfillTimelineEventInput
} from "../apps/web/src/features/timeline/backfill";
import type { Database } from "../apps/web/src/types/database";
import type { Interaction, Organization, Person, Relationship, Task } from "../apps/web/src/types/domain";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const backfillKey = process.env.SUPABASE_TIMELINE_BACKFILL_KEY;

if (!supabaseUrl || !backfillKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_TIMELINE_BACKFILL_KEY.");
}

const supabase = createClient<Database>(supabaseUrl, backfillKey, {
  auth: { persistSession: false }
});

async function readTable<T>(table: "people" | "organizations" | "relationships" | "interactions" | "tasks") {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return (data ?? []) as T[];
}

async function upsertEvents(events: BackfillTimelineEventInput[]) {
  if (events.length === 0) return 0;
  const { error } = await supabase
    .from("timeline_events")
    .upsert(events, { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true });

  if (error) throw error;
  return events.length;
}

async function main() {
  const [people, organizations, relationships, interactions, tasks] = await Promise.all([
    readTable<Person>("people"),
    readTable<Organization>("organizations"),
    readTable<Relationship>("relationships"),
    readTable<Interaction>("interactions"),
    readTable<Task>("tasks")
  ]);

  const events = [
    ...people.map(buildPersonBackfillEvent),
    ...organizations.map(buildOrganizationBackfillEvent),
    ...relationships.flatMap(buildRelationshipBackfillEvents),
    ...interactions.filter((interaction) => !interaction.deleted_at).map(buildInteractionBackfillEvent),
    ...tasks.filter((task) => !task.deleted_at).map(buildTaskBackfillEvent)
  ];

  const attempted = await upsertEvents(events);
  console.log(`Timeline backfill complete. ${attempted} event(s) checked idempotently.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
