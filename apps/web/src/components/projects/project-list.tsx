import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ProjectCard } from "./project-card";
import { Pagination } from "@/components/ui";
import type { ProjectsListResult } from "@/repositories/projects";

type ProjectListProps = {
  result: ProjectsListResult;
  currentParams: URLSearchParams;
  hasFilters: boolean;
};

function projectsUrl(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/projects?${next.toString()}`;
}

export function ProjectList({ result, currentParams, hasFilters }: ProjectListProps) {
  if (result.projects.length === 0) {
    return hasFilters ? (
      <EmptyState title="Aucun Projet ne correspond a vos filtres." body="" action={<Link className="button link-button" href="/projects">Reinitialiser les filtres</Link>} />
    ) : (
      <EmptyState title="Commencez votre premier Projet" body="Un Projet vous permet de suivre une demarche, ses echanges et sa prochaine action." action={<Link className="button link-button" href="/projects/new">Creer un Projet</Link>} />
    );
  }

  return (
    <div className="stack">
      <div className="task-list">
        {result.projects.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>
      <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefForPage={(page) => projectsUrl(currentParams, page)} label="Pagination Projets" />
    </div>
  );
}
