import { z } from "zod";
import { RECRUITMENT_PIPELINE_STAGES, RECRUITMENT_REJECTION_REASONS } from "./options";

const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "La date est invalide.");

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null);

const metadataSchema = z.record(z.string(), z.unknown()).optional().default({});

export const recruitmentPipelineTransitionSchema = z.object({
  toStage: z.enum(RECRUITMENT_PIPELINE_STAGES, { message: "La phase cible est invalide." }),
  expectedStage: z.enum(RECRUITMENT_PIPELINE_STAGES).optional(),
  expectedUpdatedAt: optionalDateTime,
  confirmed: z.boolean().optional().default(false),
  reason: optionalText,
  signatureAt: optionalDateTime,
  startAt: optionalDateTime,
  rejectionReason: z.enum(RECRUITMENT_REJECTION_REASONS).optional(),
  rejectionComment: optionalText,
  rejectionRecontactable: z.boolean().optional().nullable(),
  rejectionFollowUpAt: optionalDateTime,
  doNotContact: z.boolean().optional().nullable(),
  metadata: metadataSchema
}).superRefine((value, ctx) => {
  if (value.toStage === "signature" && (!value.confirmed || !value.signatureAt)) {
    ctx.addIssue({ code: "custom", path: ["signatureAt"], message: "La signature exige une confirmation et une date de signature." });
  }

  if (value.toStage === "rejected" && !value.rejectionReason) {
    ctx.addIssue({ code: "custom", path: ["rejectionReason"], message: "Le motif de refus est obligatoire." });
  }

  if (value.toStage === "rejected" && value.rejectionReason === "other" && !value.rejectionComment) {
    ctx.addIssue({ code: "custom", path: ["rejectionComment"], message: "Le motif autre exige un commentaire." });
  }
});

export const recruitmentPipelineOwnerSchema = z.object({
  ownerUserId: z.string().uuid("Le responsable est invalide.").nullable(),
  expectedUpdatedAt: optionalDateTime,
  reason: optionalText
});

export const recruitmentPipelineDoNotContactSchema = z.object({
  doNotContact: z.boolean(),
  justification: z.string().trim().min(1, "La justification est obligatoire."),
  expectedUpdatedAt: optionalDateTime
});

export type RecruitmentPipelineTransitionInput = z.infer<typeof recruitmentPipelineTransitionSchema>;
export type RecruitmentPipelineOwnerInput = z.infer<typeof recruitmentPipelineOwnerSchema>;
export type RecruitmentPipelineDoNotContactInput = z.infer<typeof recruitmentPipelineDoNotContactSchema>;

export function parseRecruitmentPipelineTransition(input: unknown) {
  return recruitmentPipelineTransitionSchema.safeParse(input);
}

export function parseRecruitmentPipelineOwner(input: unknown) {
  return recruitmentPipelineOwnerSchema.safeParse(input);
}

export function parseRecruitmentPipelineDoNotContact(input: unknown) {
  return recruitmentPipelineDoNotContactSchema.safeParse(input);
}
