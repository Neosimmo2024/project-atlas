import { normalizeTimelineListParams, type TimelineSearchParams } from "@/features/timeline/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Interaction, Organization, Person, Relationship, Task, TenantContext, TimelineEvent, TimelineEventType, TimelineSourceType } from "@/types/domain";

export type TimelineEventInput = {
  event_type: TimelineEventType;
  title: string;
  description?: string | null;
  occurred_at?: string;
  created_by?: string | null;
  person_id?: string | null;
  organization_id?: string | null;
  relationship_id?: string | null;
  interaction_id?: string | null;
  task_id?: string | null;
  source_type: TimelineSourceType;
  source_id: string;
  metadata?: Record<string, unknown>;
  visibility?: "tenant";
  idempotency_key: string;
};

export type TimelineListItem = TimelineEvent & {
  person: Pick<Person, "id" | "display_name"> | null;
  organization: Pick<Organization, "id" | "name"> | null;
  relationship: Pick<Relationship, "id" | "relationship_type" | "pipeline_stage"> | null;
  interaction: Pick<Interaction, "id" | "title"> | null;
  task: Pick<Task, "id" | "title" | "status"> | null;
};

export type TimelineListResult = {
  events: TimelineListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type TimelineJoinedRow = TimelineEvent & {
  people?: TimelineListItem["person"];
  organizations?: TimelineListItem["organization"];
  relationships?: TimelineListItem["relationship"];
  interactions?: TimelineListItem["interaction"];
  tasks?: TimelineListItem["task"];
};

function mapTimelineRow(row: TimelineJoinedRow): TimelineListItem {
  return {
    ...row,
    person: row.people ?? null,
    organization: row.organizations ?? null,
    relationship: row.relationships ?? null,
    interaction: row.interactions ?? null,
    task: row.tasks ?? null
  };
}

export async function listTimelineEvents(context: TenantContext, params: TimelineSearchParams = {}): Promise<TimelineListResult> {
  const supabase = await createSupabaseServerClient();
  const normalized = normalizeTimelineListParams(params);

  let query = supabase
    .from("timeline_events")
    .select("*, people(id, display_name), organizations(id, name), relationships(id, relationship_type, pipeline_stage), interactions(id, title), tasks(id, title, status)", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .is("deleted_at", null);

  if (normalized.personId) query = query.eq("person_id", normalized.personId);
  if (normalized.organizationId) query = query.eq("organization_id", normalized.organizationId);
  if (normalized.relationshipId) query = query.eq("relationship_id", normalized.relationshipId);
  if (normalized.eventType) query = query.eq("event_type", normalized.eventType);
  if (normalized.eventTypes.length > 0) query = query.in("event_type", normalized.eventTypes);
  if (normalized.dateFrom) query = query.gte("occurred_at", normalized.dateFrom);
  if (normalized.dateTo) query = query.lte("occurred_at", normalized.dateTo);

  const { data, error, count } = await query
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(normalized.from, normalized.to);

  if (error) throw error;

  const total = count ?? 0;
  return {
    events: ((data ?? []) as TimelineJoinedRow[]).map(mapTimelineRow),
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    pageCount: Math.max(Math.ceil(total / normalized.pageSize), 1)
  };
}

export async function createTimelineEvent(context: TenantContext, input: TimelineEventInput): Promise<TimelineEvent | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("timeline_events")
    .insert({
      ...input,
      tenant_id: context.tenantId,
      created_by: input.created_by ?? context.userId,
      description: input.description ?? null,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
      visibility: input.visibility ?? "tenant"
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return null;
    }
    throw error;
  }

  return data as TimelineEvent;
}
