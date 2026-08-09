"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type SafeBackLinkProps = {
  fallbackHref: string;
  children?: ReactNode;
  className?: string;
  useHistory?: boolean;
};

function isInternalPreviousPage() {
  if (typeof window === "undefined" || !document.referrer) return false;
  try {
    const previous = new URL(document.referrer);
    return previous.origin === window.location.origin && previous.href !== window.location.href;
  } catch {
    return false;
  }
}

export function SafeBackLink({ fallbackHref, children = "Retour", className = "button subtle-button", useHistory = true }: SafeBackLinkProps) {
  const router = useRouter();

  return (
    <Link
      className={className}
      href={fallbackHref}
      onClick={(event) => {
        if (!useHistory) return;
        if (!isInternalPreviousPage()) return;
        event.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
