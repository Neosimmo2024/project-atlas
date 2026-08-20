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

const NEOS_LOGO_URL = "https://raw.githubusercontent.com/Neosimmo2024/project-atlas/f1ce2c00eae740eb54c18741a183132d318d9d18/apps/web/public/neos-email-logo.png";

const PERMANENT_RECRUITMENT_SIGNATURE_HTML = `<p><img style="border-radius:100%;display:block;" src="https://extranet.neos-immo.com/img/avatar/106b091e93a6bcb57779c422171f7c99.jpg" alt="Renato Ponzio" width="100" height="100" /></p>
<p style="font-family:Arial,sans-serif;color:#11718b;font-weight:bold;margin:0;font-size:22px;">Renato Ponzio<br />Président<br />Expert Immobilier</p>
<p style="font-family:Arial,sans-serif;font-weight:bold;margin:0;font-size:20px;">0661558750</p>
<p><img style="margin:0;display:block;" src="${NEOS_LOGO_URL}" alt="Logo NEOS" width="180" /></p>
<div style="margin:10px 0;"><a href="https://www.facebook.com/RENATOPONZIO2" rel="noopener"><img src="https://extranet.neos-immo.com/img/signatures/facebook.svg" alt="Facebook" width="30" /></a> <a href="https://www.linkedin.com/in/renatoponzio/" rel="noopener"><img src="https://extranet.neos-immo.com/img/signatures/linkedin.svg" alt="LinkedIn" width="30" /></a> <a href="https://www.instagram.com/renatoponzio/?__d=11" rel="noopener"><img src="https://extranet.neos-immo.com/img/signatures/instagram.svg" alt="Instagram" width="30" /></a> <a href="https://www.google.com/search?q=neos+immo&amp;rlz=1C1CHBF_frFR902FR902&amp;sxsrf=ALiCzsY6o5yMGXCLr9wvbPhz274ErAUhSw%3A1666767009182&amp;ei=odhYY63iCs_IaI6gmJAM&amp;oq=neos&amp;gs_lcp=Cgdnd3Mtd2l6EAEYADIECCMQJzIECCMQJzIECCMQJzIQCC4QgAQQhwIQxwEQrwEQFDIHCAAQsQMQQzIHCAAQsQMQQzIF" rel="noopener"><img src="https://extranet.neos-immo.com/img/signatures/google.svg" alt="Google" width="30" /></a> <a href="https://www.youtube.com/channel/UCx8f0r-sLu0Fuf3kVbKwzeQ" rel="noopener"><img src="https://extranet.neos-immo.com/img/signatures/youtube.svg" alt="YouTube" width="30" /></a></div>
<p><a style="font-family:Arial,sans-serif;display:block;color:#11718b;font-weight:400;text-decoration:underline;" href="https://neos-immo.com/?sourceSignature=Renato%20Ponzio">Estimez votre bien en ligne</a><br /><br /><a style="font-family:Arial,sans-serif;display:block;color:#11718b;font-weight:400;text-decoration:underline;" href="https://ayvdwroc.gensparkspace.com/">Présentation du réseau</a></p>`;

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
        <tr><td style="padding:26px 34px 20px;text-align:center;border-top:8px solid ${brand};">
          <img src="${NEOS_LOGO_URL}" alt="NEOS" width="180" style="display:block;width:180px;max-width:100%;height:auto;margin:0 auto;border:0;" />
        </td></tr>
        <tr><td style="padding:8px 34px 34px;">
          <h1 style="margin:0 0 26px;color:${brand};font-size:28px;line-height:1.25;text-align:center;">${escapeHtml(input.headline)}</h1>
          <div style="font-size:16px;line-height:1.65;">${paragraphs}</div>
          <div style="margin-top:26px;padding-top:20px;border-top:1px solid #e1e6e3;">${PERMANENT_RECRUITMENT_SIGNATURE_HTML}</div>
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
