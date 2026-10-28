/**
 * Explicitly read-only VSC reply inspection endpoint.
 * No scheduler, no DB write, no campaign activation.
 */
import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { previewVscReplyReconciliation } from "@/services/vsc-reply-reconciliation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origine non autorisée" }, { status: 403, headers });
  const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
  if (!tenantId) return NextResponse.json({ error: "Espace non configuré" }, { status: 503, headers });
  const context = await getTenantContext(tenantId);
  if (!context || !canManageOvh(context))
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
  try {
    const result = await previewVscReplyReconciliation(tenantId);
    return NextResponse.json({
      dryRun: true,
      inspected: result.inspected,
      matched: result.matches.length
    }, { headers });
  } catch {
    return NextResponse.json({ error: "Inspection OVH indisponible" }, { status: 503, headers });
  }
}
