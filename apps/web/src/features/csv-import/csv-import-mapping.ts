import {
  type CsvImportField,
  type CsvImportMapping,
  type CsvImportMappingValue
} from "./csv-import";

export type CsvImportFieldGroup = "person" | "professional" | "recruitment";

export type CsvImportFieldDefinition = {
  field: CsvImportField;
  label: string;
  group: CsvImportFieldGroup;
};

export const CSV_IMPORT_FIELD_GROUP_LABELS: Record<CsvImportFieldGroup, string> = {
  person: "Informations de la personne",
  professional: "Informations professionnelles",
  recruitment: "Relation de recrutement"
};

export const CSV_IMPORT_FIELD_DEFINITIONS: CsvImportFieldDefinition[] = [
  { field: "first_name", label: "Prénom", group: "person" },
  { field: "last_name", label: "Nom", group: "person" },
  { field: "email", label: "E-mail", group: "person" },
  { field: "phone", label: "Téléphone", group: "person" },
  { field: "city", label: "Ville", group: "person" },
  { field: "postal_code", label: "Code postal", group: "person" },
  { field: "real_estate_network", label: "Réseau immobilier", group: "professional" },
  { field: "organization", label: "Organisation", group: "professional" },
  { field: "vat_status", label: "Statut TVA", group: "professional" },
  { field: "source", label: "Source", group: "recruitment" },
  { field: "comments", label: "Commentaires", group: "recruitment" },
  { field: "owner", label: "Responsable", group: "recruitment" },
  { field: "pipeline_stage", label: "Phase de recrutement", group: "recruitment" }
];

const knownFields = new Set<string>(CSV_IMPORT_FIELD_DEFINITIONS.map((definition) => definition.field));

export type CsvImportMappingValidation = {
  valid: boolean;
  errors: string[];
};

export function validateCsvImportMapping(headers: string[], mapping: CsvImportMapping): CsvImportMappingValidation {
  const errors: string[] = [];
  const usedFields = new Map<CsvImportField, string>();

  for (const header of headers) {
    const value = mapping[header];
    if (!value) {
      errors.push(`Choisissez une correspondance pour la colonne « ${header} » ou ignorez-la.`);
      continue;
    }
    if (value !== "ignore" && !knownFields.has(value)) {
      errors.push(`La correspondance de la colonne « ${header} » n'est pas reconnue.`);
      continue;
    }
    if (value !== "ignore") {
      const previousHeader = usedFields.get(value);
      if (previousHeader) {
        errors.push(`Les colonnes « ${previousHeader} » et « ${header} » utilisent le même champ Atlas.`);
      } else {
        usedFields.set(value, header);
      }
    }
  }

  const values = new Set<CsvImportMappingValue>(Object.values(mapping));
  if (!values.has("first_name") && !values.has("last_name")) {
    errors.push("Associez au moins un prénom ou un nom pour identifier la personne.");
  }
  if (!values.has("email") && !values.has("phone")) {
    errors.push("Associez au moins un e-mail ou un téléphone exploitable.");
  }

  return { valid: errors.length === 0, errors };
}
