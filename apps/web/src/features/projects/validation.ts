import { z } from "zod";

const projectTypes = ["recruitment", "property_sale", "rental_management", "partnership", "training", "referral", "other"] as const;
const projectStatuses = ["open", "won", "lost"] as const;
const projectStages = ["new", "qualification", "proposal", "decision"] as const;
const lossReasons = ["price", "competition", "abandoned", "too_long", "no_response", "bad_qualification", "conditions_rejected", "other"] as const;
const forbiddenPatchFields = ["status", "won_at", "lost_at", "loss_reason", "final_value", "archived_at", "closing_note"] as const;

const nullableText = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalNullableText = nullableText.optional();
const optionalNullableUuid = optionalNullableText.refine((value) => !value || z.string().uuid().safeParse(value).success, "L'identifiant selectionne est invalide.");

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
  .refine((value) => value === null || /^\d+(\.\d{1,2})?$/.test(value), "La valeur doit etre un montant decimal positif avec deux decimales maximum.");

const patchNullableText = z
  .union([z.string(), z.null()])
  .transform((value) => (value === null ? null : value.trim() || null));

const patchNullableUuid = patchNullableText.refine((value) => !value || z.string().uuid().safeParse(value).success, "L'identifiant selectionne est invalide.");

const patchDate = z
  .union([z.string(), z.null()])
  .transform((value) => (value === null ? null : value.trim() || null))
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "La date est invalide.");

const patchDecimalString = z
  .union([z.string(), z.number(), z.null()])
  .transform((value) => {
    if (value === null || value === "") return null;
    return String(value).trim();
  })
  .refine((value) => value === null || /^\d+(\.\d{1,2})?$/.test(value), "La valeur doit etre un montant decimal positif avec deux decimales maximum.");

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

const patchMetadataSchema = z.union([
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
]);

export const projectInputSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(180, "Le titre est trop long."),
  short_description: optionalNullableText,
  project_type: z.enum(projectTypes, "Le type est invalide."),
  status: z.enum(projectStatuses, "Le statut est invalide.").default("open"),
  stage: z.enum(projectStages, "L'etape est invalide.").default("new"),
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
    ctx.addIssue({ code: "custom", path: ["lost_at"], message: "Un projet gagne ne peut pas avoir une date de perte." });
  }
  if (value.status === "lost" && !value.loss_reason) {
    ctx.addIssue({ code: "custom", path: ["loss_reason"], message: "Le motif de perte est obligatoire." });
  }
  if (value.loss_reason === "other" && !value.closing_note) {
    ctx.addIssue({ code: "custom", path: ["closing_note"], message: "La note est obligatoire lorsque le motif est Autre." });
  }
});

const projectPatchBaseSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(180, "Le titre est trop long.").optional(),
  short_description: patchNullableText.optional(),
  project_type: z.enum(projectTypes, "Le type est invalide.").optional(),
  stage: z.enum(projectStages, "L'etape est invalide.").optional(),
  owner_user_id: patchNullableUuid.optional(),
  organization_id: patchNullableUuid.optional(),
  person_id: patchNullableUuid.optional(),
  relationship_id: patchNullableUuid.optional(),
  estimated_value: patchDecimalString.optional(),
  currency: z.string().trim().length(3, "La devise doit contenir trois lettres.").transform((value) => value.toUpperCase()).optional(),
  expected_close_at: patchDate.optional(),
  metadata: patchMetadataSchema.optional()
}).strict();

export const projectPatchSchema = z
  .preprocess((input, ctx) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input;
    const payload = input as Record<string, unknown>;
    for (const field of forbiddenPatchFields) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        ctx.addIssue({ code: "custom", path: [field], message: `Le champ ${field} doit etre modifie via un endpoint metier dedie.` });
      }
    }
    return input;
  }, projectPatchBaseSchema)
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({ code: "custom", message: "Au moins un champ modifiable doit etre fourni." });
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
export type ProjectPatchInput = z.infer<typeof projectPatchSchema>;
export type ProjectWinInput = z.infer<typeof projectWinSchema>;
export type ProjectLoseInput = z.infer<typeof projectLoseSchema>;
export type ProjectArchiveInput = z.infer<typeof projectArchiveSchema>;

export function parseProjectInput(input: unknown) {
  return projectInputSchema.safeParse(input);
}

export function parseProjectPatchInput(input: unknown) {
  return projectPatchSchema.safeParse(input);
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
