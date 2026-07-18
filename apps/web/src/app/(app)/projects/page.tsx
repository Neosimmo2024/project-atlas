import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectKpis } from "@/components/projects/project-kpis";
import { ProjectList } from "@/components/projects/project-list";
import { PageHeader } from "@/components/ui";
import { listProjectOwnerOptions, listProjects } from "@/repositories/projects";
import { getTenantContext } from "@/repositories/tenant-context";

type ProjectsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isMissingMigration(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("projects") || message.includes("does not exist") || message.includes("schema");
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  const query = valueOf(params, "query");
  const status = valueOf(params, "status");
  const stage = valueOf(params, "stage");
  const type = valueOf(params, "type");
  const ownerId = valueOf(params, "ownerId");
  const organizationId = valueOf(params, "organizationId");
  const personId = valueOf(params, "personId");
  const relationshipId = valueOf(params, "relationshipId");
  const expectedClose = valueOf(params, "expectedClose");
  const action = valueOf(params, "action");
  const includeArchived = valueOf(params, "includeArchived") === "true";
  const page = Number(valueOf(params, "page") || 1);
  const currentParams = new URLSearchParams();
  for (const [key, value] of Object.entries({ query, status, stage, type, ownerId, organizationId, personId, relationshipId, expectedClose, action })) {
    if (value) currentParams.set(key, value);
  }
  if (includeArchived) currentParams.set("includeArchived", "true");
  const hasFilters = currentParams.toString().length > 0;

  try {
    const [result, ownerOptions, kpis] = context
      ? await Promise.all([
        listProjects(context, { query, status, stage, type, ownerId, organizationId, personId, relationshipId, expectedClose, action, includeArchived, page, pageSize: 10 }),
        listProjectOwnerOptions(context),
        listProjects(context, { includeArchived: true, page: 1, pageSize: 50 })
      ])
      : [{ projects: [], total: 0, page: 1, pageSize: 10, pageCount: 1 }, [], { projects: [], total: 0, page: 1, pageSize: 50, pageCount: 1 }];

    return (
      <div className="page stack">
        <PageHeader eyebrow="Projets" title="Projets" subtitle="Suivez vos demarches, leur avancement et la prochaine action a realiser." actions={<Link className="button link-button" href="/projects/new">Nouveau Projet</Link>} />
        <ProjectKpis projects={kpis.projects} />
        <ProjectFilters query={query} status={status} stage={stage} type={type} ownerId={ownerId} organizationId={organizationId} personId={personId} relationshipId={relationshipId} expectedClose={expectedClose} includeArchived={includeArchived} ownerOptions={ownerOptions} />
        <ProjectList result={result} currentParams={currentParams} hasFilters={hasFilters} />
      </div>
    );
  } catch (error) {
    return (
      <div className="page stack">
        <PageHeader eyebrow="Projets" title="Projets" actions={<Link className="button link-button" href="/projects/new">Nouveau Projet</Link>} />
        <EmptyState
          title={isMissingMigration(error) ? "La base de donnees des Projets n'est pas encore configuree." : "Impossible de charger les Projets."}
          body=""
          action={<Link className="button subtle-button" href="/projects">Reessayer</Link>}
        />
      </div>
    );
  }
}
