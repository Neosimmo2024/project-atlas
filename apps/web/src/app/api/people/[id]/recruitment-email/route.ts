import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { getPersonDetail } from "@/repositories/people";
import {
  claimRecruitmentEmailSequence,
  completeRecruitmentEmailSequence,
  getRecruitmentEmailSequence,
  stopRecruitmentEmailSequence
} from "@/repositories/recruitment-email-sequences";
import { getTenantContext } from "@/repositories/tenant-context";
import { sendInitialRecruitmentEmail } from "@/services/brevo";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: RouteContext) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const { id } = await route.params;
    return NextResponse.json({ data: await getRecruitmentEmailSequence(context, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(_request: Request, route: RouteContext) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    if (context.role === "reader") return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    const { id } = await route.params;
    const detail = await getPersonDetail(context, id);
    if (!detail) return NextResponse.json({ error: "Personne introuvable." }, { status: 404 });
    if (!detail.person.primary_email) return NextResponse.json({ error: "Une adresse email principale est nécessaire." }, { status: 400 });
    if (!detail.person.contact_allowed || detail.person.do_not_contact) {
      return NextResponse.json({ error: "Cette personne ne peut pas être contactée." }, { status: 409 });
    }

    const sequence = await claimRecruitmentEmailSequence(context, id);
    if (sequence.status === "sent") return NextResponse.json({ data: sequence, duplicatePrevented: true });
    if (sequence.status === "stopped") return NextResponse.json({ error: "La séquence a été arrêtée." }, { status: 409 });

    const result = await sendInitialRecruitmentEmail({
      sequenceId: sequence.id,
      email: sequence.email,
      displayName: detail.person.display_name
    });
    const completed = await completeRecruitmentEmailSequence(context, sequence.id, result.success
      ? { success: true, providerMessageId: result.messageId }
      : { success: false, error: result.error });

    if (!result.success) return NextResponse.json({ error: result.error, data: completed }, { status: 502 });
    return NextResponse.json({ data: completed });
  } catch (error) {
    return apiErrorResponse(error, 500);
  }
}

export async function DELETE(_request: Request, route: RouteContext) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    if (context.role === "reader") return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    const { id } = await route.params;
    const sequence = await getRecruitmentEmailSequence(context, id);
    if (!sequence) return NextResponse.json({ error: "Aucune séquence à arrêter." }, { status: 404 });
    return NextResponse.json({ data: await stopRecruitmentEmailSequence(context, sequence.id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
