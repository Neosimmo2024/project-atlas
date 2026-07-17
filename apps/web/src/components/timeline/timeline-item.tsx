import Link from "next/link";
import { TIMELINE_EVENT_LABELS } from "@/features/timeline/options";
import type { TimelineListItem } from "@/repositories/timeline-events";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function sourceHref(event: TimelineListItem) {
  if (event.source_type === "person" && event.person) return `/people/${event.person.id}`;
  if (event.source_type === "organization" && event.organization) return `/organizations/${event.organization.id}`;
  if (event.source_type === "relationship" && event.relationship) return `/relationships/${event.relationship.id}`;
  if (event.source_type === "interaction" && event.interaction) return `/interactions/${event.interaction.id}`;
  if (event.source_type === "task" && event.task) return `/tasks/${event.task.id}`;
  return "";
}

function linkedContext(event: TimelineListItem) {
  const links = [
    event.person ? { href: `/people/${event.person.id}`, label: event.person.display_name } : null,
    event.organization ? { href: `/organizations/${event.organization.id}`, label: event.organization.name } : null,
    event.relationship ? { href: `/relationships/${event.relationship.id}`, label: event.relationship.relationship_type } : null
  ].filter(Boolean) as { href: string; label: string }[];

  return links;
}

export function TimelineItem({ event }: { event: TimelineListItem }) {
  const href = sourceHref(event);
  const contextLinks = linkedContext(event);

  return (
    <article className="chronology-item">
      <div className="chronology-marker" aria-hidden="true" />
      <div className="stack">
        <div>
          <p className="muted">{formatDate(event.occurred_at)} - {TIMELINE_EVENT_LABELS[event.event_type]}</p>
          <h3>{event.title}</h3>
        </div>
        {event.description ? <p>{event.description}</p> : null}
        <div className="interaction-meta">
          {contextLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
          {event.created_by ? <span>Auteur: {event.created_by}</span> : null}
          {href ? <Link href={href}>Voir la source</Link> : <span>Source conservee dans l&apos;historique</span>}
        </div>
      </div>
    </article>
  );
}
