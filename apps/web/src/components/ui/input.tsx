import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return <input {...props} className={cn("input", className)} />;
}
