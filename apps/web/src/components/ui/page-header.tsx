import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

type PageHeaderProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, subtitle, actions, className, ...props }: PageHeaderProps) {
  return (
    <header {...props} className={cn("page-header", className)}>
      <div>
        {eyebrow ? <p className="muted">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </header>
  );
}
