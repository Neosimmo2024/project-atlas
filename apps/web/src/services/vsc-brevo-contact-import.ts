/** Existing Brevo VSC -> Atlas VSC only. Provider reads only; no campaign or sending calls. */
import { createHash, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { inspectVscBrevoSmsAccount } from "./vsc-brevo-sms-status";
import { groupVscBrevoContacts, normalizeVscBrevoContact, summarizeVscBrevoGroups, type BrevoContact, type VscBrevoImportGroup } from "@/features/vsc-campaign/brevo-contact-import";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTACTS = 5000;
const QA_ORIGIN = "https://mahgxumwucxehsooijag.supabase.co";
export class VscBrevoImportInputError extends Error {}
export type VscBrevoImportTotals = { created: number; matched: number; conflicts: number; withoutCoordinates: number; sourceContacts: number; cancelled: number };
function assertTenant(tenantId: string) {
  if (!UUID.test(tenantId) || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error("Entreprise non autorisée");
}
export function assertVscBrevoImportEnvironment() {
  let url: URL;
  try { url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid"); }
  catch { throw new Error("Import réservé au QA VSC"); }
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) throw new Error("Import réservé au QA VSC");
  const disposable = process.env.NODE_ENV === "test" && process.env.VSC_DISPOSABLE_TEST_DB === "1"
    && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "54321";
  const qa = process.env.VERCEL_ENV === "preview" && url.origin === QA_ORIGIN;
  if (!qa && !disposable) throw new Error("Import réservé à la prévisualisation QA VSC ou à la base locale jetable de test");
}
export function vscBrevoImportPersonId(tenantId: string, sourceId: number) {
  const h = createHash("sha256").update(`vsc-brevo-contact:${tenantId}:${sourceId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function providerGet(path: string, deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Lecture Brevo interrompue");
  const key = process.env.BREVO_VSC_API_KEY?.trim();
  if (!key) throw new Error("Clé VSC dédiée absente");
  try {
    const response = await fetch(`https://api.brevo.com/v3/${path}`, { method: "GET", headers: { "api-key": key, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(Math.min(8000, remaining)) });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch { throw new Error("Lecture du compte Brevo VSC indisponible"); }
}
async function readSource(tenantId: string) {
  assertTenant(tenantId);
  assertVscBrevoImportEnvironment();
  if ((await inspectVscBrevoSmsAccount(tenantId)).state !== "identity_verified")
    throw new Error("Le compte Brevo VSC doit être vérifié avant tout import");
  const deadline = Date.now() + 45000;
  const contacts: BrevoContact[] = [], ids = new Set<number>();
  let expected: number | null = null, offset = 0;
  for (let page = 0; page < 10; page++) {
    const result = await providerGet(`contacts?limit=1000&offset=${offset}&sort=asc`, deadline);
    if (!Array.isArray(result?.contacts) || !Number.isSafeInteger(result.count) || result.count < 0 || result.count > MAX_CONTACTS || result.contacts.length > 1000)
      throw new Error("Instantané Brevo incomplet ou trop volumineux");
    if (expected !== null && expected !== result.count) throw new Error("La base Brevo a changé pendant sa lecture");
    expected = result.count;
    for (const row of result.contacts as BrevoContact[]) {
      if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || ids.has(row.id)) throw new Error("Identités Brevo incohérentes pendant la lecture");
      contacts.push(row); ids.add(row.id);
    }
    offset += result.contacts.length;
    if (offset === expected) break;
    if (offset > (expected ?? 0) || result.contacts.length === 0 || page === 9) throw new Error("Pagination Brevo incomplète");
  }
  if (expected !== contacts.length) throw new Error("Instantané Brevo incomplet");
  const lists: { id: number; name: string }[] = [];
  const listIds = new Set<number>();
  for (let page = 0; page < 4; page++) {
    const result = await providerGet(`contacts/lists?limit=50&offset=${page * 50}&sort=asc`, deadline);
    if (!Array.isArray(result?.lists) || result.lists.length > 50) throw new Error("Listes Brevo indisponibles");
    for (const list of result.lists) {
      if (!Number.isSafeInteger(list?.id) || list.id <= 0 || typeof list.name !== "string" || listIds.has(list.id)) throw new Error("Listes Brevo incohérentes");
      lists.push({ id: list.id, name: list.name.trim().slice(0, 200) }); listIds.add(list.id);
    }
    if (result.lists.length < 50 || (Number.isSafeInteger(result.count) && lists.length === result.count)) break;
    if (page === 3) throw new Error("Trop de listes Brevo pour une lecture complète");
  }
  const normalized = contacts.map(normalizeVscBrevoContact).sort((a, b) => a.source_id - b.source_id);
  const groups = groupVscBrevoContacts(normalized, id => vscBrevoImportPersonId(tenantId, id));
  const names = new Map(lists.map(list => [list.id, list.name]));
  const memberships = new Map<number, { id: number; name: string; contacts: number; emailBlocked: number; smsBlocked: number }>();
  for (const row of normalized) for (const id of row.source_lists) {
    const item = memberships.get(id) ?? { id, name: names.get(id) ?? `Liste ${id}`, contacts: 0, emailBlocked: 0, smsBlocked: 0 };
    item.contacts++; if (row.email_blocked) item.emailBlocked++; if (row.sms_blocked) item.smsBlocked++;
    memberships.set(id, item);
  }
  const sourceSummary = summarizeVscBrevoGroups(normalized, groups);
  const missingStatuses = normalized.filter(row => !row.email_status_known || !row.sms_status_known).length;
  return { groups, sourceSummary: { ...sourceSummary, missingStatuses }, lists: [...memberships.values()].sort((a, b) => a.id - b.id) };
}
async function targetSnapshot(tenantId: string) {
  const db = createSupabaseServiceRoleClient();
  const people: unknown[] = [], links: unknown[] = [];
  for (const [table, columns, sort, rows] of [
    ["people", "id,primary_email,primary_phone,contact_allowed,do_not_contact,updated_at", "id", people],
    ["vsc_brevo_contact_links", "provider_id,person_id,email_blocked,sms_blocked,do_not_contact,last_outcome", "provider_id", links]
  ] as const) {
    for (let offset = 0; offset <= MAX_CONTACTS; offset += 1000) {
      const { data, error } = await db.from(table).select(columns).eq("tenant_id", tenantId).order(sort, { ascending: true }).range(offset, offset + 999);
      if (error) throw new Error("Lecture des contacts Atlas VSC indisponible");
      rows.push(...(data ?? []));
      if (rows.length > MAX_CONTACTS) throw new Error("La base VSC dépasse la limite de rapprochement de cette version");
      if (!data || data.length < 1000) break;
    }
  }
  return { people, links };
}
async function prepared(tenantId: string) {
  assertTenant(tenantId);
  const source = await readSource(tenantId);
  const target = await targetSnapshot(tenantId);
  const reviewKey = createHash("sha256").update(JSON.stringify({ tenantId, groups: source.groups, lists: source.lists, target })).digest("hex");
  return { ...source, target, reviewKey };
}
export async function previewVscBrevoContactImport(tenantId: string) {
  const data = await prepared(tenantId);
  return {
    summary: { ...data.sourceSummary, existingAtlasContacts: data.target.people.length, existingSourceLinks: data.target.links.length },
    lists: data.lists, reviewKey: data.reviewKey, sendingEnabled: false as const
  };
}
function validReviewKey(value: unknown, expected: string) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value, "hex"), Buffer.from(expected, "hex"));
}
/** RPC helper is also tested against disposable Supabase; payloads are generated server-side only. */
export async function importVscBrevoContactGroups(tenantId: string, actorId: string, groups: VscBrevoImportGroup[]): Promise<VscBrevoImportTotals> {
  assertTenant(tenantId);
  assertVscBrevoImportEnvironment();
  if (!UUID.test(actorId) || !Array.isArray(groups) || groups.length > MAX_CONTACTS) throw new VscBrevoImportInputError("Import VSC invalide");
  const totals: VscBrevoImportTotals = { created: 0, matched: 0, conflicts: 0, withoutCoordinates: 0, sourceContacts: 0, cancelled: 0 };
  const db = createSupabaseServiceRoleClient();
  for (let offset = 0; offset < groups.length; offset += 100) {
    const { data, error } = await db.rpc("vsc_import_brevo_contacts", { p_tenant_id: tenantId, p_actor_id: actorId, p_groups: groups.slice(offset, offset + 100) });
    if (error || !data || Object.keys(totals).some(key => !Number.isSafeInteger(data[key]) || data[key] < 0))
      throw new Error("Import interrompu. Certaines fiches peuvent déjà être importées. Rechargez l’aperçu puis reprenez ; aucun nouvel envoi n’est lancé.");
    for (const key of Object.keys(totals) as (keyof VscBrevoImportTotals)[]) totals[key] += data[key];
  }
  return totals;
}
export async function executeVscBrevoContactImport(tenantId: string, actorId: string, reviewKey: unknown) {
  assertTenant(tenantId);
  if (!UUID.test(actorId) || typeof reviewKey !== "string" || !/^[a-f0-9]{64}$/.test(reviewKey)) throw new VscBrevoImportInputError("Aperçu de rapprochement VSC invalide");
  const data = await prepared(tenantId);
  if (!validReviewKey(reviewKey, data.reviewKey)) throw new VscBrevoImportInputError("La source Brevo ou Atlas a changé. Rechargez et relisez l’aperçu avant l’import.");
  const totals = await importVscBrevoContactGroups(tenantId, actorId, data.groups);
  return { ...totals, sendingEnabled: false as const };
}
