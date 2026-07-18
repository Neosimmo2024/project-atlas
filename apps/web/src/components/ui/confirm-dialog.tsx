"use client";

import { useEffect } from "react";
import { Button } from "./button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, body, confirmLabel = "Confirmer", cancelLabel = "Annuler", loading = false, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="card stack confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h2 id="confirm-dialog-title">{title}</h2>
        {body ? <p className="muted">{body}</p> : null}
        <div className="actions">
          <Button type="button" disabled={loading} onClick={onConfirm}>{loading ? "Traitement..." : confirmLabel}</Button>
          <Button type="button" variant="subtle" onClick={onCancel}>{cancelLabel}</Button>
        </div>
      </section>
    </div>
  );
}
