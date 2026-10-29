/** Normalize provider data for review/import; never sends or subscribes a contact. */
export type BrevoContact = { id: number; email?: string; emailBlacklisted?: boolean; smsBlacklisted?: boolean; attributes?: Record<string, unknown>; listIds?: number[]; modifiedAt?: string };
export type VscBrevoImportGroup = {
  person_id: string; source_ids: number[]; display_name: string; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null; city: string | null; postal_code: string | null; department: string | null;
  comments: string | null; email_blocked: boolean; sms_blocked: boolean; do_not_contact: boolean;
  source_lists: number[]; identity_snapshot: { emails: string[]; phones: string[] }; conflict: boolean; modified_at: string | null;
  source_records: VscNormalizedBrevoContact[];
};
export function normalizeVscImportPhone(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : "";
  if (!/^[+0-9 .()\-]+$/.test(raw)) return null;
  const phone = raw.replace(/[ .()\-]/g, "");
  if (/^0[1-9][0-9]{8}$/.test(phone)) return "+33" + phone.slice(1);
  if (/^33[1-9][0-9]{8}$/.test(phone)) return "+" + phone;
  const international = phone.startsWith("00") ? "+" + phone.slice(2) : phone;
  if (/^\+[1-9][0-9]{7,14}$/.test(international)
    && (!international.startsWith("+33") || /^\+33[1-9][0-9]{8}$/.test(international))) return international;
  return null;
}
export function normalizeVscImportEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@<>,;"\\\u0000-\u001f\u007f]+@[^\s@<>,;"\\\u0000-\u001f\u007f]+\.[^\s@<>,;"\\\u0000-\u001f\u007f]+$/.test(email)) return null;
  const [local, domain] = email.split("@");
  if (local.length > 64 || domain.length > 253 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  if (!domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (domain.split(".").at(-1)!.length < 2) return null;
  if (email.endsWith("@mailin-sms.com")) return null; // Brevo's synthetic SMS identifier, not an email address.
  return email;
}
export function isVscFrenchMobile(phone: string | null) { return !!phone && /^\+33[67][0-9]{8}$/.test(phone); }
function text(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const result = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
  return result || null;
}
function first(attributes: Record<string, unknown>, keys: string[]) { return keys.map(key => text(attributes[key])).find(Boolean) ?? null; }
export function normalizeVscBrevoContact(contact: BrevoContact) {
  if (!contact || !Number.isSafeInteger(contact.id) || contact.id <= 0) throw new Error("Identifiant Brevo invalide");
  const a = contact.attributes && typeof contact.attributes === "object" && !Array.isArray(contact.attributes) ? contact.attributes : {};
  const first_name = first(a, ["PRENOM", "FIRSTNAME", "FIRST_NAME"]), last_name = first(a, ["NOM", "LASTNAME", "LAST_NAME"]);
  const company = first(a, ["COMPANY_NAME", "COMPANY", "ENTREPRISE", "SOCIETE"]);
  const email = normalizeVscImportEmail(contact.email);
  const phone = normalizeVscImportPhone(a.SMS);
  const name = (company ?? [first_name, last_name].filter(Boolean).join(" ")) || email || phone || `Contact Brevo ${contact.id}`;
  const postal_code = first(a, ["ZIP_CODE", "CODE_POSTAL", "POSTAL_CODE"]);
  const commentFields = ["COMPANY_NAME", "ADDRESS", "WEBSITE", "SOURCE_URL", "SIRET_NUMBER", "VSC_ORIGINE", "VSC_VAGUE", "VSC_DETAILS"];
  const comments = commentFields.flatMap(key => { const value = text(a[key], 600); return value ? [`${key} : ${value}`] : []; }).join("\n").slice(0, 3000) || null;
  const modified = typeof contact.modifiedAt === "string" && Number.isFinite(Date.parse(contact.modifiedAt)) ? new Date(contact.modifiedAt).toISOString() : null;
  return {
    source_id: contact.id, email, phone, display_name: name.slice(0, 200), first_name, last_name,
    city: first(a, ["CITY", "VILLE"]), postal_code: postal_code?.slice(0, 20) ?? null,
    department: postal_code && /^\d{5}$/.test(postal_code) ? postal_code.slice(0, /^9[78]/.test(postal_code) ? 3 : 2) : null,
    comments, email_blocked: contact.emailBlacklisted !== false, sms_blocked: contact.smsBlacklisted !== false,
    email_status_known: typeof contact.emailBlacklisted === "boolean", sms_status_known: typeof contact.smsBlacklisted === "boolean",
    do_not_contact: [a.DO_NOT_CONTACT, a.NE_PAS_CONTACTER].some(value => value === true || value === 1 || value === "true" || value === "oui" || value === "1"),
    source_lists: [...new Set((Array.isArray(contact.listIds) ? contact.listIds : []).filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b),
    modified_at: modified
  };
}
export type VscNormalizedBrevoContact = ReturnType<typeof normalizeVscBrevoContact>;

/** Connected components make transitive duplicates explicit before choosing a person. */
export function groupVscBrevoContacts(rows: VscNormalizedBrevoContact[], personId: (sourceId: number) => string): VscBrevoImportGroup[] {
  const parents = rows.map((_, index) => index), identities = new Map<string, number>();
  function root(index: number): number { while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; } return index; }
  rows.forEach((row, index) => {
    for (const key of [row.email ? `email:${row.email}` : null, row.phone ? `phone:${row.phone}` : null].filter(Boolean) as string[]) {
      const prior = identities.get(key);
      if (prior === undefined) identities.set(key, index); else parents[root(index)] = root(prior);
    }
  });
  const grouped = new Map<number, VscNormalizedBrevoContact[]>();
  rows.forEach((row, index) => { const key = root(index); const group = grouped.get(key) ?? []; group.push(row); grouped.set(key, group); });
  return [...grouped.values()].map(group => {
    group.sort((a, b) => a.source_id - b.source_id);
    const emails = [...new Set(group.map(row => row.email).filter(Boolean) as string[])].sort();
    const phones = [...new Set(group.map(row => row.phone).filter(Boolean) as string[])].sort();
    const best = [...group].sort((a, b) => (b.comments?.length ?? 0) - (a.comments?.length ?? 0) || a.source_id - b.source_id)[0];
    const modified = group.map(row => row.modified_at).filter(Boolean).sort() as string[];
    return {
      person_id: personId(group[0].source_id), source_ids: group.map(row => row.source_id),
      display_name: best.display_name, first_name: best.first_name, last_name: best.last_name,
      email: emails.length === 1 ? emails[0] : null, phone: phones.length === 1 ? phones[0] : null,
      city: best.city, postal_code: best.postal_code, department: best.department, comments: best.comments,
      email_blocked: group.some(row => row.email_blocked), sms_blocked: group.some(row => row.sms_blocked), do_not_contact: group.some(row => row.do_not_contact),
      source_lists: [...new Set(group.flatMap(row => row.source_lists))].sort((a, b) => a - b),
      identity_snapshot: { emails, phones }, conflict: emails.length > 1 || phones.length > 1,
      modified_at: modified.at(-1) ?? null, source_records: group
    };
  }).sort((a, b) => a.source_ids[0] - b.source_ids[0]);
}
export function summarizeVscBrevoGroups(rows: VscNormalizedBrevoContact[], groups: VscBrevoImportGroup[]) {
  return {
    sourceContacts: rows.length, groupedRecords: groups.length, duplicateRecords: rows.length - groups.length,
    sourceEmailBlocked: rows.filter(row => row.email_blocked).length, sourceSmsBlocked: rows.filter(row => row.sms_blocked).length,
    sourceGlobalBlocked: rows.filter(row => row.do_not_contact).length,
    sourceConflicts: groups.filter(group => group.conflict).length,
    withoutCoordinates: groups.filter(group => !group.email && !group.phone && !group.conflict).length,
    withUsableCoordinates: groups.filter(group => !group.conflict && (group.email || group.phone)).length,
    emailCandidates: groups.filter(group => !group.conflict && group.email && !group.email_blocked && !group.do_not_contact).length,
    smsCandidates: groups.filter(group => !group.conflict && isVscFrenchMobile(group.phone) && !group.sms_blocked && !group.do_not_contact).length,
    nonMobilePhones: groups.filter(group => !group.conflict && group.phone && !isVscFrenchMobile(group.phone)).length
  };
}
