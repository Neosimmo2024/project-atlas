import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/repositories/tenant-context";
import { getPersonDetail } from "@/repositories/people";
import { createInteraction, listInteractionTypes } from "@/repositories/interactions";
import { getWhatsAppFollowup } from "@/repositories/whatsapp-followup";
import { parseInteractionInput } from "@/features/interactions/validation";
import { WHATSAPP_EVENTS, WHATSAPP_LABELS } from "@/features/whatsapp/manual";
import { apiErrorResponse } from "@/lib/security/api-errors";
const input = z.object({ event: z.enum(WHATSAPP_EVENTS), summary: z.string().trim().min(1).max(4000) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Connexion nécessaire." }, { status: 401 });
    if (context.role === "reader") return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Précisez le message ou la preuve de l'accord." }, { status: 400 });
    const detail = await getPersonDetail(context, id);
    if (!detail) return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    const { event, summary } = parsed.data;
    if (event === "sent" || event === "consent_granted") {
      if (detail.person.do_not_contact) return NextResponse.json({ error: "Le contact n'est pas autorisé sur cette fiche." }, { status: 409 });
    }
    if (event === "sent" && !(await getWhatsAppFollowup(context, id)).consent) return NextResponse.json({ error: "L'accord WhatsApp doit être enregistré." }, { status: 409 });
    const type = (await listInteractionTypes(context)).find((item) => item.slug === "whatsapp");
    if (!type) return NextResponse.json({ error: "Type WhatsApp indisponible." }, { status: 500 });
    const payload = parseInteractionInput({ person_id: id, type_id: type.id, title: WHATSAPP_LABELS[event], summary, interaction_date: new Date().toISOString(), metadata: { channel: "whatsapp_manual", whatsapp_event: event } });
    if (!payload.success) return NextResponse.json({ error: "Échange invalide." }, { status: 400 });
    const interaction = await createInteraction(context, payload.data);
    return NextResponse.json({ data: { id: interaction.id } }, { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
