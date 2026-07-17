"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readResponseMessage } from "@/lib/http/response-message";

type DeleteTaskButtonProps = {
  taskId: string;
  redirectTo?: string;
};

function deletedUrl(path: string) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("taskDeleted", "1");
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function DeleteTaskButton({ taskId, redirectTo = "/tasks" }: DeleteTaskButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!window.confirm("Confirmer la suppression de cette tache ?")) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });

      if (!response.ok) {
        setError(await readResponseMessage(response, "Suppression impossible."));
        return;
      }

      router.replace(deletedUrl(redirectTo));
    } catch {
      setError("Erreur reseau pendant la suppression de la tache.");
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
