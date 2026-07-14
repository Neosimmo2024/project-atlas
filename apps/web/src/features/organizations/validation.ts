import { z } from "zod";
import { ORGANIZATION_STATUSES, ORGANIZATION_TYPES } from "./options";

const nullableText = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalNullableText = nullableText.optional();

function normalizeEmail(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

export function normalizePhone(value: string | null | undefined) {
  return value ? value.replace(/[^\d+]/g, "") || null : null;
}

export function normalizeSiren(value: string | null | undefined) {
  return value ? value.replace(/\D/g, "") || null : null;
}

export function normalizeSiret(value: string | null | undefined) {
  return value ? value.replace(/\D/g, "") || null : null;
}

const normalizedSiren = optionalNullableText
  .transform(normalizeSiren)
  .refine((value) => !value || value.length === 9, "Le SIREN doit contenir 9 chiffres.");

const normalizedSiret = optionalNullableText
  .transform(normalizeSiret)
  .refine((value) => !value || value.length === 14, "Le SIRET doit contenir 14 chiffres.");

const departmentCode = optionalNullableText
  .refine((value) => !value || /^(?:\d{2}|2A|2B|97[1-6])$/i.test(value), "Le departement doit etre un code departement valide, par exemple 94.");

export const organizationInputSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(180, "Le nom est trop long."),
  legal_name: optionalNullableText,
  organization_type: z.enum(ORGANIZATION_TYPES, { message: "Le type selectionne est invalide." }),
  status: z.enum(ORGANIZATION_STATUSES, { message: "Le statut selectionne est invalide." }),
  address_line1: optionalNullableText,
  address_line2: optionalNullableText,
  postal_code: optionalNullableText,
  city: optionalNullableText,
  department: departmentCode,
  country: optionalNullableText,
  primary_phone: optionalNullableText.transform(normalizePhone),
  primary_email: z
    .string()
    .trim()
    .email("L'adresse email est invalide.")
    .or(z.literal(""))
    .transform((value) => normalizeEmail(value || null))
    .optional(),
  website_url: z
    .string()
    .trim()
    .url("Le site internet est invalide.")
    .or(z.literal(""))
    .transform((value) => value || null)
    .optional(),
  siren: normalizedSiren,
  siret: normalizedSiret,
  vat_number: optionalNullableText,
  parent_organization_id: optionalNullableText,
  source: optionalNullableText,
  comments: optionalNullableText,
  contact_allowed: z.coerce.boolean().default(false),
  do_not_contact: z.coerce.boolean().default(false)
}).superRefine((value, ctx) => {
  if (value.parent_organization_id && "id" in value && value.parent_organization_id === value.id) {
    ctx.addIssue({ code: "custom", path: ["parent_organization_id"], message: "Une organisation ne peut pas etre son propre parent." });
  }
});

export type OrganizationFormInput = z.infer<typeof organizationInputSchema>;

export function parseOrganizationInput(input: unknown) {
  return organizationInputSchema.safeParse(input);
}
