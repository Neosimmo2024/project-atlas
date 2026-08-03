"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getPasswordRecoveryRedirectPath } from "@/features/auth/password-recovery";

export function PasswordRecoveryFragmentRedirect() {
  const router = useRouter();

  useEffect(() => {
    const redirectPath = getPasswordRecoveryRedirectPath(window.location.hash);
    if (redirectPath) {
      router.replace(redirectPath);
    }
  }, [router]);

  return null;
}
