import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { getVscCampaignSummary } from "@/services/vsc-campaign-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
  if (!tenantId) return NextResponse.json({ error: "Espace non configuré" }, { status: 503, headers });
  const context = await getTenantContext(tenantId);
  if (!context || !canManageOvh(context))
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
  try {
    return NextResponse.json(await getVscCampaignSummary(tenantId), { headers });
  } catch {
    return NextResponse.json({ error: "Statistiques temporairement indisponibles" }, { status: 503, headers });
  }
}
