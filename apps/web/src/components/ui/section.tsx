import type { HTMLAttributes, ReactNode } from "react";
import { Card } from "./card";

type SectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function Section({ title, description, actions, children, ...props }: SectionProps) {
  return (
    <Card {...props} className={`stack ${props.className ?? ""}`}>
      {title || actions ? (
        <div className="page-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p className="muted">{description}</p> : null}
          </div>
          {actions ? <div className="actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Card>
  );
}
