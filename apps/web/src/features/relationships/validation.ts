import { z } from "zod";
import { RELATIONSHIP_PIPELINE_STAGES, RELATIONSHIP_STATUSES, RELATIONSHIP_TYPES } from "./options";

const nullableText = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalNullableText = nullableText.optional();

const nullableDateTime = optionalNullableText.refine((value) => !value || !Number.isNaN(Date.parse(value)), "La date est invalide.");

const nullableScore = z
  .preprocess((value) => (value === "" || value === null || value === undefined ? null : Number(value)), z.number().int().nullable())
  .refine((value) => value === null || (value >= 0 && value <= 100), "La valeur doit etre comprise entre 0 et 100.");

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

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

export const relationshipInputSchema = z.object({
  person_id: z.string().uuid("La personne est obligatoire."),
  organization_id: z.string().uuid("L'organisation est obligatoire."),
  relationship_type: z.enum(RELATIONSHIP_TYPES, { message: "Le type selectionne est invalide." }),
  pipeline_stage: z.enum(RELATIONSHIP_PIPELINE_STAGES, { message: "La phase selectionnee est invalide." }),
  status: z.enum(RELATIONSHIP_STATUSES, { message: "Le statut selectionne est invalide." }),
  owner_user_id: optionalNullableText,
  score: nullableScore,
  confidence: nullableScore,
  started_at: nullableDateTime,
  ended_at: nullableDateTime,
  next_action_at: nullableDateTime,
  last_interaction_at: nullableDateTime,
  notes: optionalNullableText,
  tags: z.preprocess(normalizeTags, z.array(z.string()).default([])),
  metadata: metadataSchema
}).superRefine((value, ctx) => {
  if (value.ended_at && value.started_at && Date.parse(value.ended_at) < Date.parse(value.started_at)) {
    ctx.addIssue({ code: "custom", path: ["ended_at"], message: "La date de fin doit etre posterieure a la date de debut." });
  }
});

export type RelationshipFormInput = z.infer<typeof relationshipInputSchema>;

export function parseRelationshipInput(input: unknown) {
  return relationshipInputSchema.safeParse(input);
}
