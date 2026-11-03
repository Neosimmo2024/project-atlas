import { createHmac, timingSafeEqual } from "node:crypto";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type VscUnsubscribeClaim = { v: 1; tenantId: string; personId: string; channel: "email" };
function signingKey() {
  const key = process.env.VSC_UNSUBSCRIBE_SIGNING_KEY;
  if (!key || key.length < 32) throw new Error("Désinscription VSC non configurée");
  return key;
}
function signature(payload: string) { return createHmac("sha256", signingKey()).update(payload).digest(); }
export function createVscUnsubscribeToken(tenantId: string, personId: string) {
  if (!UUID.test(tenantId) || !UUID.test(personId) || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error("Contact VSC non autorisé");
  // No expiration: a previously delivered opt-out link must remain usable.
  const payload = Buffer.from(JSON.stringify({ v: 1, tenantId, personId, channel: "email" })).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function verifyVscUnsubscribeToken(token: string): VscUnsubscribeClaim | null {
  try {
    if (token.length > 1024) return null;
    const [payload, mac, extra] = token.split(".");
    if (!payload || !mac || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(mac)) return null;
    const expected = signature(payload); const actual = Buffer.from(mac,"base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claim = JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    return claim.v === 1 && UUID.test(claim.tenantId) && UUID.test(claim.personId) && claim.channel === "email" &&
      claim.tenantId === process.env.VSC_OVH_TENANT_ID?.trim() ? claim : null;
  } catch { return null; }
}
export function createVscUnsubscribeUrl(tenantId: string, personId: string) {
  const base = new URL(process.env.VSC_PUBLIC_BASE_URL ?? "");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Adresse publique VSC invalide");
  const url = new URL("/vsc-unsubscribe", base);
  url.searchParams.set("token", createVscUnsubscribeToken(tenantId, personId));
  return url.toString();
}
