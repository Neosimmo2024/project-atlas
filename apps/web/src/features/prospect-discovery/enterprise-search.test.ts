import { describe, expect, it, vi } from "vitest";
import { normalizeCandidates, searchEnterprises } from "./enterprise-search";

const site = { siret: "12345678900012", code_postal: "94100", libelle_commune: "SAINT-MAUR-DES-FOSSES",
  activite_principale: "68.31Z", etat_administratif: "A", statut_diffusion_etablissement: "O" };
const company = { siren: "123456789", nom_complet: "Agence test", etat_administratif: "A", statut_diffusion: "O",
  nature_juridique: "5710", siege: site, matching_etablissements: [site] };
const payload = { results: [company], total_results: 1, total_pages: 1 };

describe("Recherche de prospects", () => {
  it("couvre Saint-Maur et La Varenne et exclut les communes voisines", () => {
    const locations = [
      { ...site, commune: "94068" },
      { ...site, siret: "12345678900020", code_postal: "94210", commune: "94068" },
      { ...site, siret: "12345678900038", code_postal: "94100", commune: "94069" },
      { ...site, siret: "12345678900046", code_postal: "94370", commune: "94071" }
    ];
    const result = normalizeCandidates({ ...payload, results: [{ ...company, siege: locations[3], matching_etablissements: locations }] }, "94100", "today", "saint_maur");
    expect(result.candidates.map(c => c.postalCode)).toEqual(["94100", "94210"]);
  });
  it("interroge la commune exacte pour la cible Saint-Maur", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    await searchEnterprises({ postalCode: "75001", target: "saint_maur" }, transport);
    const url = transport.mock.calls[0][0];
    expect(url.searchParams.get("code_commune")).toBe("94068");
    expect(url.searchParams.has("code_postal")).toBe(false);
  });
  it("conserve le choix d’un autre secteur", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    await searchEnterprises({ postalCode: "69001", target: "postal" }, transport);
    const url = transport.mock.calls[0][0];
    expect(url.searchParams.get("code_postal")).toBe("69001");
    expect(url.searchParams.has("code_commune")).toBe(false);
  });
  it("déduplique les établissements et conserve une source déterministe", () => {
    const result = normalizeCandidates(payload, "94100", "2026-09-30");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].sourceUrl).toBe("https://annuaire-entreprises.data.gouv.fr/etablissement/12345678900012");
    expect(result.candidates[0].kind).toBe("Entreprise à qualifier");
  });
  it("n'utilise pas le siège hors secteur à la place d'un établissement fermé", () => {
    const result = normalizeCandidates({ ...payload, results: [{ ...company,
      siege: { ...site, code_postal: "92400" }, matching_etablissements: [{ ...site, etat_administratif: "F" }]
    }] }, "94100", "today");
    expect(result.candidates).toEqual([]);
  });
  it.each([
    { statut_diffusion: "P" }, { etat_administratif: "C" }
  ])("écarte les unités fermées ou non diffusibles %j", (patch) => {
    expect(normalizeCandidates({ ...payload, results: [{ ...company, ...patch }] }, "94100", "today").candidates).toEqual([]);
  });
  it.each([
    { statut_diffusion_etablissement: "P" }, { activite_principale: "70.10Z" }, { siret: "99999999900012" }
  ])("écarte les établissements incohérents %j", (patch) => {
    const modified = { ...site, ...patch };
    expect(normalizeCandidates({ ...payload, results: [{ ...company, siege: modified, matching_etablissements: [modified] }] }, "94100", "today").candidates).toEqual([]);
  });
  it("ne transforme pas un indépendant en mandataire confirmé", () => {
    expect(normalizeCandidates({ ...payload, results: [{ ...company, nature_juridique: "1000" }] }, "94100", "today").candidates[0].kind).toBe("Indépendant à qualifier");
  });
  it("refuse une localisation invalide sans appel externe", async () => {
    const transport = vi.fn();
    await expect(searchEnterprises({ postalCode: "http://localhost" }, transport)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("utilise uniquement l'API fixe, limite et pagine la recherche", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    await searchEnterprises({ postalCode: "94100", page: 2 }, transport);
    const [url, options] = transport.mock.calls[0];
    expect(url.origin).toBe("https://recherche-entreprises.api.gouv.fr");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("25");
    expect(options.redirect).toBe("error");
  });
  it("ne masque pas une panne de la source comme une liste vide", async () => {
    await expect(searchEnterprises({ postalCode: "94100" }, vi.fn().mockResolvedValue(new Response("", { status: 429 })))).rejects.toThrow("PROSPECT_SOURCE_UNAVAILABLE");
    expect(() => normalizeCandidates({}, "94100", "today")).toThrow();
  });
});
