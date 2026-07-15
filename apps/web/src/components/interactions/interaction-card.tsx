import Link from "next/link";
import type { InteractionListItem } from "@/repositories/interactions";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function InteractionCard({ interaction }: { interaction: InteractionListItem }) {
  return (
    <Link className="card interaction-card stack" href={`/interactions/${interaction.id}`}>
      <div>
        <p className="muted">{interaction.type?.label ?? "Interaction"} - {formatDate(interaction.interaction_date)}</p>
        <h2>{interaction.title}</h2>
      </div>
      <p>{interaction.summary ?? interaction.comments ?? "Aucun resume."}</p>
      <div className="interaction-meta">
        <span>{interaction.person?.display_name ?? "Aucune personne"}</span>
        <span>{interaction.organization?.name ?? "Aucune organisation"}</span>
        <span>{interaction.duration_minutes ? `${interaction.duration_minutes} min` : "Duree non renseignee"}</span>
      </div>
    </Link>
  );
}
