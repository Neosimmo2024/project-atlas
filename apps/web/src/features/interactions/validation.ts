import { z } from "zod";

const nullableText = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalNullableText = nullableText.optional();

const nullableUuid = optionalNullableText.refine((value) => !value || z.string().uuid().safeParse(value).success, "L'identifiant selectionne est invalide.");

const interactionDate = z
  .string()
  .trim()
  .min(1, "La date de l'interaction est obligatoire.")
  .refine((value) => !Number.isNaN(Date.parse(value)), "La date de l'interaction est invalide.");

const nullableDuration = z
  .preprocess((value) => (value === "" || value === null || value === undefined ? null : Number(value)), z.number().int().nullable())
  .refine((value) => value === null || (value >= 0 && value <= 1440), "La duree doit etre comprise entre 0 et 1440 minutes.");

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

export const interactionInputSchema = z.object({
  person_id: nullableUuid,
  organization_id: nullableUuid,
  relationship_id: nullableUuid,
  type_id: z.string().uuid("Le type d'interaction est obligatoire."),
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(180, "Le titre est trop long."),
  summary: optionalNullableText,
  interaction_date: interactionDate,
  duration_minutes: nullableDuration,
  location: optionalNullableText,
  change_reason: optionalNullableText,
  main_obstacle: optionalNullableText,
  timing: optionalNullableText,
  dna_compatibility: optionalNullableText,
  work_with_person_desire: optionalNullableText,
  comments: optionalNullableText,
  metadata: metadataSchema
}).superRefine((value, ctx) => {
  if (!value.person_id && !value.organization_id && !value.relationship_id) {
    ctx.addIssue({ code: "custom", path: ["person_id"], message: "Selectionnez au moins une personne, une organisation ou une relation." });
  }
});

export type InteractionFormInput = z.infer<typeof interactionInputSchema>;

export function parseInteractionInput(input: unknown) {
  return interactionInputSchema.safeParse(input);
}
