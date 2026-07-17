import type { TaskPriority, TaskStatus } from "@/types/domain";

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "A faire" },
  { value: "in_progress", label: "En cours" },
  { value: "waiting", label: "En attente" },
  { value: "completed", label: "Terminee" },
  { value: "cancelled", label: "Annulee" }
];

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Basse" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Haute" },
  { value: "critical", label: "Critique" }
];

export const TASK_STATUS_LABELS = Object.fromEntries(TASK_STATUS_OPTIONS.map((option) => [option.value, option.label])) as Record<TaskStatus, string>;
export const TASK_PRIORITY_LABELS = Object.fromEntries(TASK_PRIORITY_OPTIONS.map((option) => [option.value, option.label])) as Record<TaskPriority, string>;
