import Link from "next/link";
import type { InteractionListItem } from "@/repositories/interactions";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

type InteractionTimelineItemProps = {
  interaction: InteractionListItem;
  returnHref?: string;
};

function interactionHref(interactionId: string, returnHref?: string) {
  if (!returnHref) return `/interactions/${interactionId}`;
  const params = new URLSearchParams({ returnTo: returnHref });
  return `/interactions/${interactionId}?${params.toString()}`;
}

export function InteractionTimelineItem({ interaction, returnHref }: InteractionTimelineItemProps) {
  return (
    <article className="timeline-item">
      <div>
        <strong><Link href={interactionHref(interaction.id, returnHref)}>{interaction.title}</Link></strong>
        <p className="muted">{interaction.type?.label ?? "Interaction"} - {formatDate(interaction.interaction_date)}</p>
      </div>
      <p>{interaction.summary ?? interaction.comments ?? "Aucun detail."}</p>
    </article>
  );
}
