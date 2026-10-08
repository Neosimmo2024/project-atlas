import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/security/api-errors";
import { getActiveRecruitmentEmailTemplate } from "@/repositories/recruitment-email-template-versions";
import { getTenantContext } from "@/repositories/tenant-context";
import { sendRecruitmentEmailTest } from "@/services/brevo";

const testRequestSchema = z.object({ requestId: z.string().uuid() });
const EXPECTED_SENDER = "renato.ponzio@neos-immo.com";

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    if (context.role !== "owner" && context.role !== "admin") {
      return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    }

    const parsed = testRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "La demande de test est invalide." }, { status: 400 });
    }

    const template = await getActiveRecruitmentEmailTemplate(context);
    if (!template?.brevo_template_id) {
      return NextResponse.json({ error: "Aucun modèle de recrutement actif n’est synchronisé dans Brevo." }, { status: 409 });
    }
    if (template.sender_email.trim().toLowerCase() !== EXPECTED_SENDER) {
      return NextResponse.json({ error: "Le modèle actif n’utilise pas l’expéditeur NEOS IMMO attendu." }, { status: 409 });
    }

    const result = await sendRecruitmentEmailTest({
      templateId: template.brevo_template_id,
      replyTo: template.reply_to,
      requestId: parsed.data.requestId
    });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ data: { messageId: result.messageId, recipient: EXPECTED_SENDER } });
  } catch (error) {
    return apiErrorResponse(error, 500);
  }
}
