import { z } from "zod";
import { QUALIFICATION_CONCLUSIONS } from "./options";

const nullableText = z.string().trim().max(2000, "Ce champ est trop long.").transform((value) => value || null);

export const talentQualificationSchema = z.object({
  experience_level: nullableText,
  professional_status: nullableText,
  years_in_real_estate: z.union([z.literal(""), z.null(), z.coerce.number().int().min(0, "L'ancienneté ne peut pas être négative.").max(80, "L'ancienneté est trop élevée.")]).transform((value) => value === "" ? null : value),
  vat_situation: nullableText,
  current_network: nullableText,
  geographic_area: nullableText,
  availability: nullableText,
  motivation: nullableText,
  primary_need: nullableText,
  project_maturity: nullableText,
  comments: nullableText,
  conclusion: z.union([z.literal(""), z.enum(QUALIFICATION_CONCLUSIONS)]).transform((value) => value || null),
  action: z.enum(["draft", "finalize"])
}).superRefine((value, context) => {
  if (value.action === "finalize" && !value.conclusion) {
    context.addIssue({ code: "custom", path: ["conclusion"], message: "Choisissez une conclusion avant de terminer la qualification." });
  }
});

export function parseTalentQualification(input: unknown) {
  return talentQualificationSchema.safeParse(input);
}

export type TalentQualificationInput = Omit<z.infer<typeof talentQualificationSchema>, "action">;
