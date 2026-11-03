import { verifyVscUnsubscribeToken } from "@/services/vsc-unsubscribe-token";
import { unsubscribeVscContact } from "@/services/vsc-contact-stop";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Strip paths/tokens from Referer while preserving Origin on native HTTPS form POSTs.
const headers = {
  "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
  "Referrer-Policy": "strict-origin", "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
};
function escape(value: string) { return value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!)); }
function page(message: string, status = 200, token?: string) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Désinscription — VendreSonCommerce</title></head><body style="font-family:system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:24px;line-height:1.6"><main><p>VendreSonCommerce</p><h1>Désinscription</h1><p>${escape(message)}</p>${token ? `<form method="post" action="/vsc-unsubscribe"><input type="hidden" name="token" value="${escape(token)}"><button type="submit" style="padding:12px 20px;cursor:pointer">Confirmer ma désinscription des emails</button></form>` : ""}</main></body></html>`, { status, headers });
}
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!verifyVscUnsubscribeToken(token)) return page("Ce lien est invalide ou indisponible. Vous pouvez demander votre désinscription en répondant au message reçu.", 400);
  // GET never changes consent: mail scanners must not trigger an opt-out.
  return page("Vous ne souhaitez plus recevoir nos emails de prospection ? Confirmez votre choix ci-dessous.", 200, token);
}
async function readForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty form");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 4096) { await reader.cancel(); throw new Error("Form too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return page("Requête non autorisée.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return page("Formulaire invalide.", 415);
  let token: string;
  try { token = (await readForm(request)).get("token") ?? ""; } catch { return page("Formulaire invalide.", 400); }
  const claim = verifyVscUnsubscribeToken(token);
  if (!claim) return page("Ce lien est invalide ou indisponible.", 400);
  try {
    await unsubscribeVscContact(claim.tenantId, claim.personId, claim.channel);
    return page("Votre désinscription est enregistrée. Vous ne recevrez plus nos emails de prospection.");
  } catch { return page("La demande n’a pas pu être enregistrée. Réessayez ou répondez au message reçu pour demander votre désinscription.", 503); }
}
