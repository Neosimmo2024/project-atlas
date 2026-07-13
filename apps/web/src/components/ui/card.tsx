import type { HTMLAttributes } from "react";

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  return <section {...props} className={`card ${props.className ?? ""}`} />;
}
