import type { ReactNode } from "react";
import { Card } from "./card";

export function TimelineItem({ title, meta, description, actions }: { title: ReactNode; meta?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <Card as="article" className="timeline-item stack">
      {meta ? <p className="muted">{meta}</p> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div className="actions">{actions}</div> : null}
    </Card>
  );
}
