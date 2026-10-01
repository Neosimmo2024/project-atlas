import { z } from "zod";
import type { CsvImportMapping } from "@/features/csv-import/csv-import";
import { reviewSchema } from "./review";
import { savedCandidateSchema } from "./enterprise-search";

export const prospectSourceSchema = z.object({ listId: z.string().uuid(), siret: z.string().regex(/^\d{14}$/), reviewedAt: z.string().min(1).max(64) });
export type ProspectImportSource = z.infer<typeof prospectSourceSchema>;

export function buildProspectImport(listId: string, candidate: unknown, review: Record<string, unknown>) {
  const item = savedCandidateSchema.element.parse(candidate);
  const value = reviewSchema.parse({ listId, siret: item.siret, status: review.status, kind: review.kind,
    firstName: review.first_name, lastName: review.last_name, email: review.email, phone: review.phone,
    sourceUrl: review.source_url, notes: review.notes });
  if (value.status !== "qualified" || !value.lastName) throw new Error("PROSPECT_NOT_READY");
  const source = prospectSourceSchema.parse({ listId, siret: item.siret, reviewedAt: review.reviewed_at });
  const entries = [
    ["Prénom", "first_name", value.firstName], ["Nom", "last_name", value.lastName],
    ["Email", "email", value.email], ["Téléphone", "phone", value.phone],
    ["Ville", "city", item.city], ["Code postal", "postal_code", item.postalCode],
    ["Entreprise", "organization", item.name], ["SIREN", "organization_siren", item.siret.slice(0, 9)],
    ["SIRET", "organization_siret", item.siret],
    ["Source", "source", `Prospection Atlas ${listId}/${item.siret} — ${value.sourceUrl}`],
    ["Commentaires", "comments", value.notes]
  ];
  const quote = (text: string) => `"${text.replaceAll('"', '""')}"`;
  return {
    source, content: [entries.map(e => quote(e[0])).join(","), entries.map(e => quote(e[2])).join(",")].join("\n"),
    mapping: Object.fromEntries(entries.map(e => [e[0], e[1]])) as CsvImportMapping,
    fileName: `Prospect ${item.siret}`,
    idempotencyKey: `prospect:${listId}:${item.siret}:${source.reviewedAt}`
  };
}
