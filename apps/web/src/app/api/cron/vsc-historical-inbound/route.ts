/** Prepared polling entry point. No schedule installed; never sends a message. */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileVscHistoricalInboundOnce } from "@/services/vsc-historical-inbound-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.VSC_HISTORICAL_INBOUND_CRON_ENABLED !== "true")
    return NextResponse.json({ error: "Synchronisation automatique désactivée" }, { status: 503, headers });
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || authorization.length > 4096 || !timingSafeEqual(
    createHash("sha256").update(authorization).digest(),
    createHash("sha256").update(`Bearer ${secret}`).digest()
  )) return NextResponse.json({ error: "Accès non autorisé" }, { status: 401, headers });
  const tenant = process.env.VSC_OVH_TENANT_ID?.trim();
  const actor = process.env.VSC_HISTORICAL_INBOUND_ACTOR_ID?.trim();
  if (!tenant || !UUID.test(tenant) || !actor || !UUID.test(actor))
    return NextResponse.json({ error: "Espace ou administrateur non configuré" }, { status: 503, headers });
  try {
    // The worker enforces preview/disposable QA and the dedicated OVH mailbox.
    // Its RPC revalidates active administrator membership on every invocation.
    const result = await reconcileVscHistoricalInboundOnce(tenant, actor);
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ error: "Synchronisation interrompue. Vérifiez le bilan avant une reprise." }, { status: 503, headers });
  }
}
