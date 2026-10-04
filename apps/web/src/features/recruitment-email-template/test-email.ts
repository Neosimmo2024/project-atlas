import { z } from "zod";
import { recruitmentEmailTemplateSchema, type RecruitmentEmailTemplateInput } from "./model";

export const testEmailSchema = z.object({
  template: recruitmentEmailTemplateSchema,
  recipient: z.string().trim().email().max(254),
  firstName: z.string().trim().min(1).max(80).regex(/^[^{}\r\n]+$/),
  requestId: z.string().uuid()
});

export function personalizeTestTemplate(template: RecruitmentEmailTemplateInput, firstName: string) {
  const replace = (value: string) => value.replace(/{{\s*params\.PRENOM\s*}}/g, () => firstName);
  return { ...template, subject: replace(template.subject), previewText: replace(template.previewText),
    headline: replace(template.headline), bodyText: replace(template.bodyText) };
}
