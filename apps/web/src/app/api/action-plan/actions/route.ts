import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completeActionPlanTask,
  createActionPlanInteraction,
  createActionPlanTaskFromRecommendation,
  planActionPlanTask,
  restoreActionPlanTask,
  snoozeActionPlanItem
} from "@/repositories/action-plan";
import { getTenantContext } from "@/repositories/tenant-context";

const uuid = z.string().uuid();
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "La date est invalide.");

const completeSchema = z.object({
  action: z.literal("complete_task"),
  taskId: uuid
});

const undoCompleteSchema = z.object({
  action: z.literal("undo_complete_task"),
  taskId: uuid,
  previousStatus: z.enum(["todo", "in_progress", "waiting", "completed", "cancelled"]),
  previousCompletedAt: isoDate.nullable()
});

const snoozeSchema = z.object({
  action: z.literal("snooze"),
  itemId: z.string().min(1),
  sourceType: z.enum(["task", "relationship_recommendation"]),
  sourceId: uuid,
  organizationId: uuid,
  snoozedUntil: isoDate
});

const planSchema = z.object({
  action: z.literal("plan_task"),
  taskId: uuid,
  dueAt: isoDate
});

const interactionSchema = z.object({
  action: z.literal("add_interaction"),
  itemId: z.string().min(1),
  organizationId: uuid,
  personId: uuid.nullable(),
  relationshipId: uuid.nullable(),
  typeId: uuid,
  notes: z.string().trim().optional().default(""),
  interactionDate: isoDate
});

const createTaskSchema = z.object({
  action: z.literal("create_task"),
  itemId: z.string().min(1),
  organizationId: uuid,
  personId: uuid.nullable(),
  relationshipId: uuid.nullable(),
  title: z.string().trim().min(1, "Le titre est obligatoire."),
  dueAt: isoDate
});

const actionSchema = z.discriminatedUnion("action", [
  completeSchema,
  undoCompleteSchema,
  snoozeSchema,
  planSchema,
  interactionSchema,
  createTaskSchema
]);

function apiErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur inconnue.";
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
  return NextResponse.json({ error: message, code }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
        { status: 400 }
      );
    }

    const input = parsed.data;
    if (input.action === "complete_task") {
      const result = await completeActionPlanTask(context, input.taskId);
      return NextResponse.json({ data: result });
    }

    if (input.action === "undo_complete_task") {
      const task = await restoreActionPlanTask(context, input.taskId, input.previousStatus, input.previousCompletedAt);
      return NextResponse.json({ data: task });
    }

    if (input.action === "snooze") {
      const decision = await snoozeActionPlanItem(context, input);
      return NextResponse.json({ data: decision });
    }

    if (input.action === "plan_task") {
      const task = await planActionPlanTask(context, input.taskId, input.dueAt);
      return NextResponse.json({ data: task });
    }

    if (input.action === "add_interaction") {
      const interaction = await createActionPlanInteraction(context, {
        itemId: input.itemId,
        organizationId: input.organizationId,
        interaction: {
          organization_id: input.organizationId,
          person_id: input.personId,
          relationship_id: input.relationshipId,
          type_id: input.typeId,
          title: "Échange ajouté depuis le Plan d’action",
          summary: input.notes,
          interaction_date: input.interactionDate,
          duration_minutes: null,
          location: null,
          change_reason: null,
          main_obstacle: null,
          timing: null,
          dna_compatibility: null,
          work_with_person_desire: null,
          comments: input.notes,
          metadata: {}
        }
      });
      return NextResponse.json({ data: interaction }, { status: 201 });
    }

    const task = await createActionPlanTaskFromRecommendation(context, {
      itemId: input.itemId,
      organizationId: input.organizationId,
      task: {
        title: input.title,
        description: null,
        status: "todo",
        priority: "normal",
        due_at: input.dueAt,
        assigned_to: null,
        person_id: input.personId,
        organization_id: input.organizationId,
        relationship_id: input.relationshipId,
        interaction_id: null,
        source_type: "relationship",
        source_id: input.relationshipId ?? input.organizationId,
        reason: "Créée depuis le Plan d’action",
        metadata: {}
      }
    });
    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
