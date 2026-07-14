import type { PersonStatus, Priority } from "@/types/domain";

export const PERSON_STATUSES = [
  "to_qualify",
  "qualified",
  "contacted",
  "in_relationship",
  "rejected",
  "archived"
] as const satisfies readonly PersonStatus[];

export const PRIORITIES = ["low", "medium", "high"] as const satisfies readonly Priority[];

export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = {
  to_qualify: "A qualifier",
  qualified: "Qualifie",
  contacted: "Contacte",
  in_relationship: "En relation",
  rejected: "Non retenu",
  archived: "Archive"
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute"
};
