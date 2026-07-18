import Link from "next/link";
import { TIMELINE_EVENT_LABELS } from "@/features/timeline/options";
import type { TimelineListItem } from "@/repositories/timeline-events";
import type { TimelineEventType } from "@/types/domain";

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

function eventIconType(eventType: TimelineEventType) {
  if (eventType.startsWith("interaction_")) return "interaction";
  if (eventType.startsWith("task_")) return "task";
  if (eventType.startsWith("relationship_")) return "relationship";
  return "organization";
}

function TimelineIcon({ eventType }: { eventType: TimelineEventType }) {
  const iconType = eventIconType(eventType);

  if (iconType === "interaction") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v5A3.5 3.5 0 0 1 16.5 15H11l-5 4v-4.4A3.5 3.5 0 0 1 4 11.5z" />
      </svg>
    );
  }

  if (iconType === "task") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M8 6h10" />
        <path d="M8 12h10" />
        <path d="M8 18h10" />
        <path d="m3.5 12 1.5 1.5L7.5 11" />
        <path d="m3.5 6 1.5 1.5L7.5 5" />
      </svg>
    );
  }

  if (iconType === "relationship") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
      <path d="M3 21h18" />
      <path d="M8 7h1" />
      <path d="M12 7h1" />
      <path d="M8 11h1" />
      <path d="M12 11h1" />
      <path d="M8 15h1" />
      <path d="M12 15h1" />
    </svg>
  );
}

function authorLabel(event: TimelineListItem) {
  return event.author?.name ? `Par ${event.author.name}` : "Créé automatiquement par Atlas";
}

function displayTitle(event: TimelineListItem) {
  if (["Organisation liee", "Organisation dissociee", "Echange cree", "Echange modifie", "Tache creee", "Tache terminee", "Tache rouverte", "Tache modifiee", "Tache supprimee", "Relation creee", "Personne creee", "Organisation creee"].includes(event.title)) {
    return TIMELINE_EVENT_LABELS[event.event_type];
  }

  return event.title;
}

export function TimelineItem({ event }: { event: TimelineListItem }) {
  const href = sourceHref(event);
  const contextLinks = linkedContext(event);

  return (
    <article className="chronology-item">
      <div className="chronology-marker">
        <TimelineIcon eventType={event.event_type} />
      </div>
      <div className="stack">
        <div className="chronology-heading">
          <p className="chronology-type">{TIMELINE_EVENT_LABELS[event.event_type]}</p>
          <h3>{displayTitle(event)}</h3>
          <p className="muted">{formatDate(event.occurred_at)} · {authorLabel(event)}</p>
        </div>
        {event.description ? <p className="chronology-description">{event.description}</p> : null}
        <div className="interaction-meta">
          {contextLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
          {href ? <Link href={href}>Ouvrir l&apos;élément</Link> : <span>Source conservée dans l&apos;historique</span>}
        </div>
      </div>
    </article>
  );
}
