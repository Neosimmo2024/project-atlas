"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readResponseMessage } from "@/lib/http/response-message";
import type { Task, TaskStatus } from "@/types/domain";

type TaskStatusButtonProps = {
  task: Task;
  nextStatus: TaskStatus;
  children: React.ReactNode;
};

function taskToPayload(task: Task, nextStatus: TaskStatus) {
  return {
    title: task.title,
    description: task.description ?? "",
    status: nextStatus,
    priority: task.priority,
    due_at: task.due_at ?? "",
    assigned_to: task.assigned_to ?? "",
    person_id: task.person_id ?? "",
    organization_id: task.organization_id ?? "",
    relationship_id: task.relationship_id ?? "",
    interaction_id: task.interaction_id ?? "",
    project_id: task.project_id ?? "",
    source_type: task.source_type,
    source_id: task.source_id ?? "",
    reason: task.reason ?? "",
    metadata: task.metadata
  };
}

export function TaskStatusButton({ task, nextStatus, children }: TaskStatusButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function updateStatus() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(taskToPayload(task, nextStatus))
      });

      if (!response.ok) {
        setError(await readResponseMessage(response, "Mise a jour impossible."));
        return;
      }

      router.refresh();
    } catch {
      setError("Erreur reseau pendant la mise a jour de la tache.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}
      <Button type="button" onClick={updateStatus} disabled={loading}>
        {loading ? "Mise a jour..." : children}
      </Button>
    </div>
  );
}
