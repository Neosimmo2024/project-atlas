import Link from "next/link";
import { redirect } from "next/navigation";
import { searchEnterprises, searchInput } from "@/features/prospect-discovery/enterprise-search";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProspectsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getTenantContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const postalCode = typeof params.postalCode === "string" ? params.postalCode : "";
  const parsed = searchInput.safeParse({ postalCode, page: params.page ?? 1 });
  let result: Awaited<ReturnType<typeof searchEnterprises>> | null = null;
  let error = "";
  let existing = new Set<string>();
  if (postalCode) {
    if (!parsed.success) error = "Saisissez un code postal valide et une page entre 1 et 100.";
    else {
      try {
        result = await searchEnterprises(parsed.data);
        const sirens = [...new Set(result.candidates.map((item) => item.siren))];
        if (sirens.length) {
          const supabase = await createSupabaseServerClient();
          const { data, error: lookupError } = await supabase.from("organizations")
            .select("siren").eq("tenant_id", context.tenantId).in("siren", sirens);
          if (lookupError) throw new Error("PROSPECT_DUPLICATES_UNAVAILABLE");
          existing = new Set((data ?? []).map((item) => item.siren as string));
        }
      } catch {
        result = null;
        error = "La recherche ou la vérification des organisations existantes est indisponible. Réessayez plus tard.";
      }
    }
  }
  const pageUrl = (page: number) => `/prospects?${new URLSearchParams({ postalCode, page: String(page) })}`;
  return <div className="page stack">
    <header className="page-header"><div>
      <p className="muted">Prospection immobilière</p><h1>Rechercher des prospects</h1>
      <p>Retrouvez les établissements immobiliers actifs dans votre secteur, puis vérifiez les profils à contacter.</p>
    </div></header>
    <form className="card stack" action="/prospects" method="get">
      <label htmlFor="prospect-postal">Code postal</label>
      <input id="prospect-postal" name="postalCode" defaultValue={postalCode || "94100"} pattern="[0-9]{5}" maxLength={5} required inputMode="numeric" />
      <p className="muted">Saint-Maur-des-Fossés : recherchez 94100, puis 94210 pour La Varenne.</p>
      <button className="button" type="submit">Rechercher les établissements</button>
    </form>
    <p className="muted">Source : Annuaire des Entreprises, activité 68.31Z. Le statut de mandataire ou d’agence reste à confirmer. Les téléphones et emails ne sont pas fournis par cette source.</p>
    {error ? <p role="alert">{error}</p> : null}
    {result ? <section className="stack" aria-label="Résultats de prospection">
      <h2>{result.candidates.length} établissement(s) à examiner sur cette page</h2>
      <p>Page {result.page} sur {result.sourcePages || 1}. La source compte {result.sourceTotal} entreprises avant contrôle des établissements locaux. Cette liste n’est pas exhaustive.</p>
      {result.candidates.length === 0 ? <p>Aucun établissement local actif et diffusible retenu sur cette page. D’autres pages peuvent contenir des résultats.</p> : null}
      {result.candidates.map((item) => <article className="card stack" key={item.siret}>
        <h3>{item.name}</h3><p>{item.kind} · {item.postalCode} {item.city}</p>
        <p>SIRET : {item.siret}</p>
        <p>{existing.has(item.siren) ? "Organisation déjà présente dans Atlas (même SIREN)." : "Aucune organisation retrouvée par SIREN. Vérifier aussi le nom avant création."}</p>
        <p>À compléter : interlocuteur, activité précise, coordonnées professionnelles et source des coordonnées.</p>
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Consulter la fiche officielle</a>
        <p className="muted">Recherche effectuée le {new Date(item.checkedAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}.</p>
      </article>)}
      <nav aria-label="Pages des résultats">
        {result.page > 1 ? <Link prefetch={false} className="button subtle-button" href={pageUrl(result.page - 1)}>Précédente</Link> : null}{" "}
        {result.page < Math.min(100, result.sourcePages) ? <Link prefetch={false} className="button subtle-button" href={pageUrl(result.page + 1)}>Suivante</Link> : null}
      </nav>
      <p>Aucun contact n’est créé ni inscrit à une campagne depuis cet écran.</p>
    </section> : null}
  </div>;
}
