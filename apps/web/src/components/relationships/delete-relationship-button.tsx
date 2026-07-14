"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteRelationshipButton({ relationshipId }: { relationshipId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!window.confirm("Confirmer la suppression de cette relation ?")) return;

    setLoading(true);
    setError(null);
    const response = await fetch(`/api/relationships/${relationshipId}`, { method: "DELETE" });
    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(result.error ?? "Suppression impossible.");
      return;
    }

    router.push("/relationships");
    router.refresh();
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
