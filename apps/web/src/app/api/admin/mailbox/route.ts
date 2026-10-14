import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { connectMailbox, mailboxStatus, pauseMailbox, syncMailbox } from "@/services/planet-mailbox";

export const runtime = "nodejs";
export const maxDuration = 120;
async function context() {
  const value = await getTenantContext();
  return value && ["owner", "admin"].includes(value.role) ? value : null;
}
export async function GET() {
  try {
    const ctx = await context();
    if (!ctx) return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    return NextResponse.json(await mailboxStatus(ctx.tenantId), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Connexion temporairement indisponible." }, { status: 503 }); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin
      || !request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: "Requête non autorisée." }, { status: 403 });
    }
    const ctx = await context();
    if (!ctx) return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 5000) return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 400 });
    const body = JSON.parse(raw) as { action?: string; password?: unknown };
    if (body.action === "connect") {
      if (typeof body.password !== "string" || !body.password.length || body.password.length > 1024) {
        return NextResponse.json({ error: "Saisissez le mot de passe de la boîte." }, { status: 400 });
      }
      await connectMailbox(ctx.tenantId, body.password);
      return NextResponse.json({ message: "Connexion vérifiée et enregistrée. Vous pouvez lancer la première synchronisation." });
    }
    if (body.action === "sync") return NextResponse.json({ result: await syncMailbox(ctx.tenantId) });
    if (body.action === "pause") { await pauseMailbox(ctx.tenantId); return NextResponse.json({ message: "Lecture automatique suspendue." }); }
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  } catch {
    // Never log IMAP errors, request bodies or authentication credentials.
    return NextResponse.json({ error: "Connexion ou synchronisation refusée. Vérifiez le mot de passe et la disponibilité du serveur." }, { status: 502 });
  }
}
