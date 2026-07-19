import Link from "next/link";
import type { ProjectListItem } from "@/repositories/projects";

function wonThisMonth(projects: ProjectListItem[]) {
  const now = new Date();
  return projects.filter((project) => {
    if (project.status !== "won" || !project.won_at) return false;
    const won = new Date(project.won_at);
    return won.getFullYear() === now.getFullYear() && won.getMonth() === now.getMonth();
  }).length;
}

export function ProjectKpis({ projects }: { projects: ProjectListItem[] }) {
  const open = projects.filter((project) => project.status === "open" && !project.archived_at).length;
  const overdue = projects.filter((project) => project.nextAction?.reason === "overdue").length;
  const withoutAction = projects.filter((project) => project.status === "open" && !project.nextAction).length;
  const won = wonThisMonth(projects);

  return (
    <div className="grid">
      <Link className="card stack" href="/projects?status=open"><span className="muted">Projets ouverts</span><strong>{open}</strong></Link>
      <Link className="card stack" href="/projects?action=overdue"><span className="muted">Actions en retard</span><strong>{overdue}</strong></Link>
      <Link className="card stack" href="/projects?action=none&status=open"><span className="muted">Sans prochaine action</span><strong>{withoutAction}</strong></Link>
      <Link className="card stack" href="/projects?status=won"><span className="muted">Gagnes ce mois-ci</span><strong>{won}</strong></Link>
    </div>
  );
}
