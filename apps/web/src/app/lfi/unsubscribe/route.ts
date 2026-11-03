import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { validUnsubscribeToken } from "@/services/lfi-campaign-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex", "Content-Security-Policy": "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'" };
function page(text: string, form = "", status = 200) { return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Les Formateurs Immo — Désinscription</title><body style="font-family:Arial,sans-serif;max-width:620px;margin:60px auto;padding:20px;color:#142345"><h1>Les Formateurs Immo</h1><p>${text}</p>${form}</body></html>`, { status, headers }); }
export async function GET(request: Request) {
 const token = new URL(request.url).searchParams.get("token") ?? "";
 if (!validUnsubscribeToken(token)) return page("Ce lien de désinscription est invalide.", "", 400);
 // GET does not unsubscribe: email-link scanners must not change preferences.
 return page("Vous pouvez arrêter les e-mails de campagne des Formateurs Immo.", `<form method="post"><input type="hidden" name="token" value="${token}"><button type="submit">Confirmer ma désinscription</button></form>`);
}
export async function POST(request: Request) {
 try {
  if (Number(request.headers.get("content-length") || 0) > 2048) return page("Requête invalide.", "", 400);
  const raw = await request.text();
  if (raw.length > 2048) return page("Requête invalide.", "", 400);
  const token = new URLSearchParams(raw).get("token") ?? new URL(request.url).searchParams.get("token") ?? "";
  if (!validUnsubscribeToken(token)) return page("Ce lien de désinscription est invalide.", "", 400);
  const db = createSupabaseServiceRoleClient();
  const { data, error } = await db.from("lfi_recipients").select("tenant_id,email").eq("unsubscribe_token", token).maybeSingle();
  if (error) throw new Error("UNAVAILABLE");
  if (!data) return page("Ce lien de désinscription est invalide.", "", 400);
  const stopped = await db.rpc("lfi_stop_recipient", { p_tenant: data.tenant_id, p_email: data.email, p_reason: "unsubscribed" });
  if (stopped.error) throw new Error("UNAVAILABLE");
  return page("Votre désinscription est enregistrée. Vous ne recevrez plus les e-mails de campagne des Formateurs Immo.");
 } catch { return page("Le service est temporairement indisponible. Vous pouvez nous écrire à contact@lesformateursimmo.com.", "", 503); }
}
