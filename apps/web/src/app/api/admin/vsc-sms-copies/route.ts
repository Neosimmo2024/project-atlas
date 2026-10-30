import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { listVscSmsCopies, saveVscSmsCopy, VscSmsCopyInputError } from "@/services/vsc-sms-copy-drafts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function authorizedTenant() {
  const id = process.env.VSC_OVH_TENANT_ID?.trim();
  const context = id ? await getTenantContext(id) : null;
  return context && canManageOvh(context) ? id : null;
}
export async function GET() {
  try {
    const id = await authorizedTenant();
    if (!id) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    return NextResponse.json(await listVscSmsCopies(id), { headers });
  } catch { return NextResponse.json({ error: "Lecture SMS indisponible" }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403, headers });
  try {
    const id = await authorizedTenant();
    if (!id) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Format invalide" }, { status: 415, headers });
    const text = await request.text();
    if (text.length > 20000) return NextResponse.json({ error: "Requête trop grande" }, { status: 413, headers });
    let body;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400, headers }); }
    return NextResponse.json(await saveVscSmsCopy(id, body), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof VscSmsCopyInputError ? error.message : "Sauvegarde indisponible. Réessayez sans modifier cette version." }, { status: error instanceof VscSmsCopyInputError ? 400 : 503, headers });
  }
}
