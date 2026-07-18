import Link from "next/link";
import { projectStageLabel } from "./project-utils";
import type { ProjectsListResult } from "@/repositories/projects";

type ContextProjectsProps = {
  title?: string;
  result: ProjectsListResult;
  newHref: string;
  allHref: string;
};

export function ContextProjects({ title = "Projets", result, newHref, allHref }: ContextProjectsProps) {
  return (
    <section className="card stack">
      <div className="page-header">
        <h2>{title}</h2>
        <div className="actions">
          <Link className="button subtle-button" href={newHref}>Nouveau Projet</Link>
          <Link className="button subtle-button" href={allHref}>Voir tous les Projets</Link>
        </div>
      </div>
      {result.projects.length === 0 ? <p className="muted">Aucun Projet ouvert lie.</p> : result.projects.map((project) => (
        <Link key={project.id} className="card stack" href={`/projects/${project.id}`}>
          <strong>{project.title}</strong>
          <span>Etape : {projectStageLabel(project.stage)}</span>
          <span>Prochaine action : {project.nextAction?.title ?? "Aucune action planifiee"}</span>
        </Link>
      ))}
    </section>
  );
}
