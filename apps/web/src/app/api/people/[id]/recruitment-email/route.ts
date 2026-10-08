import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getLyonCampaignForPerson } from "@/services/lyon-email-campaign";
import { canLaunchLyon, makeLyonSnapshot } from "@/features/recruitment-email/lyon-campaign";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { getPersonDetail } from "@/repositories/people";
import {
  claimRecruitmentEmailSequence,
  completeRecruitmentEmailSequence,
  getRecruitmentEmailSequence,
  stopRecruitmentEmailSequence
} from "@/repositories/recruitment-email-sequences";
import { getActiveRecruitmentEmailTemplate } from "@/repositories/recruitment-email-template-versions";
import { getTenantContext } from "@/repositories/tenant-context";
import { sendInitialRecruitmentEmail } from "@/services/brevo";
import { isLyonRecruitmentProfile } from "@/features/recruitment-email/campaign-policy";

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
    const previousSequence = await getRecruitmentEmailSequence(context, id);
    const lyonProfile = isLyonRecruitmentProfile(detail.person.comments) || Boolean(previousSequence?.campaign_snapshot);
    const lyon = lyonProfile ? await getLyonCampaignForPerson(createSupabaseServiceRoleClient(), context.tenantId, id) : null;
    if (lyonProfile && (!lyon || !canLaunchLyon(lyon.campaign, id))) {
      return NextResponse.json({ error: "Campagne Lyon : lancement non autorisé pour ce destinataire." }, { status: 409 });
    }
    if (!detail.person.primary_email) return NextResponse.json({ error: "Une adresse email principale est nécessaire." }, { status: 400 });
    if (!detail.person.contact_allowed || detail.person.do_not_contact) {
      return NextResponse.json({ error: "Cette personne ne peut pas être contactée." }, { status: 409 });
    }

    const sequence = await claimRecruitmentEmailSequence(context, id);
    if (sequence.status === "sent") return NextResponse.json({ data: sequence, duplicatePrevented: true });
    if (sequence.status === "stopped") return NextResponse.json({ error: "La séquence a été arrêtée." }, { status: 409 });

    if (lyon) {
      const { data: bound, error: bindingError } = await createSupabaseServiceRoleClient().from("recruitment_email_sequences")
        .update({ campaign_snapshot: makeLyonSnapshot(lyon.projectId, lyon.campaign) })
        .eq("tenant_id", context.tenantId).eq("id", sequence.id).eq("status", "pending").select("id").maybeSingle();
      if (bindingError) throw bindingError;
      if (!bound) return NextResponse.json({ error: "La séquence Lyon ne peut pas être raccordée." }, { status: 409 });
    }
    const activeTemplate = lyon ? null : await getActiveRecruitmentEmailTemplate(context);
    const result = await sendInitialRecruitmentEmail({
      sequenceId: sequence.id,
      email: sequence.email,
      displayName: detail.person.display_name,
      templateId: lyon ? lyon.campaign.template_ids![0] : activeTemplate?.brevo_template_id ?? null
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
