import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { verifyOvhRoundtrip } from "@/services/ovh-roundtrip";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  // Cookie-authenticated diagnostic: reject cross-origin or origin-less requests.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403, headers });
  }
  try {
    const context = await getTenantContext(process.env.VSC_OVH_TENANT_ID?.trim());
    if (!context) return NextResponse.json({ error: "Connexion requise." }, { status: 401, headers });
    if (!canManageOvh(context)) return NextResponse.json({ error: "Accès non autorisé." }, { status: 403, headers });
    const result = await verifyOvhRoundtrip(context);
    return NextResponse.json(result, { status: result.success ? 200 : 503, headers });
  } catch {
    return NextResponse.json({ error: "Vérification temporairement indisponible." }, { status: 503, headers });
  }
}
