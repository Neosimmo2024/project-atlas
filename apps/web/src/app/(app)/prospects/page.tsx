import Link from "next/link";
import { redirect } from "next/navigation";
import { searchEnterprises, searchInput, savedCandidateSchema } from "@/features/prospect-discovery/enterprise-search";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveProspectList } from "./actions";
import { ProspectReviewForm, type ProspectReview } from "./review-form";

export default async function ProspectsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getTenantContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const database = await createSupabaseServerClient();
  const { data: savedLists, error: listsError } = await database.from("prospect_lists")
    .select("id,name,postal_code,source_page,created_at,candidates")
    .eq("tenant_id", context.tenantId).order("created_at", { ascending: false }).limit(20);
  const listIds = (savedLists ?? []).map(list => list.id);
  const { data: reviews, error: reviewsError } = listIds.length ? await database.from("prospect_reviews")
    .select("list_id,siret,status,kind,email,phone,source_url,notes,reviewed_at,first_name,last_name")
    .eq("tenant_id", context.tenantId).in("list_id", listIds) : { data: [], error: null };
  const reviewMap = new Map((reviews as ProspectReview[] ?? []).map(review => [`${review.list_id}:${review.siret}`, review]));
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
    {params.saved === "1" ? <p role="status">Liste enregistrée. Retrouvez-la ci-dessous.</p> : null}
    {params.saved === "0" ? <p role="alert">La liste n’a pas été enregistrée : aucun résultat ou service indisponible.</p> : null}
    {params.review === "saved" ? <p role="status">Vérification enregistrée.</p> : null}
    {params.review === "invalid" ? <p role="alert">Vérifiez les champs. Un profil retenu doit avoir une activité confirmée, au moins une coordonnée valide et sa page source.</p> : null}
    {params.review === "failed" ? <p role="alert">La vérification n’a pas été enregistrée. Réessayez plus tard.</p> : null}
    {result ? <section className="stack" aria-label="Résultats de prospection">
      <h2>{result.candidates.length} établissement(s) à examiner sur cette page</h2>
      {result.candidates.length > 0 && ["owner", "admin", "recruiter", "manager"].includes(context.role) ? <form action={saveProspectList} className="card stack">
        <input type="hidden" name="postalCode" value={postalCode} />
        <input type="hidden" name="page" value={result.page} />
        <label htmlFor="prospect-list-name">Nom de la liste</label>
        <input id="prospect-list-name" name="name" maxLength={100} required defaultValue={`Immobilier ${postalCode} — page ${result.page}`} />
        <p>Les résultats de cette page seront actualisés lors de l’enregistrement. Chaque liste reste à examiner.</p>
        <button className="button" type="submit">Enregistrer cette page dans une liste</button>
      </form> : null}
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
    <section className="stack" aria-label="Listes enregistrées">
      <h2>Mes dernières listes</h2>
      {listsError ? <p>Les listes enregistrées sont momentanément indisponibles.</p> : null}
      {!listsError && !savedLists?.length ? <p>Aucune liste enregistrée.</p> : null}
      {reviewsError ? <p role="alert">Les vérifications sont momentanément indisponibles.</p> : null}
      {(savedLists ?? []).map((list) => <details className="card" key={list.id} id={`list-${list.id}`}>
        <summary>{list.name} — {list.postal_code}</summary>
        <p>Enregistrée le {new Date(list.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}. Coordonnées et activité à compléter avant tout contact.</p>
        {(savedCandidateSchema.safeParse(list.candidates).data ?? []).map((item) => {
          const review = reviewMap.get(`${list.id}:${item.siret}`);
          const label = review?.status === "qualified" ? "Retenu après vérification" : review?.status === "rejected" ? "Écarté" : "À vérifier";
          return <details key={item.siret} className="card">
            <summary>{item.name} · {reviewsError ? "Vérification indisponible" : label}</summary>
            <p>{item.postalCode} {item.city} · <a href={`https://annuaire-entreprises.data.gouv.fr/etablissement/${item.siret}`} target="_blank" rel="noopener noreferrer">Fiche officielle</a></p>
            {review ? <p>Dernière vérification : {new Date(review.reviewed_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.</p> : null}
            {!reviewsError && ["owner", "admin", "recruiter", "manager"].includes(context.role) ? <ProspectReviewForm listId={list.id} siret={item.siret} review={review} /> : null}
            {review?.status === "qualified" && review.last_name && context.role !== "reader" ? <Link prefetch={false} className="button" href={`/prospects/${list.id}/${item.siret}/integrate`}>Préparer l’intégration dans Atlas</Link> : null}
            {review?.status === "qualified" && !review.last_name ? <p>Identifiez l’interlocuteur et enregistrez son nom pour préparer l’intégration.</p> : null}
          </details>;
        })}
      </details>)}
    </section>
  </div>;
}
