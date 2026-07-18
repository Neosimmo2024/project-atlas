import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  children: ReactNode;
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return <span {...props} className={cn("tag", `tag-${tone}`, className)} />;
}

export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  const tone = status === "active" || status === "open" || status === "completed" || status === "won" ? "success" : status === "lost" || status === "cancelled" ? "danger" : "neutral";
  return <Badge tone={tone}>{children ?? status}</Badge>;
}

export function PriorityBadge({ priority, children }: { priority: string; children?: ReactNode }) {
  const tone = priority === "critical" ? "danger" : priority === "high" ? "warning" : "neutral";
  return <Badge tone={tone}>{children ?? priority}</Badge>;
}
