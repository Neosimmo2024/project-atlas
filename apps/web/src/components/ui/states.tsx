import type { ReactNode } from "react";

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Une erreur est survenue.", body, action }: { title?: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state error-state" role="alert">
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function LoadingState({ label = "Chargement..." }: { label?: string }) {
  return <div className="empty-state loading-state" role="status" aria-live="polite">{label}</div>;
}
