import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

type ButtonVariant = "primary" | "subtle" | "danger" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  const variantClass = {
    primary: "",
    subtle: "subtle-button",
    danger: "danger-button",
    ghost: "ghost-button"
  }[variant];

  return <button {...props} className={cn("button", variantClass, className)} />;
}
