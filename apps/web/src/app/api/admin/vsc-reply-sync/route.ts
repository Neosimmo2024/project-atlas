/** Explicit administrator action: records replies and cancels follow-ups; never sends. */
import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { reconcileVscRepliesOnce } from "@/services/vsc-reply-worker";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origine non autorisée" }, { status: 403, headers });
  const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
  if (!tenantId) return NextResponse.json({ error: "Espace non configuré" }, { status: 503, headers });
  try {
    const context = await getTenantContext(tenantId);
    if (!context || !canManageOvh(context))
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    const result = await reconcileVscRepliesOnce(tenantId);
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ error: "Traitement interrompu. Une reprise est possible sans renvoyer de message." }, { status: 503, headers });
  }
}
