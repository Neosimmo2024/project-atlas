import type { FormHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function FilterBar({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form {...props} className={cn("filters", className)} />;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="actions toolbar">{children}</div>;
}
