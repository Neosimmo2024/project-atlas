import { z } from "zod";

export const recruitmentEmailTemplateSchema = z.object({
  templateName: z.string().trim().min(3).max(120),
  subject: z.string().trim().min(3).max(200),
  previewText: z.string().trim().max(200),
  headline: z.string().trim().min(3).max(200),
  bodyText: z.string().trim().min(20).max(10000),
  signatureName: z.string().trim().min(2).max(120),
  signatureTitle: z.string().trim().max(160),
  senderName: z.string().trim().min(2).max(120),
  senderEmail: z.string().trim().email().max(254),
  replyTo: z.union([z.string().trim().email().max(254), z.literal("")]),
  brandColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/)
});

export type RecruitmentEmailTemplateInput = z.infer<typeof recruitmentEmailTemplateSchema>;

export const DEFAULT_RECRUITMENT_EMAIL_TEMPLATE: RecruitmentEmailTemplateInput = {
  templateName: "Premier email recrutement NEOS IMMO",
  subject: "{{ params.PRENOM }}, échangeons sur votre projet immobilier",
  previewText: "Une autre vision du réseau immobilier",
  headline: "Une autre vision de l’immobilier",
  bodyText: `Bonjour {{ params.PRENOM }},

Je me permets de vous contacter afin d’échanger avec vous sur votre activité et vos projets professionnels dans l’immobilier.

Chez NEOS IMMO, nous proposons une autre vision du réseau : un accompagnement de proximité, des outils performants, des formations et une rémunération évolutive de 75 % à 100 %.

Notre modèle permet également de développer sa propre équipe et de bénéficier d’une rémunération durable sur son activité.

Je serais ravi d’échanger quelques minutes avec vous pour découvrir votre projet et vous présenter notre fonctionnement.

Bien à vous,`,
  signatureName: "Renato Ponzio",
  signatureTitle: "Président de NEOS IMMO",
  senderName: "NEOS IMMO",
  senderEmail: "contact@neos-immo.com",
  replyTo: "contact@neos-immo.com",
  brandColor: "#0B3D3B"
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildRecruitmentEmailHtml(input: RecruitmentEmailTemplateInput) {
  const paragraphs = input.bodyText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 18px;line-height:1.65;">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");

  const preview = escapeHtml(input.previewText);
  const brand = escapeHtml(input.brandColor.toUpperCase());

  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f6f5;color:#1f2933;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e1e6e3;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:30px 34px 22px;text-align:center;border-top:8px solid ${brand};">
          <div style="font-size:30px;font-weight:800;letter-spacing:.08em;color:${brand};">NEOS <span style="color:#FF6834;">IMMO</span></div>
        </td></tr>
        <tr><td style="padding:8px 34px 34px;">
          <h1 style="margin:0 0 26px;color:${brand};font-size:28px;line-height:1.25;text-align:center;">${escapeHtml(input.headline)}</h1>
          <div style="font-size:16px;line-height:1.65;">${paragraphs}</div>
          <div style="margin-top:26px;padding-top:20px;border-top:1px solid #e1e6e3;">
            <strong style="display:block;color:${brand};font-size:17px;">${escapeHtml(input.signatureName)}</strong>
            <span style="display:block;margin-top:4px;color:#667085;font-size:14px;">${escapeHtml(input.signatureTitle)}</span>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function templateInputFromVersion(version: {
  template_name: string;
  subject: string;
  preview_text: string;
  headline: string;
  body_text: string;
  signature_name: string;
  signature_title: string;
  sender_name: string;
  sender_email: string;
  reply_to: string | null;
  brand_color: string;
}): RecruitmentEmailTemplateInput {
  return {
    templateName: version.template_name,
    subject: version.subject,
    previewText: version.preview_text,
    headline: version.headline,
    bodyText: version.body_text,
    signatureName: version.signature_name,
    signatureTitle: version.signature_title,
    senderName: version.sender_name,
    senderEmail: version.sender_email,
    replyTo: version.reply_to ?? "",
    brandColor: version.brand_color
  };
}
