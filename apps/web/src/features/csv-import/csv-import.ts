import { parse } from "csv-parse/sync";
import type { Organization, Person, RelationshipPipelineStage, TenantContext } from "@/types/domain";
import { RECRUITMENT_PIPELINE_STAGES } from "@/features/recruitment-pipeline/options";

export const CSV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_IMPORT_MAX_ROWS = 10_000;

export const CSV_IMPORT_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "city",
  "postal_code",
  "real_estate_network",
  "organization",
  "vat_status",
  "source",
  "comments",
  "owner",
  "pipeline_stage"
] as const;

export type CsvImportField = typeof CSV_IMPORT_FIELDS[number];
export type CsvImportMappingValue = CsvImportField | "ignore";
export type CsvImportMapping = Record<string, CsvImportMappingValue>;
export type CsvImportClassification =
  | "new_contact"
  | "existing_contact_enrichment"
  | "certain_duplicate"
  | "possible_duplicate"
  | "critical_conflict"
  | "rejected_row";

export type CsvImportRequest = {
  content: string;
  mapping?: CsvImportMapping;
};

export type CsvImportPreviewPerson = Pick<Person,
  | "id"
  | "tenant_id"
  | "first_name"
  | "last_name"
  | "display_name"
  | "primary_email"
  | "primary_phone"
  | "city"
  | "postal_code"
  | "source"
  | "comments"
  | "do_not_contact"
>;

export type CsvImportPreviewOrganization = Pick<Organization, "id" | "tenant_id" | "name" | "status">;

export type CsvImportPreviewOwner = {
  userId: string;
  label: string;
  email: string | null;
};

export type CsvImportAtlasData = {
  people: CsvImportPreviewPerson[];
  organizations: CsvImportPreviewOrganization[];
  owners: CsvImportPreviewOwner[];
};

export type CsvImportNormalizedValues = Partial<Record<CsvImportField, string | boolean>>;

export type CsvImportRowPreview = {
  lineNumber: number;
  originalValues: Record<string, string>;
  normalizedValues: CsvImportNormalizedValues;
  mapping: CsvImportMapping;
  classification: CsvImportClassification;
  reason: string;
  existingPersonId: string | null;
  fieldsToEnrich: Record<string, string | boolean>;
  fieldConflicts: Record<string, { existing: string | boolean | null; incoming: string | boolean }>;
  duplicatePersonIds: string[];
  possibleDuplicatePersonIds: string[];
  warnings: string[];
  errors: string[];
};

export type CsvImportSummary = {
  totalRows: number;
  newContacts: number;
  existingContactsToEnrich: number;
  certainDuplicates: number;
  possibleDuplicates: number;
  criticalConflicts: number;
  rejectedRows: number;
};

export type CsvImportPreviewResult = {
  headers: string[];
  proposedMapping: CsvImportMapping;
  unmappedHeaders: string[];
  rows: CsvImportRowPreview[];
  summary: CsvImportSummary;
};

type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

const fieldVariants: Record<CsvImportField, string[]> = {
  first_name: ["prenom", "prénom", "first name", "firstname"],
  last_name: ["nom", "last name", "lastname"],
  email: ["email", "e-mail", "mail", "adresse email"],
  phone: ["telephone", "téléphone", "tel", "mobile", "portable", "phone"],
  city: ["ville", "city"],
  postal_code: ["code postal", "cp", "postal code", "zipcode", "zip"],
  real_estate_network: ["reseau immobilier", "réseau immobilier", "reseau", "réseau", "network"],
  organization: ["organisation", "organization", "agence", "societe", "société"],
  vat_status: ["statut tva", "tva", "vat status"],
  source: ["source", "source du contact", "origine"],
  comments: ["commentaire", "commentaires", "notes", "note"],
  owner: ["proprietaire du contact", "propriétaire du contact", "proprietaire", "propriétaire", "owner", "responsable"],
  pipeline_stage: ["phase de recrutement", "phase", "pipeline stage", "etape", "étape"]
};

const headerVariantToField = new Map(
  CSV_IMPORT_FIELDS.flatMap((field) => fieldVariants[field].map((variant) => [normalizeHeader(variant), field] as const))
);

const pipelineStageLabels: Record<RelationshipPipelineStage, string[]> = {
  detection: ["detection", "détection"],
  qualification: ["qualification"],
  first_contact: ["premier contact", "first contact"],
  conversation: ["conversation", "conversation engagee", "conversation engagée"],
  appointment: ["rendez-vous", "rdv", "appointment"],
  presentation: ["presentation", "présentation"],
  reflection: ["reflexion", "réflexion"],
  negotiation: ["negociation", "négociation"],
  signature: ["signature"],
  onboarding: ["integration", "intégration", "onboarding"],
  development: ["developpement", "développement"],
  ambassador: ["ambassadeur", "ambassador"],
  rejected: ["refus", "rejetee", "rejetée", "rejected"]
};

const stageByLabel = new Map(
  RECRUITMENT_PIPELINE_STAGES.flatMap((stage) => pipelineStageLabels[stage].map((label) => [normalizeComparable(label), stage] as const))
);

function normalizeHeader(value: string) {
  return normalizeComparable(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeComparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

export function normalizeFrenchPhone(value: string) {
  const compact = value.replace(/[\s().-]/g, "");
  if (/^\+33[1-9]\d{8}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^0033[1-9]\d{8}$/.test(compact)) return `0${compact.slice(4)}`;
  if (/^0[1-9]\d{8}$/.test(compact)) return compact;
  return "";
}

export function normalizePostalCode(value: string) {
  const trimmed = value.trim();
  return /^\d{5}$/.test(trimmed) ? trimmed : "";
}

function normalizeBoolean(value: string) {
  const normalized = normalizeComparable(value);
  if (["oui", "yes", "true", "vrai", "actif", "active", "1"].includes(normalized)) return true;
  if (["non", "no", "false", "faux", "inactif", "inactive", "0"].includes(normalized)) return false;
  return null;
}

function parseCsv(content: string): ParsedCsv {
  if (Buffer.byteLength(content, "utf8") > CSV_IMPORT_MAX_BYTES) {
    throw new Error("Le fichier CSV depasse la limite de 5 Mo.");
  }

  const records = parse(content, {
    bom: true,
    delimiter: [",", ";"],
    relax_column_count: false,
    skip_empty_lines: true,
    trim: false
  }) as string[][];

  if (records.length === 0) throw new Error("Le fichier CSV est vide.");
  const headers = records[0].map((header) => header.trim());
  if (headers.length === 0 || headers.every((header) => header === "")) throw new Error("Le fichier CSV ne contient pas d'en-tetes.");
  const seen = new Set<string>();
  for (const header of headers) {
    if (!header) throw new Error("Le fichier CSV contient un en-tete vide.");
    const key = normalizeHeader(header);
    if (seen.has(key)) throw new Error(`L'en-tete "${header}" est duplique.`);
    seen.add(key);
  }

  const dataRows = records.slice(1);
  if (dataRows.length === 0) throw new Error("Le fichier CSV ne contient aucune ligne de donnees.");
  if (dataRows.length > CSV_IMPORT_MAX_ROWS) throw new Error("Le fichier CSV depasse la limite de 10 000 lignes.");

  return {
    headers,
    rows: dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])))
  };
}

export function proposeCsvImportMapping(headers: string[], explicitMapping?: CsvImportMapping): CsvImportMapping {
  const proposed: CsvImportMapping = {};
  const usedFields = new Map<CsvImportField, string>();

  for (const header of headers) {
    const explicit = explicitMapping?.[header];
    const field = explicit ?? headerVariantToField.get(normalizeHeader(header)) ?? "ignore";
    if (field !== "ignore") {
      const previous = usedFields.get(field);
      if (previous) throw new Error(`Les colonnes "${previous}" et "${header}" alimentent toutes les deux le champ Atlas "${field}".`);
      usedFields.set(field, header);
    }
    proposed[header] = field;
  }

  return proposed;
}

function normalizeRow(originalValues: Record<string, string>, mapping: CsvImportMapping) {
  const normalizedValues: CsvImportNormalizedValues = {};
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [header, field] of Object.entries(mapping)) {
    if (field === "ignore") continue;
    const raw = originalValues[header] ?? "";
    const value = raw.trim();
    if (!value) continue;

    if (field === "email") {
      const normalized = normalizeEmail(value);
      if (!normalized) errors.push(`Email invalide: ${value}`);
      else normalizedValues.email = normalized;
    } else if (field === "phone") {
      const normalized = normalizeFrenchPhone(value);
      if (!normalized) errors.push(`Telephone invalide: ${value}`);
      else normalizedValues.phone = normalized;
    } else if (field === "postal_code") {
      const normalized = normalizePostalCode(value);
      if (!normalized) errors.push(`Code postal invalide: ${value}`);
      else normalizedValues.postal_code = normalized;
    } else if (field === "vat_status") {
      const normalized = normalizeBoolean(value);
      if (normalized === null) warnings.push(`Statut TVA non reconnu: ${value}`);
      else {
        normalizedValues.vat_status = normalized;
        warnings.push("Le statut TVA est analyse mais aucun champ Atlas existant ne permet de l'ecrire en V1.");
      }
    } else if (field === "pipeline_stage") {
      const stage = stageByLabel.get(normalizeComparable(value));
      if (!stage) errors.push(`Phase de recrutement inconnue: ${value}`);
      else normalizedValues.pipeline_stage = stage;
    } else if (field === "first_name" || field === "last_name" || field === "city") {
      normalizedValues[field] = value.replace(/\s+/g, " ");
    } else {
      normalizedValues[field] = value;
    }
  }

  return { normalizedValues, errors, warnings };
}

function personEmailKey(person: CsvImportPreviewPerson) {
  return person.primary_email ? normalizeEmail(person.primary_email) : "";
}

function personPhoneKey(person: CsvImportPreviewPerson) {
  return person.primary_phone ? normalizeFrenchPhone(person.primary_phone) : "";
}

function personNameCityKey(values: Pick<CsvImportNormalizedValues, "first_name" | "last_name" | "city">) {
  const firstName = typeof values.first_name === "string" ? normalizeComparable(values.first_name) : "";
  const lastName = typeof values.last_name === "string" ? normalizeComparable(values.last_name) : "";
  const city = typeof values.city === "string" ? normalizeComparable(values.city) : "";
  return firstName && lastName && city ? `${firstName}|${lastName}|${city}` : "";
}

function atlasPersonNameCityKey(person: CsvImportPreviewPerson) {
  return personNameCityKey({
    first_name: person.first_name ?? "",
    last_name: person.last_name ?? "",
    city: person.city ?? ""
  });
}

function collectIndexes(atlas: CsvImportAtlasData) {
  const peopleByEmail = new Map<string, CsvImportPreviewPerson[]>();
  const peopleByPhone = new Map<string, CsvImportPreviewPerson[]>();
  const peopleByNameCity = new Map<string, CsvImportPreviewPerson[]>();
  const organizationsByName = new Map(atlas.organizations.map((organization) => [normalizeComparable(organization.name), organization]));
  const ownersByKey = new Map<string, CsvImportPreviewOwner>();

  for (const owner of atlas.owners) {
    ownersByKey.set(normalizeComparable(owner.userId), owner);
    ownersByKey.set(normalizeComparable(owner.label), owner);
    if (owner.email) ownersByKey.set(normalizeComparable(owner.email), owner);
  }

  for (const person of atlas.people) {
    const email = personEmailKey(person);
    const phone = personPhoneKey(person);
    const nameCity = atlasPersonNameCityKey(person);
    if (email) peopleByEmail.set(email, [...(peopleByEmail.get(email) ?? []), person]);
    if (phone) peopleByPhone.set(phone, [...(peopleByPhone.get(phone) ?? []), person]);
    if (nameCity) peopleByNameCity.set(nameCity, [...(peopleByNameCity.get(nameCity) ?? []), person]);
  }

  return { peopleByEmail, peopleByPhone, peopleByNameCity, organizationsByName, ownersByKey };
}

function enrichmentsFor(person: CsvImportPreviewPerson, values: CsvImportNormalizedValues) {
  const fieldsToEnrich: Record<string, string | boolean> = {};
  const fieldConflicts: Record<string, { existing: string | boolean | null; incoming: string | boolean }> = {};
  const pairs: Array<[keyof CsvImportNormalizedValues, keyof CsvImportPreviewPerson]> = [
    ["first_name", "first_name"],
    ["last_name", "last_name"],
    ["email", "primary_email"],
    ["phone", "primary_phone"],
    ["city", "city"],
    ["postal_code", "postal_code"],
    ["source", "source"],
    ["comments", "comments"]
  ];

  for (const [incomingField, personField] of pairs) {
    const incoming = values[incomingField];
    if (typeof incoming !== "string" || incoming === "") continue;
    const existing = person[personField];
    if (!existing) fieldsToEnrich[incomingField] = incoming;
    else if (normalizeComparable(String(existing)) !== normalizeComparable(incoming)) {
      fieldConflicts[incomingField] = { existing: String(existing), incoming };
    }
  }

  return { fieldsToEnrich, fieldConflicts };
}

function uniquePeople(people: CsvImportPreviewPerson[]) {
  return [...new Map(people.map((person) => [person.id, person])).values()];
}

export function previewCsvImport(request: CsvImportRequest, atlas: CsvImportAtlasData, context?: Pick<TenantContext, "tenantId">): CsvImportPreviewResult {
  const parsed = parseCsv(request.content);
  const proposedMapping = proposeCsvImportMapping(parsed.headers, request.mapping);
  const unmappedHeaders = parsed.headers.filter((header) => proposedMapping[header] === "ignore");
  const indexes = collectIndexes(atlas);

  if (context) {
    const outOfTenant = atlas.people.some((person) => person.tenant_id !== context.tenantId) || atlas.organizations.some((organization) => organization.tenant_id !== context.tenantId);
    if (outOfTenant) throw new Error("Les donnees de comparaison ne respectent pas le tenant actif.");
  }

  const normalizedRows = parsed.rows.map((originalValues, index) => ({
    lineNumber: index + 2,
    originalValues,
    ...normalizeRow(originalValues, proposedMapping)
  }));

  const internalEmailCounts = countKeys(normalizedRows.map((row) => typeof row.normalizedValues.email === "string" ? row.normalizedValues.email : ""));
  const internalPhoneCounts = countKeys(normalizedRows.map((row) => typeof row.normalizedValues.phone === "string" ? row.normalizedValues.phone : ""));
  const internalNameCounts = countKeys(normalizedRows.map((row) => personNameCityKey(row.normalizedValues)));

  const rows = normalizedRows.map((row): CsvImportRowPreview => {
    const warnings = [...row.warnings];
    const errors = [...row.errors];
    const values = row.normalizedValues;
    const emailMatches = typeof values.email === "string" ? indexes.peopleByEmail.get(values.email) ?? [] : [];
    const phoneMatches = typeof values.phone === "string" ? indexes.peopleByPhone.get(values.phone) ?? [] : [];
    const possibleMatches = indexes.peopleByNameCity.get(personNameCityKey(values)) ?? [];
    const duplicateMatches = uniquePeople([...emailMatches, ...phoneMatches]);
    const possibleDuplicateMatches = uniquePeople(possibleMatches.filter((person) => !duplicateMatches.some((duplicate) => duplicate.id === person.id)));

    const emailPersonIds = new Set(emailMatches.map((person) => person.id));
    const phonePersonIds = new Set(phoneMatches.map((person) => person.id));
    const emailPhoneConflict = emailPersonIds.size > 0 && phonePersonIds.size > 0 && [...emailPersonIds].some((id) => !phonePersonIds.has(id));
    const internalCertain = hasDuplicate(internalEmailCounts, values.email) || hasDuplicate(internalPhoneCounts, values.phone);
    const internalPossible = hasDuplicate(internalNameCounts, personNameCityKey(values));

    if (typeof values.organization === "string" && values.organization && !indexes.organizationsByName.has(normalizeComparable(values.organization))) {
      warnings.push(`Organisation inconnue dans le tenant: ${values.organization}`);
    }
    if (typeof values.real_estate_network === "string" && values.real_estate_network && !indexes.organizationsByName.has(normalizeComparable(values.real_estate_network))) {
      warnings.push(`Reseau immobilier inconnu dans le tenant: ${values.real_estate_network}`);
    }
    if (typeof values.owner === "string" && values.owner && !indexes.ownersByKey.has(normalizeComparable(values.owner))) {
      warnings.push(`Proprietaire du contact inconnu dans le tenant: ${values.owner}`);
    }

    let classification: CsvImportClassification = "new_contact";
    let reason = "Aucun doublon detecte.";
    let existingPerson: CsvImportPreviewPerson | null = duplicateMatches.length === 1 ? duplicateMatches[0] : null;

    if (errors.length > 0) {
      classification = "rejected_row";
      reason = "La ligne contient des erreurs bloquantes.";
      existingPerson = null;
    } else if (emailPhoneConflict || duplicateMatches.length > 1) {
      classification = "critical_conflict";
      reason = "L'email et le telephone correspondent a des personnes differentes ou plusieurs correspondances existent.";
      existingPerson = null;
    } else if (internalCertain || emailMatches.length > 0 || phoneMatches.length > 0) {
      classification = duplicateMatches.length === 1 ? "existing_contact_enrichment" : "certain_duplicate";
      reason = duplicateMatches.length === 1 ? "Contact existant trouve par email ou telephone." : "Doublon certain detecte par email ou telephone.";
    } else if (internalPossible || possibleDuplicateMatches.length > 0) {
      classification = "possible_duplicate";
      reason = "Doublon possible detecte par prenom, nom et ville.";
    }

    const enrichment = existingPerson ? enrichmentsFor(existingPerson, values) : { fieldsToEnrich: {}, fieldConflicts: {} };
    if (existingPerson?.do_not_contact) warnings.push("Le contact existant est marque Ne plus contacter et ne doit pas etre reactive automatiquement.");
    if (classification === "existing_contact_enrichment" && Object.keys(enrichment.fieldConflicts).length > 0 && Object.keys(enrichment.fieldsToEnrich).length === 0) {
      classification = "certain_duplicate";
      reason = "Contact existant detecte, mais aucune donnee vide ne peut etre completee automatiquement.";
    }

    return {
      lineNumber: row.lineNumber,
      originalValues: row.originalValues,
      normalizedValues: values,
      mapping: proposedMapping,
      classification,
      reason,
      existingPersonId: existingPerson?.id ?? null,
      fieldsToEnrich: enrichment.fieldsToEnrich,
      fieldConflicts: enrichment.fieldConflicts,
      duplicatePersonIds: duplicateMatches.map((person) => person.id),
      possibleDuplicatePersonIds: possibleDuplicateMatches.map((person) => person.id),
      warnings,
      errors
    };
  });

  return { headers: parsed.headers, proposedMapping, unmappedHeaders, rows, summary: summarizeRows(rows) };
}

function countKeys(keys: string[]) {
  const counts = new Map<string, number>();
  for (const key of keys.filter(Boolean)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

function hasDuplicate(counts: Map<string, number>, value: unknown) {
  return typeof value === "string" && value !== "" && (counts.get(value) ?? 0) > 1;
}

function summarizeRows(rows: CsvImportRowPreview[]): CsvImportSummary {
  return {
    totalRows: rows.length,
    newContacts: rows.filter((row) => row.classification === "new_contact").length,
    existingContactsToEnrich: rows.filter((row) => row.classification === "existing_contact_enrichment").length,
    certainDuplicates: rows.filter((row) => row.classification === "certain_duplicate").length,
    possibleDuplicates: rows.filter((row) => row.classification === "possible_duplicate").length,
    criticalConflicts: rows.filter((row) => row.classification === "critical_conflict").length,
    rejectedRows: rows.filter((row) => row.classification === "rejected_row").length
  };
}
