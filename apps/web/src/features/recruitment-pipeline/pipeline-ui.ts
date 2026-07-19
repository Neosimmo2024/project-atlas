import type { RelationshipPipelineStage } from "@/types/domain";
import { RECRUITMENT_PIPELINE_STAGE_LABELS, RECRUITMENT_PIPELINE_STAGES } from "./options";

export type PipelineViewMode = "kanban" | "list";
export type PipelineActionFilter = "overdue" | "today" | "none";
export type PipelineContactFilter = "blocked" | "allowed";
export type PipelineRecontactFilter = "yes" | "no";

export type PipelineFilters = {
  query: string;
  stage: RelationshipPipelineStage | "";
  ownerId: string;
  noOwner: boolean;
  nextAction: PipelineActionFilter | "";
  contact: PipelineContactFilter | "";
  recontactable: PipelineRecontactFilter | "";
  view: PipelineViewMode;
  page: number;
  pageSize: number;
};

export type PipelineCardModel = {
  id: string;
  personName: string;
  organizationName: string;
  stage: RelationshipPipelineStage;
  ownerUserId: string | null;
  ownerName: string;
  nextActionAt: string | null;
  lastInteractionAt: string | null;
  updatedAt: string;
  doNotContact: boolean;
  rejectionRecontactable: boolean | null;
  status: string;
  href: string;
};

export const PIPELINE_STAGE_LABELS: Record<RelationshipPipelineStage, string> = {
  ...RECRUITMENT_PIPELINE_STAGE_LABELS,
  conversation: "Conversation engagée",
  appointment: "Rendez-vous obtenu",
  presentation: "Présentation réalisée",
  rejected: "Refus"
};

export function normalizePipelineView(value: string | null | undefined): PipelineViewMode {
  return value === "list" ? "list" : "kanban";
}

export function normalizePipelineStage(value: string | null | undefined): RelationshipPipelineStage | "" {
  return RECRUITMENT_PIPELINE_STAGES.includes(value as RelationshipPipelineStage) ? value as RelationshipPipelineStage : "";
}

export function isPipelineStage(value: string): value is RelationshipPipelineStage {
  return RECRUITMENT_PIPELINE_STAGES.includes(value as RelationshipPipelineStage);
}

export function isActivePipelineStage(stage: RelationshipPipelineStage) {
  return stage !== "rejected";
}

export function groupPipelineCards(cards: PipelineCardModel[]) {
  return RECRUITMENT_PIPELINE_STAGES.map((stage) => ({
    stage,
    label: PIPELINE_STAGE_LABELS[stage],
    cards: cards.filter((card) => card.stage === stage)
  }));
}

export function isOverdue(value: string | null, now = new Date()) {
  return Boolean(value && new Date(value).getTime() < startOfDay(now).getTime());
}

export function isToday(value: string | null, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return date >= startOfDay(now) && date < addDays(startOfDay(now), 1);
}

export function formatPipelineDate(value: string | null) {
  if (!value) return "Aucune date";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ownerLabel(ownerUserId: string | null, ownerNames: Map<string, string>) {
  if (!ownerUserId) return "Sans responsable";
  return ownerNames.get(ownerUserId) ?? "Responsable assigné";
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
