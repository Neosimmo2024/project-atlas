import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { prepareLyonEmailCampaign } from "@/services/lyon-email-campaign";

export const maxDuration = 60;

export async function POST(_request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
    if (context.role !== "owner" && context.role !== "admin") return NextResponse.json({ error: "Administration requise." }, { status: 403 });
    const { id } = await route.params;
    const data = await prepareLyonEmailCampaign(createSupabaseServiceRoleClient(), context.tenantId, id, await createSupabaseServerClient());
    return NextResponse.json({ data, emailsSent: 0, stepsScheduled: 0 });
  } catch (error) { return apiErrorResponse(error, 500); }
}
