/** Prepared scheduler entry point. No schedule is installed; never sends messages. */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileVscRepliesOnce } from "@/services/vsc-reply-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.VSC_REPLY_CRON_ENABLED !== "true")
    return NextResponse.json({ error: "Traitement automatique désactivé" }, { status: 503, headers });
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || authorization.length > 4096 || !timingSafeEqual(
    createHash("sha256").update(authorization).digest(),
    createHash("sha256").update(`Bearer ${secret}`).digest()
  )) return NextResponse.json({ error: "Accès non autorisé" }, { status: 401, headers });
  const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
  if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId))
    return NextResponse.json({ error: "Espace non configuré" }, { status: 503, headers });
  try {
    return NextResponse.json(await reconcileVscRepliesOnce(tenantId), { headers });
  } catch {
    return NextResponse.json({ error: "Traitement interrompu. Le prochain appel pourra reprendre le lot." }, { status: 503, headers });
  }
}
