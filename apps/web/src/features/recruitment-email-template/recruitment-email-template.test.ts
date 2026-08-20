import { describe, expect, it } from "vitest";

import {
  buildRecruitmentEmailHtml,
  DEFAULT_RECRUITMENT_EMAIL_TEMPLATE,
  recruitmentEmailTemplateSchema
} from "@/features/recruitment-email-template/model";

describe("recruitment email template model", () => {
  it("builds responsive branded HTML and keeps the Brevo first-name variable", () => {
    const html = buildRecruitmentEmailHtml(DEFAULT_RECRUITMENT_EMAIL_TEMPLATE);
    expect(html).toContain("NEOS <span");
    expect(html).toContain("{{ params.PRENOM }}");
    expect(html).toContain("max-width:640px");
    expect(html).toContain("#0B3D3B");
  });

  it("escapes authored content instead of allowing scripts in previews or emails", () => {
    const html = buildRecruitmentEmailHtml({
      ...DEFAULT_RECRUITMENT_EMAIL_TEMPLATE,
      headline: "<script>alert(1)</script>",
      bodyText: "Bonjour {{ params.PRENOM }},\n\n<img src=x onerror=alert(1)>"
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects invalid sender addresses and colors", () => {
    expect(recruitmentEmailTemplateSchema.safeParse({ ...DEFAULT_RECRUITMENT_EMAIL_TEMPLATE, senderEmail: "bad" }).success).toBe(false);
    expect(recruitmentEmailTemplateSchema.safeParse({ ...DEFAULT_RECRUITMENT_EMAIL_TEMPLATE, brandColor: "green" }).success).toBe(false);
  });
});
