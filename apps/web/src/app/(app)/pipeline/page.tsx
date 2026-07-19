import Link from "next/link";
import { notFound } from "next/navigation";
import { PipelinePageClient } from "@/components/recruitment-pipeline/pipeline-page-client";
import { EmptyState, ErrorState, FilterBar, PageHeader, Pagination, SearchInput } from "@/components/ui";
import { PIPELINE_STAGE_LABELS } from "@/features/recruitment-pipeline/pipeline-ui";
import { RECRUITMENT_PIPELINE_STAGES } from "@/features/recruitment-pipeline/options";
import { listRecruitmentPipeline, parsePipelineFilters, type PipelineOwnerOption, type RecruitmentPipelineResult } from "@/repositories/recruitment-pipeline";
import { getTenantContext } from "@/repositories/tenant-context";

type PipelinePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PipelinePage({ searchParams }: PipelinePageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

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

function PipelineFilters({ filters, owners }: { filters: ReturnType<typeof parsePipelineFilters>; owners: PipelineOwnerOption[] }) {
  return (
    <FilterBar action="/pipeline" className="pipeline-filters">
      <input type="hidden" name="view" value={filters.view} />
      <label>Recherche<SearchInput name="query" defaultValue={filters.query} placeholder="Nom, organisation, notes" /></label>
      <label>Phase
        <select className="input" name="stage" defaultValue={filters.stage}>
          <option value="">Toutes</option>
          {RECRUITMENT_PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{PIPELINE_STAGE_LABELS[stage]}</option>)}
        </select>
      </label>
      <label>Responsable
        <select className="input" name="ownerId" defaultValue={filters.ownerId}>
          <option value="">Tous</option>
          {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}
        </select>
      </label>
      <label>Actions
        <select className="input" name="nextAction" defaultValue={filters.nextAction}>
          <option value="">Toutes</option>
          <option value="overdue">En retard</option>
          <option value="today">Aujourd&apos;hui</option>
          <option value="none">Sans prochaine action</option>
        </select>
      </label>
      <label>Contact
        <select className="input" name="contact" defaultValue={filters.contact}>
          <option value="">Tous</option>
          <option value="blocked">Ne plus contacter</option>
          <option value="allowed">Contact autorisé</option>
        </select>
      </label>
      <label>Refus
        <select className="input" name="recontactable" defaultValue={filters.recontactable}>
          <option value="">Tous</option>
          <option value="yes">Recontactable</option>
          <option value="no">Non recontactable</option>
        </select>
      </label>
      <label>Par page
        <select className="input" name="pageSize" defaultValue={filters.pageSize}>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </label>
      <label className="checks"><input type="checkbox" name="noOwner" value="true" defaultChecked={filters.noOwner} /> Sans responsable</label>
      <button className="button" type="submit">Filtrer</button>
      <Link className="button subtle-button" href="/pipeline">Réinitialiser</Link>
    </FilterBar>
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
