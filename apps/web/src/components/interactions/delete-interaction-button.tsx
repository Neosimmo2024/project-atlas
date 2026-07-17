"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readResponseMessage } from "@/lib/http/response-message";

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

    try {
      const response = await fetch(`/api/interactions/${interactionId}`, { method: "DELETE" });

      if (!response.ok) {
        setError(await readResponseMessage(response, "Suppression impossible."));
        return;
      }

      router.replace(deletedUrl(redirectTo));
    } catch {
      setError("Erreur reseau pendant la suppression de l'interaction.");
    } finally {
      setLoading(false);
    }
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
