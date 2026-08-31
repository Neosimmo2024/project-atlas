import { buildRecruitmentEmailHtml, type RecruitmentEmailTemplateInput } from "@/features/recruitment-email-template/model";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { createBrevoRecruitmentTemplate } from "@/services/brevo";

const FOLLOW_UPS: Array<{ stepIndex: 1 | 2; vaultName: string; template: RecruitmentEmailTemplateInput }> = [
  {
    stepIndex: 1,
    vaultName: "brevo_recruitment_follow_up_1_template_id",
    template: {
      templateName: "Relance recrutement NEOS IMMO J+3",
      subject: "{{ params.PRENOM }}, avez-vous eu le temps de voir mon message ?",
      previewText: "Un petit rappel suite à mon précédent message",
      headline: "Avez-vous eu le temps de voir mon message ?",
      bodyText: `Bonjour {{ params.PRENOM }},

Je me permets de revenir vers vous suite à mon précédent message.

Je serais ravi d’échanger quelques minutes avec vous sur votre activité actuelle et vos projets dans l’immobilier, sans engagement bien sûr.

Si le sujet peut vous intéresser, dites-moi simplement quand vous seriez disponible pour en discuter.

Bien à vous,`,
      signatureName: "Renato Ponzio",
      signatureTitle: "Président de NEOS IMMO",
      senderName: "NEOS IMMO",
      senderEmail: "contact@neos-immo.com",
      replyTo: "contact@neos-immo.com",
      brandColor: "#0B3D3B"
    }
  },
  {
    stepIndex: 2,
    vaultName: "brevo_recruitment_follow_up_2_template_id",
    template: {
      templateName: "Relance recrutement NEOS IMMO J+7",
      subject: "{{ params.PRENOM }}, un dernier message avant de vous laisser tranquille",
      previewText: "Un dernier message concernant NEOS IMMO",
      headline: "Un dernier message, sans insister",
      bodyText: `Bonjour {{ params.PRENOM }},

Je me permets un dernier message concernant NEOS IMMO.

Je ne souhaite évidemment pas vous solliciter inutilement. Si vous êtes curieux de découvrir une autre façon d’exercer dans l’immobilier, je serai heureux d’échanger avec vous quelques minutes.

Et si ce n’est pas le bon moment, aucun souci : nous pourrons éventuellement en reparler plus tard.

Bien à vous,`,
      signatureName: "Renato Ponzio",
      signatureTitle: "Président de NEOS IMMO",
      senderName: "NEOS IMMO",
      senderEmail: "contact@neos-immo.com",
      replyTo: "contact@neos-immo.com",
      brandColor: "#0B3D3B"
    }
  }
];

async function getExistingTemplateId(vaultName: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("get_vault_secret_value", { p_name: vaultName });
  if (error) throw error;
  const parsed = Number(data);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function saveTemplateId(vaultName: string, templateId: number) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.rpc("set_vault_secret_value", {
    p_name: vaultName,
    p_value: String(templateId),
    p_description: "Lot 9B Brevo follow-up template id"
  });
  if (error) throw error;
}

export async function bootstrapRecruitmentFollowUpTemplates() {
  const results: Array<{ stepIndex: 1 | 2; templateId: number; created: boolean }> = [];
  for (const item of FOLLOW_UPS) {
    const existing = await getExistingTemplateId(item.vaultName);
    if (existing) {
      results.push({ stepIndex: item.stepIndex, templateId: existing, created: false });
      continue;
    }

    const creation = await createBrevoRecruitmentTemplate({
      templateName: item.template.templateName,
      subject: item.template.subject,
      senderName: item.template.senderName,
      senderEmail: item.template.senderEmail,
      replyTo: item.template.replyTo,
      htmlContent: buildRecruitmentEmailHtml(item.template),
      tag: item.stepIndex === 1 ? "avenor-recruitment-follow-up-j3" : "avenor-recruitment-follow-up-j7"
    });
    if (!creation.success) throw new Error(creation.error);
    await saveTemplateId(item.vaultName, creation.templateId);
    results.push({ stepIndex: item.stepIndex, templateId: creation.templateId, created: true });
  }
  return results;
}
