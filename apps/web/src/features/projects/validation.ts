import { z } from "zod";

const projectTypes = ["recruitment", "property_sale", "rental_management", "partnership", "training", "referral", "other"] as const;
const projectStatuses = ["open", "won", "lost"] as const;
const projectStages = ["new", "qualification", "proposal", "decision"] as const;
const lossReasons = ["price", "competition", "abandoned", "too_long", "no_response", "bad_qualification", "conditions_rejected", "other"] as const;

const nullableText = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalNullableText = nullableText.optional();
const optionalNullableUuid = optionalNullableText.refine((value) => !value || z.string().uuid().safeParse(value).success, "L’identifiant sélectionné est invalide.");

const optionalDate = z
  .string()
  .trim()
  .transform((value) => value || null)
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "La date est invalide.")
  .optional();

const decimalString = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === "") return null;
    return String(value).trim();
  })
  .refine((value) => value === null || /^\d+(\.\d{1,2})?$/.test(value), "La valeur doit être un montant décimal positif avec deux décimales maximum.");

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
        ctx.addIssue({ code: "custom", message: "Le JSON metadata doit être un objet." });
        return z.NEVER;
      })
  ])
  .default({});

export const projectInputSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(180, "Le titre est trop long."),
  short_description: optionalNullableText,
  project_type: z.enum(projectTypes, "Le type est invalide."),
  status: z.enum(projectStatuses, "Le statut est invalide.").default("open"),
  stage: z.enum(projectStages, "L’étape est invalide.").default("new"),
  owner_user_id: optionalNullableUuid,
  organization_id: optionalNullableUuid,
  person_id: optionalNullableUuid,
  relationship_id: optionalNullableUuid,
  estimated_value: decimalString,
  final_value: decimalString,
  currency: z.string().trim().length(3, "La devise doit contenir trois lettres.").transform((value) => value.toUpperCase()).default("EUR"),
  expected_close_at: optionalDate,
  won_at: optionalDate,
  lost_at: optionalDate,
  loss_reason: z.enum(lossReasons, "Le motif de perte est invalide.").nullable().optional(),
  closing_note: optionalNullableText,
  archived_at: optionalDate,
  metadata: metadataSchema
}).superRefine((value, ctx) => {
  if (value.status === "won" && value.lost_at) {
    ctx.addIssue({ code: "custom", path: ["lost_at"], message: "Un projet gagné ne peut pas avoir une date de perte." });
  }
  if (value.status === "lost" && !value.loss_reason) {
    ctx.addIssue({ code: "custom", path: ["loss_reason"], message: "Le motif de perte est obligatoire." });
  }
  if (value.loss_reason === "other" && !value.closing_note) {
    ctx.addIssue({ code: "custom", path: ["closing_note"], message: "La note est obligatoire lorsque le motif est Autre." });
  }
});

export const projectWinSchema = z.object({
  finalValue: decimalString,
  wonAt: optionalDate,
  note: optionalNullableText
});

export const projectLoseSchema = z.object({
  lossReason: z.enum(lossReasons, "Le motif de perte est invalide."),
  lostAt: optionalDate,
  note: optionalNullableText
}).superRefine((value, ctx) => {
  if (value.lossReason === "other" && !value.note) {
    ctx.addIssue({ code: "custom", path: ["note"], message: "La note est obligatoire lorsque le motif est Autre." });
  }
});

export const projectArchiveSchema = z.object({
  archivedAt: optionalDate,
  note: optionalNullableText
});

export type ProjectFormInput = z.infer<typeof projectInputSchema>;
export type ProjectWinInput = z.infer<typeof projectWinSchema>;
export type ProjectLoseInput = z.infer<typeof projectLoseSchema>;
export type ProjectArchiveInput = z.infer<typeof projectArchiveSchema>;

export function parseProjectInput(input: unknown) {
  return projectInputSchema.safeParse(input);
}

export function parseProjectWinInput(input: unknown) {
  return projectWinSchema.safeParse(input);
}

export function parseProjectLoseInput(input: unknown) {
  return projectLoseSchema.safeParse(input);
}

export function parseProjectArchiveInput(input: unknown) {
  return projectArchiveSchema.safeParse(input);
}
