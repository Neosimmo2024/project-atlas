import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { reviewReply } from "@/services/reviewed-reply";
export const runtime = "nodejs";
export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Requête non autorisée." }, { status: 403 });
    const ctx = await getTenantContext();
    if (!ctx || !["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    const { id } = await route.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Réponse introuvable." }, { status: 404 });
    const raw = await request.text();
    if (raw.length > 15000) return NextResponse.json({ error: "Message trop long." }, { status: 400 });
    const body = JSON.parse(raw) as { action?: string; body?: unknown; revision?: unknown; confirmation?: unknown };
    if (!(["save", "send"].includes(body.action ?? "")) || typeof body.body !== "string" || typeof body.revision !== "number") return NextResponse.json({ error: "Informations invalides." }, { status: 400 });
    return NextResponse.json(await reviewReply(ctx, id, { action: body.action as "save" | "send", body: body.body,
      revision: body.revision, confirmation: typeof body.confirmation === "string" ? body.confirmation : undefined }));
  } catch {
    return NextResponse.json({ error: "Action refusée : rechargez la fiche. Un envoi déjà lancé ou incertain ne peut pas être répété ; vérifiez son statut dans Brevo." }, { status: 409 });
  }
}
