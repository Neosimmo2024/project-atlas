import type { TimelineEventType } from "@/types/domain";
import { TIMELINE_EVENT_CATEGORIES, type TimelineFilterCategory } from "./options";

export type TimelineSearchParams = {
  personId?: string;
  organizationId?: string;
  relationshipId?: string;
  projectId?: string;
  eventType?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export function timelineEventTypesForCategory(category: string | null | undefined): TimelineEventType[] {
  const normalized = (category ?? "all").trim() as TimelineFilterCategory;
  if (normalized === "all" || !(normalized in TIMELINE_EVENT_CATEGORIES)) return [];
  return TIMELINE_EVENT_CATEGORIES[normalized as Exclude<TimelineFilterCategory, "all">];
}

export function normalizeTimelineListParams(params: TimelineSearchParams) {
  const pageSize = Math.min(Math.max(Number(params.pageSize) || 10, 1), 50);
  const page = Math.max(Number(params.page) || 1, 1);

  return {
    personId: params.personId?.trim() || "",
    organizationId: params.organizationId?.trim() || "",
    relationshipId: params.relationshipId?.trim() || "",
    projectId: params.projectId?.trim() || "",
    eventType: params.eventType?.trim() || "",
    eventTypes: timelineEventTypesForCategory(params.category),
    category: params.category?.trim() || "all",
    dateFrom: params.dateFrom?.trim() || "",
    dateTo: params.dateTo?.trim() || "",
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1
  };
}
