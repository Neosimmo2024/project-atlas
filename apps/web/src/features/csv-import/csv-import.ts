import { parse } from "csv-parse/sync";
import type { Organization, OrganizationVatStatus, Person, RelationshipPipelineStage, TenantContext } from "@/types/domain";
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
  "organization_siren",
  "organization_siret",
  "organization_email",
  "organization_phone",
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

export type CsvImportDecision = "create_new" | "link_existing" | "ignore_row" | "review_later";
export type CsvImportMatchEntity = "person" | "organization" | "import_row";
export type CsvImportMatchKind = "internal_duplicate" | "atlas_existing";
export type CsvImportMatchStrength = "certain" | "possible" | "ambiguous";

export type CsvImportMatch = {
  entityType: CsvImportMatchEntity;
  kind: CsvImportMatchKind;
  strength: CsvImportMatchStrength;
  entityId: string | null;
  lineNumber: number | null;
  reasons: string[];
  fields: string[];
  differences: string[];
  explanation: string;
};

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

export type CsvImportPreviewOrganization = Pick<Organization,
  | "id"
  | "tenant_id"
  | "name"
  | "siren"
  | "siret"
  | "primary_email"
  | "primary_phone"
  | "city"
  | "postal_code"
  | "status"
  | "vat_status"
  | "do_not_contact"
>;

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

export type CsvImportNormalizedValues = Partial<Record<CsvImportField, string>>;

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
  matches: CsvImportMatch[];
  organizationMatches: CsvImportMatch[];
  recommendedDecision: CsvImportDecision;
  decisionRequired: boolean;
  duplicatePersonIds: string[];
  possibleDuplicatePersonIds: string[];
  duplicateOrganizationIds: string[];
  possibleDuplicateOrganizationIds: string[];
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
  cleanRows: number;
  internalDuplicates: number;
  atlasMatches: number;
  ambiguousRows: number;
  pendingDecisions: number;
};

export type CsvImportPreviewResult = {
  headers: string[];
  proposedMapping: CsvImportMapping;
  unmappedHeaders: string[];
  rows: CsvImportRowPreview[];
  summary: CsvImportSummary;
  analysisFingerprint: string;
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
  organization_siren: ["siren", "siren organisation", "siren societe", "siren société"],
  organization_siret: ["siret", "siret organisation", "siret societe", "siret société"],
  organization_email: ["email organisation", "e-mail organisation", "mail organisation", "email agence"],
  organization_phone: ["telephone organisation", "téléphone organisation", "tel organisation", "telephone agence"],
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

export function normalizeBusinessIdentifier(value: string, expectedLength: 9 | 14) {
  const digits = value.replace(/\D/g, "");
  return digits.length === expectedLength ? digits : "";
}

export function normalizeVatStatus(value: string): { status: OrganizationVatStatus | null; warning: string | null } {
  const normalized = normalizeComparable(value);
  if (!normalized) return { status: null, warning: null };
  const compact = normalized.replace(/[_\-\s]+/g, " ");

  if (["assujetti", "assujettie", "oui", "yes", "true", "vrai", "actif", "active", "1"].includes(compact)) {
    return { status: "assujetti", warning: null };
  }
  if (["non assujetti", "non assujettie", "non", "no", "false", "faux", "inactif", "inactive", "0"].includes(compact)) {
    return { status: "non_assujetti", warning: null };
  }
  if (["a verifier", "a verifier plus tard", "verifier", "a controler", "a confirmer"].includes(compact)) {
    return { status: "a_verifier", warning: null };
  }

  return {
    status: "a_verifier",
    warning: `Statut TVA non reconnu: ${value}. Atlas le classe en À vérifier sans bloquer l'import.`
  };
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
  if (dataRows.length === 0) throw new Error("Le fichier CSV ne contient aucune ligne de données.");
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
      if (!normalized) errors.push(`Téléphone invalide: ${value}`);
      else normalizedValues.phone = normalized;
    } else if (field === "postal_code") {
      const normalized = normalizePostalCode(value);
      if (!normalized) errors.push(`Code postal invalide: ${value}`);
      else normalizedValues.postal_code = normalized;
    } else if (field === "organization_siren") {
      const normalized = normalizeBusinessIdentifier(value, 9);
      if (!normalized) errors.push(`SIREN invalide: ${value}`);
      else normalizedValues.organization_siren = normalized;
    } else if (field === "organization_siret") {
      const normalized = normalizeBusinessIdentifier(value, 14);
      if (!normalized) errors.push(`SIRET invalide: ${value}`);
      else normalizedValues.organization_siret = normalized;
    } else if (field === "organization_email") {
      const normalized = normalizeEmail(value);
      if (!normalized) errors.push(`Email organisation invalide: ${value}`);
      else normalizedValues.organization_email = normalized;
    } else if (field === "organization_phone") {
      const normalized = normalizeFrenchPhone(value);
      if (!normalized) errors.push(`Téléphone organisation invalide: ${value}`);
      else normalizedValues.organization_phone = normalized;
    } else if (field === "vat_status") {
      const normalized = normalizeVatStatus(value);
      if (normalized.status) normalizedValues.vat_status = normalized.status;
      if (normalized.warning) warnings.push(normalized.warning);
    } else if (field === "pipeline_stage") {
      const stage = stageByLabel.get(normalizeComparable(value));
      if (!stage) errors.push(`Phase de recrutement inconnue: ${value}`);
      else normalizedValues.pipeline_stage = stage;
    } else if (field === "first_name" || field === "last_name" || field === "city" || field === "organization") {
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

function organizationSirenKey(organization: CsvImportPreviewOrganization) {
  return organization.siren ? normalizeBusinessIdentifier(organization.siren, 9) : "";
}

function organizationSiretKey(organization: CsvImportPreviewOrganization) {
  return organization.siret ? normalizeBusinessIdentifier(organization.siret, 14) : "";
}

function organizationEmailKey(organization: CsvImportPreviewOrganization) {
  return organization.primary_email ? normalizeEmail(organization.primary_email) : "";
}

function organizationPhoneKey(organization: CsvImportPreviewOrganization) {
  return organization.primary_phone ? normalizeFrenchPhone(organization.primary_phone) : "";
}

function organizationNameCityKey(values: Pick<CsvImportNormalizedValues, "organization" | "city">) {
  const name = typeof values.organization === "string" ? normalizeComparable(values.organization) : "";
  const city = typeof values.city === "string" ? normalizeComparable(values.city) : "";
  return name && city ? `${name}|${city}` : "";
}

function organizationNamePostalCodeKey(values: Pick<CsvImportNormalizedValues, "organization" | "postal_code">) {
  const name = typeof values.organization === "string" ? normalizeComparable(values.organization) : "";
  const postalCode = typeof values.postal_code === "string" ? normalizeComparable(values.postal_code) : "";
  return name && postalCode ? `${name}|${postalCode}` : "";
}

function atlasOrganizationNameCityKey(organization: CsvImportPreviewOrganization) {
  return organizationNameCityKey({ organization: organization.name, city: organization.city ?? "" });
}

function atlasOrganizationNamePostalCodeKey(organization: CsvImportPreviewOrganization) {
  return organizationNamePostalCodeKey({ organization: organization.name, postal_code: organization.postal_code ?? "" });
}

function collectIndexes(atlas: CsvImportAtlasData) {
  const peopleByEmail = new Map<string, CsvImportPreviewPerson[]>();
  const peopleByPhone = new Map<string, CsvImportPreviewPerson[]>();
  const peopleByNameCity = new Map<string, CsvImportPreviewPerson[]>();
  const organizationsByName = new Map(atlas.organizations.map((organization) => [normalizeComparable(organization.name), organization]));
  const organizationsBySiren = new Map<string, CsvImportPreviewOrganization[]>();
  const organizationsBySiret = new Map<string, CsvImportPreviewOrganization[]>();
  const organizationsByEmail = new Map<string, CsvImportPreviewOrganization[]>();
  const organizationsByPhone = new Map<string, CsvImportPreviewOrganization[]>();
  const organizationsByNameCity = new Map<string, CsvImportPreviewOrganization[]>();
  const organizationsByNamePostalCode = new Map<string, CsvImportPreviewOrganization[]>();
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

  for (const organization of atlas.organizations) {
    const siren = organizationSirenKey(organization);
    const siret = organizationSiretKey(organization);
    const email = organizationEmailKey(organization);
    const phone = organizationPhoneKey(organization);
    const nameCity = atlasOrganizationNameCityKey(organization);
    const namePostalCode = atlasOrganizationNamePostalCodeKey(organization);
    if (siren) organizationsBySiren.set(siren, [...(organizationsBySiren.get(siren) ?? []), organization]);
    if (siret) organizationsBySiret.set(siret, [...(organizationsBySiret.get(siret) ?? []), organization]);
    if (email) organizationsByEmail.set(email, [...(organizationsByEmail.get(email) ?? []), organization]);
    if (phone) organizationsByPhone.set(phone, [...(organizationsByPhone.get(phone) ?? []), organization]);
    if (nameCity) organizationsByNameCity.set(nameCity, [...(organizationsByNameCity.get(nameCity) ?? []), organization]);
    if (namePostalCode) organizationsByNamePostalCode.set(namePostalCode, [...(organizationsByNamePostalCode.get(namePostalCode) ?? []), organization]);
  }

  return {
    peopleByEmail,
    peopleByPhone,
    peopleByNameCity,
    organizationsByName,
    organizationsBySiren,
    organizationsBySiret,
    organizationsByEmail,
    organizationsByPhone,
    organizationsByNameCity,
    organizationsByNamePostalCode,
    ownersByKey
  };
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

function uniqueOrganizations(organizations: CsvImportPreviewOrganization[]) {
  return [...new Map(organizations.map((organization) => [organization.id, organization])).values()];
}

function collectLineNumbers(rows: Array<{ lineNumber: number; normalizedValues: CsvImportNormalizedValues }>, keyFor: (values: CsvImportNormalizedValues) => string) {
  const lineNumbers = new Map<string, number[]>();
  for (const row of rows) {
    const key = keyFor(row.normalizedValues);
    if (key) lineNumbers.set(key, [...(lineNumbers.get(key) ?? []), row.lineNumber]);
  }
  return lineNumbers;
}

function otherLines(lineNumbers: Map<string, number[]>, key: string, currentLine: number) {
  return (lineNumbers.get(key) ?? []).filter((lineNumber) => lineNumber !== currentLine);
}

function pushInternalMatch(matches: CsvImportMatch[], lineNumber: number, reasons: string[], fields: string[], explanation: string, strength: CsvImportMatchStrength = "certain") {
  matches.push({
    entityType: "import_row",
    kind: "internal_duplicate",
    strength,
    entityId: null,
    lineNumber,
    reasons,
    fields,
    differences: [],
    explanation
  });
}

function personDifferences(person: CsvImportPreviewPerson, values: CsvImportNormalizedValues) {
  const differences: string[] = [];
  const comparisons: Array<[keyof CsvImportNormalizedValues, keyof CsvImportPreviewPerson, string]> = [
    ["first_name", "first_name", "prénom"],
    ["last_name", "last_name", "nom"],
    ["email", "primary_email", "email"],
    ["phone", "primary_phone", "téléphone"],
    ["city", "city", "ville"],
    ["postal_code", "postal_code", "code postal"]
  ];

  for (const [incomingField, personField, label] of comparisons) {
    const incoming = values[incomingField];
    const existing = person[personField];
    if (typeof incoming === "string" && incoming && existing && normalizeComparable(String(existing)) !== normalizeComparable(incoming)) {
      differences.push(`${label}: Atlas "${String(existing)}" / fichier "${incoming}"`);
    }
  }

  return differences;
}

function organizationDifferences(organization: CsvImportPreviewOrganization, values: CsvImportNormalizedValues) {
  const differences: string[] = [];
  const comparisons: Array<[keyof CsvImportNormalizedValues, keyof CsvImportPreviewOrganization, string]> = [
    ["organization", "name", "nom"],
    ["organization_siren", "siren", "SIREN"],
    ["organization_siret", "siret", "SIRET"],
    ["organization_email", "primary_email", "email"],
    ["organization_phone", "primary_phone", "téléphone"],
    ["city", "city", "ville"],
    ["postal_code", "postal_code", "code postal"]
  ];

  for (const [incomingField, organizationField, label] of comparisons) {
    const incoming = values[incomingField];
    const existing = organization[organizationField];
    if (typeof incoming === "string" && incoming && existing && normalizeComparable(String(existing)) !== normalizeComparable(incoming)) {
      differences.push(`${label}: Atlas "${String(existing)}" / fichier "${incoming}"`);
    }
  }

  return differences;
}

function atlasPersonMatches(people: CsvImportPreviewPerson[], values: CsvImportNormalizedValues, reasonsFor: (person: CsvImportPreviewPerson) => string[], strength: CsvImportMatchStrength): CsvImportMatch[] {
  return people.map((person) => {
    const reasons = reasonsFor(person);
    const fields = reasons.map((reason) => reason === "identity" ? "prénom + nom + ville" : reason);

    return {
      entityType: "person",
      kind: "atlas_existing",
      strength,
      entityId: person.id,
      lineNumber: null,
      reasons,
      fields,
      differences: personDifferences(person, values),
      explanation: strength === "certain"
        ? `Personne Atlas rapprochee par ${fields.join(", ")}.`
        : `Personne Atlas potentiellement similaire par ${fields.join(", ")}.`
    };
  });
}

function atlasOrganizationMatches(organizations: CsvImportPreviewOrganization[], values: CsvImportNormalizedValues, reasonsFor: (organization: CsvImportPreviewOrganization) => string[], strength: CsvImportMatchStrength): CsvImportMatch[] {
  return organizations.map((organization) => {
    const reasons = reasonsFor(organization);
    const fields = reasons.map((reason) => reason.replaceAll("_", " + "));

    return {
      entityType: "organization",
      kind: "atlas_existing",
      strength,
      entityId: organization.id,
      lineNumber: null,
      reasons,
      fields,
      differences: organizationDifferences(organization, values),
      explanation: strength === "certain"
        ? `Organisation Atlas rapprochee par ${fields.join(", ")}.`
        : `Organisation Atlas potentiellement similaire par ${fields.join(", ")}.`
    };
  });
}

function personMatchReasons(person: CsvImportPreviewPerson, emailMatches: CsvImportPreviewPerson[], phoneMatches: CsvImportPreviewPerson[], possibleMatches: CsvImportPreviewPerson[]) {
  const reasons: string[] = [];
  if (emailMatches.some((match) => match.id === person.id)) reasons.push("email");
  if (phoneMatches.some((match) => match.id === person.id)) reasons.push("phone");
  if (possibleMatches.some((match) => match.id === person.id)) reasons.push("identity");
  return reasons;
}

function organizationMatchReasons(
  organization: CsvImportPreviewOrganization,
  matches: {
    siren: CsvImportPreviewOrganization[];
    siret: CsvImportPreviewOrganization[];
    email: CsvImportPreviewOrganization[];
    phone: CsvImportPreviewOrganization[];
    nameCity: CsvImportPreviewOrganization[];
    namePostalCode: CsvImportPreviewOrganization[];
  }
) {
  const reasons: string[] = [];
  if (matches.siren.some((match) => match.id === organization.id)) reasons.push("siren");
  if (matches.siret.some((match) => match.id === organization.id)) reasons.push("siret");
  if (matches.email.some((match) => match.id === organization.id)) reasons.push("email");
  if (matches.phone.some((match) => match.id === organization.id)) reasons.push("phone");
  if (matches.nameCity.some((match) => match.id === organization.id)) reasons.push("name_city");
  if (matches.namePostalCode.some((match) => match.id === organization.id)) reasons.push("name_postal_code");
  return reasons;
}

function chooseDecision(classification: CsvImportClassification, existingPersonId: string | null): { recommendedDecision: CsvImportDecision; decisionRequired: boolean } {
  if (classification === "new_contact") return { recommendedDecision: "create_new", decisionRequired: false };
  if (classification === "existing_contact_enrichment" && existingPersonId) return { recommendedDecision: "link_existing", decisionRequired: true };
  if (classification === "rejected_row") return { recommendedDecision: "ignore_row", decisionRequired: true };
  return { recommendedDecision: "review_later", decisionRequired: true };
}

export type CsvImportPreparedDecision = {
  lineNumber: number;
  decision: CsvImportDecision | "";
  targetPersonId?: string | null;
  targetOrganizationId?: string | null;
};

export type CsvImportDecisionValidation = {
  valid: boolean;
  errors: string[];
  pendingDecisions: number;
};

export function validateCsvImportDecisions(preview: CsvImportPreviewResult, decisions: CsvImportPreparedDecision[], analysisFingerprint: string): CsvImportDecisionValidation {
  const errors: string[] = [];
  const decisionsByLine = new Map(decisions.map((decision) => [decision.lineNumber, decision]));

  if (analysisFingerprint !== preview.analysisFingerprint) {
    errors.push("La correspondance des colonnes a changé. Relancez la vérification avant de poursuivre.");
  }

  let pendingDecisions = 0;
  for (const row of preview.rows) {
    const decision = decisionsByLine.get(row.lineNumber);
    if (row.decisionRequired && (!decision || !decision.decision)) {
      pendingDecisions += 1;
      errors.push(`Ligne ${row.lineNumber}: une décision est obligatoire.`);
      continue;
    }
    if (row.classification === "critical_conflict" && decision?.decision !== "review_later" && decision?.decision !== "ignore_row") {
      errors.push(`Ligne ${row.lineNumber}: le conflit doit rester à examiner ou être ignoré.`);
    }
    if (row.classification === "rejected_row" && decision?.decision !== "ignore_row") {
      errors.push(`Ligne ${row.lineNumber}: une ligne invalide ne peut pas être importée.`);
    }
    if (decision?.decision === "link_existing") {
      const allowedPersonIds = new Set([row.existingPersonId, ...row.duplicatePersonIds, ...row.possibleDuplicatePersonIds].filter(Boolean));
      const allowedOrganizationIds = new Set([...row.duplicateOrganizationIds, ...row.possibleDuplicateOrganizationIds]);
      if (decision.targetPersonId && !allowedPersonIds.has(decision.targetPersonId)) {
        errors.push(`Ligne ${row.lineNumber}: la personne cible n'est pas accessible dans cette analyse.`);
      }
      if (decision.targetOrganizationId && !allowedOrganizationIds.has(decision.targetOrganizationId)) {
        errors.push(`Ligne ${row.lineNumber}: l'organisation cible n'est pas accessible dans cette analyse.`);
      }
      if (!decision.targetPersonId && !decision.targetOrganizationId) {
        errors.push(`Ligne ${row.lineNumber}: choisissez un enregistrement Atlas accessible à rattacher.`);
      }
    }
  }

  return { valid: errors.length === 0, errors, pendingDecisions };
}

export function previewCsvImport(request: CsvImportRequest, atlas: CsvImportAtlasData, context?: Pick<TenantContext, "tenantId">): CsvImportPreviewResult {
  const parsed = parseCsv(request.content);
  const proposedMapping = proposeCsvImportMapping(parsed.headers, request.mapping);
  const unmappedHeaders = parsed.headers.filter((header) => proposedMapping[header] === "ignore");
  const indexes = collectIndexes(atlas);

  if (context) {
    const outOfTenant = atlas.people.some((person) => person.tenant_id !== context.tenantId) || atlas.organizations.some((organization) => organization.tenant_id !== context.tenantId);
    if (outOfTenant) throw new Error("Les données de comparaison ne respectent pas le tenant actif.");
  }

  const normalizedRows = parsed.rows.map((originalValues, index) => ({
    lineNumber: index + 2,
    originalValues,
    ...normalizeRow(originalValues, proposedMapping)
  }));

  const internalEmailCounts = countKeys(normalizedRows.map((row) => typeof row.normalizedValues.email === "string" ? row.normalizedValues.email : ""));
  const internalPhoneCounts = countKeys(normalizedRows.map((row) => typeof row.normalizedValues.phone === "string" ? row.normalizedValues.phone : ""));
  const internalNameCounts = countKeys(normalizedRows.map((row) => personNameCityKey(row.normalizedValues)));
  const internalEmailLines = collectLineNumbers(normalizedRows, (values) => typeof values.email === "string" ? values.email : "");
  const internalPhoneLines = collectLineNumbers(normalizedRows, (values) => typeof values.phone === "string" ? values.phone : "");
  const internalNameLines = collectLineNumbers(normalizedRows, personNameCityKey);
  const internalSirenCounts = countKeys(normalizedRows.map((row) => typeof row.normalizedValues.organization_siren === "string" ? row.normalizedValues.organization_siren : ""));
  const internalSiretCounts = countKeys(normalizedRows.map((row) => typeof row.normalizedValues.organization_siret === "string" ? row.normalizedValues.organization_siret : ""));
  const internalOrganizationEmailCounts = countKeys(normalizedRows.map((row) => typeof row.normalizedValues.organization_email === "string" ? row.normalizedValues.organization_email : ""));
  const internalOrganizationPhoneCounts = countKeys(normalizedRows.map((row) => typeof row.normalizedValues.organization_phone === "string" ? row.normalizedValues.organization_phone : ""));
  const internalOrganizationNameCityCounts = countKeys(normalizedRows.map((row) => organizationNameCityKey(row.normalizedValues)));
  const internalOrganizationNamePostalCounts = countKeys(normalizedRows.map((row) => organizationNamePostalCodeKey(row.normalizedValues)));
  const internalSirenLines = collectLineNumbers(normalizedRows, (values) => typeof values.organization_siren === "string" ? values.organization_siren : "");
  const internalSiretLines = collectLineNumbers(normalizedRows, (values) => typeof values.organization_siret === "string" ? values.organization_siret : "");
  const internalOrganizationEmailLines = collectLineNumbers(normalizedRows, (values) => typeof values.organization_email === "string" ? values.organization_email : "");
  const internalOrganizationPhoneLines = collectLineNumbers(normalizedRows, (values) => typeof values.organization_phone === "string" ? values.organization_phone : "");
  const internalOrganizationNameCityLines = collectLineNumbers(normalizedRows, organizationNameCityKey);
  const internalOrganizationNamePostalLines = collectLineNumbers(normalizedRows, organizationNamePostalCodeKey);

  const rows = normalizedRows.map((row): CsvImportRowPreview => {
    const warnings = [...row.warnings];
    const errors = [...row.errors];
    const values = row.normalizedValues;
    const emailMatches = typeof values.email === "string" ? indexes.peopleByEmail.get(values.email) ?? [] : [];
    const phoneMatches = typeof values.phone === "string" ? indexes.peopleByPhone.get(values.phone) ?? [] : [];
    const possibleMatches = indexes.peopleByNameCity.get(personNameCityKey(values)) ?? [];
    const duplicateMatches = uniquePeople([...emailMatches, ...phoneMatches]);
    const possibleDuplicateMatches = uniquePeople(possibleMatches.filter((person) => !duplicateMatches.some((duplicate) => duplicate.id === person.id)));
    const matches: CsvImportMatch[] = [];
    const organizationMatches: CsvImportMatch[] = [];

    const emailPersonIds = new Set(emailMatches.map((person) => person.id));
    const phonePersonIds = new Set(phoneMatches.map((person) => person.id));
    const emailPhoneConflict = emailPersonIds.size > 0 && phonePersonIds.size > 0 && [...emailPersonIds].some((id) => !phonePersonIds.has(id));
    const internalCertain = hasDuplicate(internalEmailCounts, values.email) || hasDuplicate(internalPhoneCounts, values.phone);
    const internalPossible = hasDuplicate(internalNameCounts, personNameCityKey(values));
    const email = typeof values.email === "string" ? values.email : "";
    const phone = typeof values.phone === "string" ? values.phone : "";
    const personIdentity = personNameCityKey(values);
    for (const lineNumber of otherLines(internalEmailLines, email, row.lineNumber)) {
      pushInternalMatch(matches, lineNumber, ["email"], ["email"], "Une autre ligne du fichier utilise le même e-mail.");
    }
    for (const lineNumber of otherLines(internalPhoneLines, phone, row.lineNumber)) {
      pushInternalMatch(matches, lineNumber, ["phone"], ["téléphone"], "Une autre ligne du fichier utilise le même téléphone.");
    }
    for (const lineNumber of otherLines(internalNameLines, personIdentity, row.lineNumber)) {
      pushInternalMatch(matches, lineNumber, ["identity"], ["prénom + nom + ville"], "Une autre ligne du fichier partage le même prénom, nom et ville.", "possible");
    }
    matches.push(...atlasPersonMatches(
      duplicateMatches,
      values,
      (person) => personMatchReasons(person, emailMatches, phoneMatches, possibleMatches),
      duplicateMatches.length > 1 ? "ambiguous" : "certain"
    ));
    matches.push(...atlasPersonMatches(
      possibleDuplicateMatches,
      values,
      (person) => personMatchReasons(person, emailMatches, phoneMatches, possibleMatches),
      "possible"
    ));

    const siren = typeof values.organization_siren === "string" ? values.organization_siren : "";
    const siret = typeof values.organization_siret === "string" ? values.organization_siret : "";
    const organizationEmail = typeof values.organization_email === "string" ? values.organization_email : "";
    const organizationPhone = typeof values.organization_phone === "string" ? values.organization_phone : "";
    const organizationNameCity = organizationNameCityKey(values);
    const organizationNamePostal = organizationNamePostalCodeKey(values);
    for (const lineNumber of otherLines(internalSirenLines, siren, row.lineNumber)) {
      pushInternalMatch(organizationMatches, lineNumber, ["siren"], ["SIREN"], "Une autre ligne du fichier utilise le même SIREN.");
    }
    for (const lineNumber of otherLines(internalSiretLines, siret, row.lineNumber)) {
      pushInternalMatch(organizationMatches, lineNumber, ["siret"], ["SIRET"], "Une autre ligne du fichier utilise le même SIRET.");
    }
    for (const lineNumber of otherLines(internalOrganizationEmailLines, organizationEmail, row.lineNumber)) {
      pushInternalMatch(organizationMatches, lineNumber, ["email"], ["email organisation"], "Une autre ligne du fichier utilise le même e-mail d'organisation.");
    }
    for (const lineNumber of otherLines(internalOrganizationPhoneLines, organizationPhone, row.lineNumber)) {
      pushInternalMatch(organizationMatches, lineNumber, ["phone"], ["téléphone organisation"], "Une autre ligne du fichier utilise le même téléphone d'organisation.");
    }
    for (const lineNumber of otherLines(internalOrganizationNameCityLines, organizationNameCity, row.lineNumber)) {
      pushInternalMatch(organizationMatches, lineNumber, ["name_city"], ["nom + ville"], "Une autre ligne du fichier partage le même nom d'organisation et la même ville.", "possible");
    }
    for (const lineNumber of otherLines(internalOrganizationNamePostalLines, organizationNamePostal, row.lineNumber)) {
      pushInternalMatch(organizationMatches, lineNumber, ["name_postal_code"], ["nom + code postal"], "Une autre ligne du fichier partage le même nom d'organisation et le même code postal.", "possible");
    }

    const organizationMatchesByCriterion = {
      siren: siren ? indexes.organizationsBySiren.get(siren) ?? [] : [],
      siret: siret ? indexes.organizationsBySiret.get(siret) ?? [] : [],
      email: organizationEmail ? indexes.organizationsByEmail.get(organizationEmail) ?? [] : [],
      phone: organizationPhone ? indexes.organizationsByPhone.get(organizationPhone) ?? [] : [],
      nameCity: organizationNameCity ? indexes.organizationsByNameCity.get(organizationNameCity) ?? [] : [],
      namePostalCode: organizationNamePostal ? indexes.organizationsByNamePostalCode.get(organizationNamePostal) ?? [] : []
    };
    const organizationCertainMatches = uniqueOrganizations([
      ...organizationMatchesByCriterion.siren,
      ...organizationMatchesByCriterion.siret,
      ...organizationMatchesByCriterion.email,
      ...organizationMatchesByCriterion.phone
    ]);
    const organizationPossibleMatches = uniqueOrganizations([
      ...organizationMatchesByCriterion.nameCity,
      ...organizationMatchesByCriterion.namePostalCode
    ].filter((organization) => !organizationCertainMatches.some((certain) => certain.id === organization.id)));
    organizationMatches.push(...atlasOrganizationMatches(
      organizationCertainMatches,
      values,
      (organization) => organizationMatchReasons(organization, organizationMatchesByCriterion),
      organizationCertainMatches.length > 1 ? "ambiguous" : "certain"
    ));
    organizationMatches.push(...atlasOrganizationMatches(
      organizationPossibleMatches,
      values,
      (organization) => organizationMatchReasons(organization, organizationMatchesByCriterion),
      "possible"
    ));
    const internalOrganizationDuplicate =
      hasDuplicate(internalSirenCounts, siren) ||
      hasDuplicate(internalSiretCounts, siret) ||
      hasDuplicate(internalOrganizationEmailCounts, organizationEmail) ||
      hasDuplicate(internalOrganizationPhoneCounts, organizationPhone) ||
      hasDuplicate(internalOrganizationNameCityCounts, organizationNameCity) ||
      hasDuplicate(internalOrganizationNamePostalCounts, organizationNamePostal);

    if (typeof values.organization === "string" && values.organization && !indexes.organizationsByName.has(normalizeComparable(values.organization))) {
      warnings.push(`Organisation inconnue dans le tenant: ${values.organization}`);
    }
    if (typeof values.real_estate_network === "string" && values.real_estate_network && !indexes.organizationsByName.has(normalizeComparable(values.real_estate_network))) {
      warnings.push(`Réseau immobilier inconnu dans le tenant: ${values.real_estate_network}`);
    }
    if (typeof values.owner === "string" && values.owner && !indexes.ownersByKey.has(normalizeComparable(values.owner))) {
      warnings.push(`Propriétaire du contact inconnu dans le tenant: ${values.owner}`);
    }

    let classification: CsvImportClassification = "new_contact";
    let reason = "Aucun doublon détecté.";
    let existingPerson: CsvImportPreviewPerson | null = duplicateMatches.length === 1 ? duplicateMatches[0] : null;

    if (errors.length > 0) {
      classification = "rejected_row";
      reason = "La ligne contient des erreurs bloquantes.";
      existingPerson = null;
    } else if (emailPhoneConflict || duplicateMatches.length > 1) {
      classification = "critical_conflict";
      reason = "L'email et le téléphone correspondent à des personnes différentes ou plusieurs correspondances existent.";
      existingPerson = null;
    } else if (internalCertain || emailMatches.length > 0 || phoneMatches.length > 0) {
      classification = duplicateMatches.length === 1 ? "existing_contact_enrichment" : "certain_duplicate";
      reason = duplicateMatches.length === 1 ? "Contact existant trouvé par email ou téléphone." : "Doublon certain détecté par email ou téléphone.";
    } else if (internalPossible || possibleDuplicateMatches.length > 0) {
      classification = "possible_duplicate";
      reason = "Doublon possible détecté par prénom, nom et ville.";
    }

    const enrichment = existingPerson ? enrichmentsFor(existingPerson, values) : { fieldsToEnrich: {}, fieldConflicts: {} };
    if (existingPerson?.do_not_contact) warnings.push("Le contact existant est marqué Ne plus contacter et ne doit pas être réactivé automatiquement.");
    if (classification === "existing_contact_enrichment" && Object.keys(enrichment.fieldConflicts).length > 0 && Object.keys(enrichment.fieldsToEnrich).length === 0) {
      classification = "certain_duplicate";
      reason = "Contact existant détecté, mais aucune donnée vide ne peut être complétée automatiquement.";
    }
    if (classification === "new_contact" && (organizationCertainMatches.length > 0 || organizationPossibleMatches.length > 0 || internalOrganizationDuplicate)) {
      warnings.push("Une correspondance organisation est détectée et devra être confirmée avant l'import final.");
    }
    const organizationReviewRequired = organizationMatches.length > 0 || internalOrganizationDuplicate;
    const decision = classification === "new_contact" && organizationReviewRequired
      ? { recommendedDecision: "review_later" as const, decisionRequired: true }
      : chooseDecision(classification, existingPerson?.id ?? null);

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
      matches,
      organizationMatches,
      recommendedDecision: decision.recommendedDecision,
      decisionRequired: decision.decisionRequired,
      duplicatePersonIds: duplicateMatches.map((person) => person.id),
      possibleDuplicatePersonIds: possibleDuplicateMatches.map((person) => person.id),
      duplicateOrganizationIds: organizationCertainMatches.map((organization) => organization.id),
      possibleDuplicateOrganizationIds: organizationPossibleMatches.map((organization) => organization.id),
      warnings,
      errors
    };
  });

  return {
    headers: parsed.headers,
    proposedMapping,
    unmappedHeaders,
    rows,
    summary: summarizeRows(rows),
    analysisFingerprint: createAnalysisFingerprint(proposedMapping)
  };
}

function countKeys(keys: string[]) {
  const counts = new Map<string, number>();
  for (const key of keys.filter(Boolean)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

function hasDuplicate(counts: Map<string, number>, value: unknown) {
  return typeof value === "string" && value !== "" && (counts.get(value) ?? 0) > 1;
}

function createAnalysisFingerprint(mapping: CsvImportMapping) {
  return JSON.stringify(Object.entries(mapping).sort(([left], [right]) => left.localeCompare(right)));
}

function summarizeRows(rows: CsvImportRowPreview[]): CsvImportSummary {
  return {
    totalRows: rows.length,
    newContacts: rows.filter((row) => row.classification === "new_contact").length,
    existingContactsToEnrich: rows.filter((row) => row.classification === "existing_contact_enrichment").length,
    certainDuplicates: rows.filter((row) => row.classification === "certain_duplicate").length,
    possibleDuplicates: rows.filter((row) => row.classification === "possible_duplicate").length,
    criticalConflicts: rows.filter((row) => row.classification === "critical_conflict").length,
    rejectedRows: rows.filter((row) => row.classification === "rejected_row").length,
    cleanRows: rows.filter((row) => row.classification === "new_contact" && row.organizationMatches.length === 0 && row.errors.length === 0).length,
    internalDuplicates: rows.filter((row) => [...row.matches, ...row.organizationMatches].some((match) => match.kind === "internal_duplicate")).length,
    atlasMatches: rows.filter((row) => [...row.matches, ...row.organizationMatches].some((match) => match.kind === "atlas_existing")).length,
    ambiguousRows: rows.filter((row) => row.classification === "critical_conflict" || [...row.matches, ...row.organizationMatches].some((match) => match.strength === "ambiguous")).length,
    pendingDecisions: rows.filter((row) => row.decisionRequired).length
  };
}
