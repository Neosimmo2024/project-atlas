import type { ReactNode } from "react";
import { Card } from "./card";

type MetricCardProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
};

export function MetricCard({ label, value, hint, action }: MetricCardProps) {
  const content = (
    <>
      <span className="muted">{label}</span>
      <strong className="metric-value">{value}</strong>
      {hint ? <span className="muted">{hint}</span> : null}
    </>
  );

  return action ? <Card as="div" className="stack">{action}{content}</Card> : <Card className="stack">{content}</Card>;
}
