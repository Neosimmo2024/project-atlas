export const acceptedCsvColumns = [
  "Prenom",
  "Nom",
  "Telephone",
  "Email",
  "Ville",
  "Code postal",
  "Entreprise",
  "Fonction",
  "Source",
  "Commentaires"
] as const;

export type AcceptedCsvColumn = (typeof acceptedCsvColumns)[number];
export type CsvPersonRow = Partial<Record<AcceptedCsvColumn, string>>;

export function buildDeduplicationKeys(row: CsvPersonRow) {
  const email = normalize(row.Email);
  const phone = normalizePhone(row.Telephone);
  const identity = [row.Prenom, row.Nom, row.Ville].map(normalize).join("|");
  return { email: email || null, phone: phone || null, identity: identity === "||" ? null : identity };
}

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhone(value: string | undefined) {
  return value?.replace(/[^\d+]/g, "") ?? "";
}
