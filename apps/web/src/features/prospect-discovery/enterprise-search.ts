import { z } from "zod";

export const searchInput = z.object({
  postalCode: z.string().regex(/^\d{5}$/),
  page: z.coerce.number().int().min(1).max(100).default(1)
});
const siteSchema = z.object({
  siret: z.string(), code_postal: z.string().nullable().optional(),
  libelle_commune: z.string().nullable().optional(), activite_principale: z.string().nullable().optional(),
  etat_administratif: z.string().nullable().optional(), statut_diffusion_etablissement: z.string().nullable().optional()
});
const responseSchema = z.object({
  results: z.array(z.object({
    siren: z.string(), nom_complet: z.string(), etat_administratif: z.string(), statut_diffusion: z.string(),
    nature_juridique: z.string().nullable().optional(), siege: siteSchema,
    matching_etablissements: z.array(siteSchema).default([])
  })).max(25),
  total_results: z.number().int().nonnegative(), total_pages: z.number().int().nonnegative()
});
export type ProspectCandidate = {
  siren: string; siret: string; name: string; city: string; postalCode: string;
  kind: string; sourceUrl: string; checkedAt: string;
};
export const savedCandidateSchema = z.array(z.object({
  siret: z.string().regex(/^\d{14}$/), name: z.string(), city: z.string(), postalCode: z.string().regex(/^\d{5}$/)
})).max(2500);

export function normalizeCandidates(payload: unknown, postalCode: string, checkedAt: string) {
  const data = responseSchema.parse(payload);
  const candidates = new Map<string, ProspectCandidate>();
  for (const company of data.results) {
    if (company.etat_administratif !== "A" || company.statut_diffusion !== "O" || !/^\d{9}$/.test(company.siren)) continue;
    for (const site of [company.siege, ...company.matching_etablissements]) {
      // Provider filters apply to the company, not necessarily to each establishment.
      if (site.code_postal !== postalCode || site.etat_administratif !== "A" ||
          site.statut_diffusion_etablissement !== "O" || site.activite_principale !== "68.31Z" ||
          !/^\d{14}$/.test(site.siret) || !site.siret.startsWith(company.siren)) continue;
      candidates.set(site.siret, {
        siren: company.siren, siret: site.siret, name: company.nom_complet,
        city: site.libelle_commune ?? "", postalCode,
        kind: company.nature_juridique === "1000" ? "Indépendant à qualifier" : "Entreprise à qualifier",
        sourceUrl: `https://annuaire-entreprises.data.gouv.fr/etablissement/${site.siret}`, checkedAt
      });
    }
  }
  return { candidates: [...candidates.values()], sourceTotal: data.total_results, sourcePages: data.total_pages };
}
export async function searchEnterprises(input: z.input<typeof searchInput>, transport: typeof fetch = fetch) {
  const { postalCode, page } = searchInput.parse(input);
  const url = new URL("https://recherche-entreprises.api.gouv.fr/search");
  url.search = new URLSearchParams({ code_postal: postalCode, activite_principale: "68.31Z",
    etat_administratif: "A", page: String(page), per_page: "25", limite_matching_etablissements: "100" }).toString();
  const response = await transport(url, { signal: AbortSignal.timeout(12000), redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error("PROSPECT_SOURCE_UNAVAILABLE");
  const text = await response.text();
  if (text.length > 4_000_000) throw new Error("PROSPECT_SOURCE_TOO_LARGE");
  return { ...normalizeCandidates(JSON.parse(text), postalCode, new Date().toISOString()), page, postalCode };
}
