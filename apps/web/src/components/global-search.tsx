"use client";

import {
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  globalSearchCategoryLabels,
  type GlobalSearchCategory,
  type GlobalSearchResults
} from "@/features/global-search/global-search";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const categories: GlobalSearchCategory[] = ["people", "organizations", "relationships", "projects", "interactions", "tasks"];
const INITIAL_VISIBLE_RESULTS = 3;

function emptyResults(): GlobalSearchResults {
  return {
    people: [],
    organizations: [],
    relationships: [],
    projects: [],
    interactions: [],
    tasks: []
  };
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults>(emptyResults);
  const [expanded, setExpanded] = useState<Partial<Record<GlobalSearchCategory, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedQuery = query.trim();
  const hasSearchableQuery = trimmedQuery.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH;
  const totalResults = useMemo(() => categories.reduce((total, category) => total + results[category].length, 0), [results]);

  useEffect(() => {
    setExpanded({});
    if (!hasSearchableQuery) {
      setResults(emptyResults());
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const payload = await response.json() as { data: GlobalSearchResults };
        setResults(payload.data ?? emptyResults());
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("La recherche n'a pas pu aboutir.");
        setResults(emptyResults());
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [hasSearchableQuery, trimmedQuery]);

  return (
    <section className="global-search" aria-label="Recherche globale">
      <label className="global-search-field">
        <span>Recherche</span>
        <input
          className="input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher dans Atlas"
          autoComplete="off"
        />
      </label>
      <div className="global-search-panel" aria-live="polite">
        {!trimmedQuery ? <p className="global-search-hint">Saisissez au moins {GLOBAL_SEARCH_MIN_QUERY_LENGTH} caracteres.</p> : null}
        {trimmedQuery && !hasSearchableQuery ? <p className="global-search-hint">La recherche commence a partir de {GLOBAL_SEARCH_MIN_QUERY_LENGTH} caracteres.</p> : null}
        {hasSearchableQuery && loading ? <p className="global-search-hint">Recherche en cours...</p> : null}
        {error ? <p className="global-search-error" role="alert">{error}</p> : null}
        {hasSearchableQuery && !loading && !error && totalResults === 0 ? <p className="global-search-empty">Aucun resultat trouve.</p> : null}
        {hasSearchableQuery && !error && totalResults > 0 ? (
          <div className="global-search-groups">
            {categories.map((category) => {
              const categoryResults = results[category];
              if (categoryResults.length === 0) return null;
              const isExpanded = Boolean(expanded[category]);
              const visibleResults = isExpanded ? categoryResults : categoryResults.slice(0, INITIAL_VISIBLE_RESULTS);
              return (
                <section className="global-search-group" key={category}>
                  <div className="global-search-group-heading">
                    <h2>{globalSearchCategoryLabels[category]}</h2>
                    <span>{categoryResults.length}</span>
                  </div>
                  <div className="global-search-list">
                    {visibleResults.map((result) => (
                      <Link className="global-search-result" href={result.href} key={`${result.category}-${result.id}`}>
                        <strong>{result.title}</strong>
                        {result.subtitle ? <span>{result.subtitle}</span> : null}
                        {result.details.length > 0 ? <small>{result.details.join(" | ")}</small> : null}
                      </Link>
                    ))}
                  </div>
                  {categoryResults.length > INITIAL_VISIBLE_RESULTS ? (
                    <button
                      className="button subtle-button global-search-more"
                      type="button"
                      onClick={() => setExpanded((current) => ({ ...current, [category]: !isExpanded }))}
                    >
                      {isExpanded ? "Afficher moins" : `Afficher ${categoryResults.length - INITIAL_VISIBLE_RESULTS} de plus`}
                    </button>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

