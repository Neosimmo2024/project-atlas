import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { getVscManualCampaignReview, listVscManualCampaigns, sendOneVscEmailManually } from "@/services/vsc-manual-dispatch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const headers = { "Cache-Control": "no-store" };
async function adminContext() {
  const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
  const context = tenantId ? await getTenantContext(tenantId) : null;
  return context && canManageOvh(context) ? context : null;
}
export async function GET(request: Request) {
  try {
    const context = await adminContext();
    if (!context) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    const campaignId = new URL(request.url).searchParams.get("campaignId");
    return NextResponse.json(campaignId ? await getVscManualCampaignReview(context.tenantId, campaignId) : await listVscManualCampaigns(context.tenantId), { headers });
  } catch { return NextResponse.json({ error: "Relecture manuelle indisponible" }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403, headers });
  try {
    const context = await adminContext();
    if (!context) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Format invalide" }, { status: 415, headers });
    const raw = await request.text();
    if (raw.length > 2000) return NextResponse.json({ error: "Requête trop grande" }, { status: 413, headers });
    let body;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400, headers }); }
    const result = await sendOneVscEmailManually({
      context, campaignId: body?.campaignId, deliveryId: body?.deliveryId,
      reviewKey: body?.reviewKey, confirmed: body?.confirmed === true
    });
    return NextResponse.json({ result }, { headers });
  } catch { return NextResponse.json({ error: "Envoi manuel indisponible. Vérifiez le résultat avant toute nouvelle tentative." }, { status: 503, headers }); }
}
