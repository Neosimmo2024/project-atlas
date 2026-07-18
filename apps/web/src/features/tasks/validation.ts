import { z } from "zod";

const taskStatuses = ["todo", "in_progress", "waiting", "completed", "cancelled"] as const;
const taskPriorities = ["low", "normal", "high", "critical"] as const;
const sourceTypes = ["manual", "person", "organization", "relationship", "interaction", "project"] as const;

const nullableText = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalNullableText = nullableText.optional();
const optionalNullableUuid = optionalNullableText.refine((value) => !value || z.string().uuid().safeParse(value).success, "L'identifiant selectionne est invalide.");

const nullableDate = z
  .string()
  .trim()
  .transform((value) => value || null)
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "La date est invalide.")
  .optional();

const metadataSchema = z
  .union([
    z.record(z.string(), z.unknown()),
    z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (!value) return {};
        try {
          const parsed = JSON.parse(value) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
          ctx.addIssue({ code: "custom", message: "Le JSON metadata est invalide." });
          return z.NEVER;
        }
        ctx.addIssue({ code: "custom", message: "Le JSON metadata doit etre un objet." });
        return z.NEVER;
      })
  ])
  .default({});

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(180, "Le titre est trop long."),
  description: optionalNullableText,
  status: z.enum(taskStatuses, "Le statut est invalide.").default("todo"),
  priority: z.enum(taskPriorities, "La priorite est invalide.").default("normal"),
  due_at: nullableDate,
  assigned_to: optionalNullableUuid,
  person_id: optionalNullableUuid,
  organization_id: optionalNullableUuid,
  relationship_id: optionalNullableUuid,
  interaction_id: optionalNullableUuid,
  project_id: optionalNullableUuid,
  source_type: z.enum(sourceTypes, "La source est invalide.").nullable().optional(),
  source_id: optionalNullableUuid,
  reason: optionalNullableText,
  metadata: metadataSchema
}).superRefine((value, ctx) => {
  if ((value.source_type && !value.source_id) || (!value.source_type && value.source_id)) {
    ctx.addIssue({ code: "custom", path: ["source_type"], message: "Le type et l'identifiant de source doivent etre renseignes ensemble." });
  }
});

export type TaskFormInput = z.infer<typeof taskInputSchema>;

export function parseTaskInput(input: unknown) {
  return taskInputSchema.safeParse(input);
}
