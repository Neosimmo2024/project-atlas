import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div";
};

export function Card({ as: Component = "section", className, ...props }: CardProps) {
  return <Component {...props} className={cn("card", className)} />;
}
