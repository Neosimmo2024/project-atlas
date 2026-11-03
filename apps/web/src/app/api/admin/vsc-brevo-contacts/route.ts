import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { previewVscBrevoContactImport, executeVscBrevoContactImport, VscBrevoImportInputError } from "@/services/vsc-brevo-contact-import";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const headers = { "Cache-Control": "no-store" };
async function context() {
  const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
  const result = tenantId ? await getTenantContext(tenantId) : null;
  return result && canManageOvh(result) ? result : null;
}
export async function GET() {
  try {
    const actor = await context();
    if (!actor) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    return NextResponse.json(await previewVscBrevoContactImport(actor.tenantId), { headers });
  } catch { return NextResponse.json({ error: "Rapprochement indisponible. La source doit être lue complètement avant tout import." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403, headers });
  try {
    const actor = await context();
    if (!actor) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Format invalide" }, { status: 415, headers });
    const text = await request.text();
    if (text.length > 2000) return NextResponse.json({ error: "Requête trop grande" }, { status: 413, headers });
    let body;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400, headers }); }
    return NextResponse.json(await executeVscBrevoContactImport(actor.tenantId, actor.userId, body?.reviewKey), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof VscBrevoImportInputError ? error.message : "Import interrompu. Certaines fiches peuvent déjà être importées. Rechargez l’aperçu puis reprenez ; aucun envoi n’est lancé." }, { status: error instanceof VscBrevoImportInputError ? 400 : 503, headers });
  }
}
