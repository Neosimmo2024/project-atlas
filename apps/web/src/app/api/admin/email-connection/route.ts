import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageIonos, verifyIonosConnection } from "@/services/ionos-connection";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  // Cookie-authenticated diagnostic: reject cross-origin or origin-less requests.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403, headers });
  }
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Connexion requise." }, { status: 401, headers });
    if (!canManageIonos(context)) return NextResponse.json({ error: "Accès non autorisé." }, { status: 403, headers });
    const result = await verifyIonosConnection(context);
    return NextResponse.json(result, { status: result.success ? 200 : 503, headers });
  } catch {
    return NextResponse.json({ error: "Vérification temporairement indisponible." }, { status: 503, headers });
  }
}
