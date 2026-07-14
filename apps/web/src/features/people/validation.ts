import { z } from "zod";
import { PERSON_STATUSES, PRIORITIES } from "./options";

const nullableText = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalNullableText = nullableText.optional();

export const personInputSchema = z.object({
  first_name: optionalNullableText,
  last_name: optionalNullableText,
  display_name: z.string().trim().min(1, "Le nom d'affichage est obligatoire.").max(160, "Le nom d'affichage est trop long."),
  primary_email: z
    .string()
    .trim()
    .email("L'adresse email est invalide.")
    .or(z.literal(""))
    .transform((value) => value || null)
    .optional(),
  primary_phone: optionalNullableText,
  city: optionalNullableText,
  postal_code: optionalNullableText,
  department: optionalNullableText,
  job_title: optionalNullableText,
  source: optionalNullableText,
  comments: optionalNullableText,
  status: z.enum(PERSON_STATUSES, { message: "Le statut selectionne est invalide." }),
  priority: z.enum(PRIORITIES, { message: "La priorite selectionnee est invalide." }),
  talent_score: z
    .union([z.literal(""), z.null(), z.undefined(), z.coerce.number().int().min(0, "Le score minimum est 0.").max(10, "Le score maximum est 10.")])
    .transform((value) => (value === "" || value == null ? null : value)),
  contact_allowed: z.coerce.boolean().default(false),
  do_not_contact: z.coerce.boolean().default(false)
});

export type PersonFormInput = z.infer<typeof personInputSchema>;

export function parsePersonInput(input: unknown) {
  return personInputSchema.safeParse(input);
}
