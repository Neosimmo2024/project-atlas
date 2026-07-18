import type { ReactNode } from "react";
import { Card } from "./card";

export function EntityHeader({ eyebrow, title, meta, actions }: { eyebrow?: ReactNode; title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header entity-header">
      <div>
        {eyebrow ? <p className="muted">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {meta ? <p className="muted">{meta}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </header>
  );
}

export function EntitySummary({ children }: { children: ReactNode }) {
  return <Card className="grid entity-summary">{children}</Card>;
}

export function EntityActions({ children }: { children: ReactNode }) {
  return <div className="actions entity-actions">{children}</div>;
}

export function EntityTabs({ children, label = "Onglets" }: { children: ReactNode; label?: string }) {
  return <nav className="tabs entity-tabs" aria-label={label}>{children}</nav>;
}
