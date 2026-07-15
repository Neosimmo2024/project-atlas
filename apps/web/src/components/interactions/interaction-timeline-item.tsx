import Link from "next/link";
import type { InteractionListItem } from "@/repositories/interactions";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function InteractionTimelineItem({ interaction }: { interaction: InteractionListItem }) {
  return (
    <article className="timeline-item">
      <div>
        <strong><Link href={`/interactions/${interaction.id}`}>{interaction.title}</Link></strong>
        <p className="muted">{interaction.type?.label ?? "Interaction"} - {formatDate(interaction.interaction_date)}</p>
      </div>
      <p>{interaction.summary ?? interaction.comments ?? "Aucun detail."}</p>
    </article>
  );
}
