import { NextResponse } from "next/server";
import { testEmailSchema } from "@/features/recruitment-email-template/test-email";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { getTenantContext } from "@/repositories/tenant-context";
import { sendRecruitmentTemplateTest } from "@/services/recruitment-template-test";

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Session requise." }, { status: 401 });
    if (context.role !== "owner" && context.role !== "admin") {
      return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    }
    const parsed = testEmailSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Vérifiez le modèle, le prénom et l’adresse du destinataire." }, { status: 400 });
    const result = await sendRecruitmentTemplateTest(parsed.data, context.tenant.id);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ data: { messageId: result.messageId, recipient: parsed.data.recipient } });
  } catch (error) {
    return apiErrorResponse(error, 500);
  }
}
