"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type DeleteInteractionButtonProps = {
  interactionId: string;
  redirectTo?: string;
};

function deletedUrl(path: string) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("interactionDeleted", "1");
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function DeleteInteractionButton({ interactionId, redirectTo = "/interactions" }: DeleteInteractionButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!window.confirm("Confirmer la suppression de cette interaction ?")) return;

    setLoading(true);
    setError(null);
    const response = await fetch(`/api/interactions/${interactionId}`, { method: "DELETE" });
    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(result.error ?? "Suppression impossible.");
      return;
    }

    router.replace(deletedUrl(redirectTo));
  }

  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}
      <Button type="button" className="danger-button" onClick={onDelete} disabled={loading}>
        {loading ? "Suppression..." : "Supprimer"}
      </Button>
    </div>
  );
}
