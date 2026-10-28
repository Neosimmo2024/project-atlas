import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { getVscDraftWorkspace, readVscEmailDraft, previewVscEmailDraft, saveVscEmailDraft, VscDraftInputError } from "@/services/vsc-draft-workspace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function authorizedTenant() {
  const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
  if (!tenantId) return null;
  const context = await getTenantContext(tenantId);
  return context && canManageOvh(context) ? tenantId : null;
}
export async function GET(request: Request) {
  try {
    const tenantId = await authorizedTenant();
    if (!tenantId) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    const campaignId = new URL(request.url).searchParams.get("campaignId");
    return NextResponse.json(campaignId ? await readVscEmailDraft(tenantId, campaignId) : await getVscDraftWorkspace(tenantId), { headers });
  } catch { return NextResponse.json({ error: "Préparation indisponible" }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origine non autorisée" }, { status: 403, headers });
  try {
    const tenantId = await authorizedTenant();
    if (!tenantId) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json({ error: "Format invalide" }, { status: 415, headers });
    const text = await request.text();
    if (text.length > 30000) return NextResponse.json({ error: "Requête trop grande" }, { status: 413, headers });
    let body;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400, headers }); }
    if (!body || !["preview", "save"].includes(body.action))
      return NextResponse.json({ error: "Action invalide" }, { status: 400, headers });
    if (body.action === "save") return NextResponse.json(await saveVscEmailDraft(tenantId, body.draft, body.reviewKey), { headers });
    return NextResponse.json(await previewVscEmailDraft(tenantId, body.draft), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof VscDraftInputError ? error.message : "Opération indisponible. Vous pouvez réessayer sans changer de brouillon." }, { status: error instanceof VscDraftInputError ? 400 : 503, headers });
  }
}
