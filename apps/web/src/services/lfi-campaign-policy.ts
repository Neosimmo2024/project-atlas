export const LFI_PROJECT_ID = "df6dce4c-f4dd-41b3-b1e2-1e9fd924c4dc";
const departments = new Set(["75", "77", "78", "91", "92", "93", "94", "95"]);
export function eligibleLfiContact(person: { primary_email?: string | null; postal_code?: string | null; contact_allowed: boolean; do_not_contact: boolean; status: string }) {
  return person.contact_allowed && !person.do_not_contact && !["archived", "rejected"].includes(person.status)
    && departments.has(person.postal_code?.slice(0, 2) ?? "")
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.primary_email?.trim() ?? "");
}
export function escapeEmailHtml(text: string) {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}
export function validUnsubscribeToken(token: string) { return /^[a-f0-9]{64}$/.test(token); }

export function isRealEstateContact(person: {job_title?:string|null;talent_types?:string[]|null}) {
 return /immobili|mandataire|transaction/i.test(person.job_title ?? "") || (person.talent_types ?? []).some(type => /mandataires|agences traditionnelles|collaborateurs d.agence/i.test(type));
}
