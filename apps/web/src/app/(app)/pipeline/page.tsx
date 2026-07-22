import Link from "next/link";
import { PipelineFilters } from "@/components/recruitment-pipeline/pipeline-filters";
import { PipelinePageClient } from "@/components/recruitment-pipeline/pipeline-page-client";
import { EmptyState, ErrorState, PageHeader, Pagination } from "@/components/ui";
import { listRecruitmentPipeline, parsePipelineFilters, type RecruitmentPipelineResult } from "@/repositories/recruitment-pipeline";
import { getTenantContext } from "@/repositories/tenant-context";

type PipelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PipelinePage({ searchParams }: PipelinePageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  if (!context) {
    return (
      <div className="page stack">
        <PageHeader eyebrow="Pipeline" title="Pipeline de recrutement" />
        <EmptyState title="Aucun tenant actif" body="Votre session est valide, mais aucun tenant actif n'est associe a ce compte." />
      </div>
    );
  }

  const filters = parsePipelineFilters(params);
  let result: RecruitmentPipelineResult;
  try {
    result = await listRecruitmentPipeline(context, filters);
  } catch (error) {
    return (
      <div className="page stack">
        <PageHeader eyebrow="Pipeline" title="Pipeline de recrutement" actions={<Link className="button subtle-button" href="/relationships">Relationships</Link>} />
        <ErrorState title="Pipeline indisponible" body={error instanceof Error ? error.message : "Impossible de charger le pipeline."} />
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageHeader
        eyebrow={context.tenant.name}
        title="Pipeline de recrutement"
        subtitle="Vue opérationnelle des Relationships, avec transitions sécurisées côté serveur."
        actions={<Link className="button subtle-button" href="/relationships/new">Nouvelle relation</Link>}
      />
      <PipelineFilters filters={filters} owners={result.owners} />
      {result.total === 0 ? (
        <EmptyState title="Pipeline vide" body="Créez une Relationship pour alimenter le pipeline de recrutement." action={<Link className="button link-button" href="/relationships/new">Créer une relation</Link>} />
      ) : (
        <>
          <PipelinePageClient initialCards={result.cards} owners={result.owners} filters={filters} role={context.role} invalidStages={result.invalidStages} />
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefForPage={(page) => hrefForPipelinePage(params, page)} label="Pagination du pipeline" />
        </>
      )}
    </div>
  );
}

function hrefForPipelinePage(params: Record<string, string | string[] | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value && key !== "page") next.set(key, value);
  }
  next.set("page", String(page));
  return `/pipeline?${next.toString()}`;
}
