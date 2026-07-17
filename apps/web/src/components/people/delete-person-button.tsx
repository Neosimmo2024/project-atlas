"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readResponseMessage } from "@/lib/http/response-message";

export function DeletePersonButton({ personId }: { personId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!window.confirm("Confirmer la suppression de cette personne ?")) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/people/${personId}`, { method: "DELETE" });

      if (!response.ok) {
        setError(await readResponseMessage(response, "Suppression impossible."));
        return;
      }

      router.push("/people");
      router.refresh();
    } catch {
      setError("Erreur reseau pendant la suppression de la personne.");
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
