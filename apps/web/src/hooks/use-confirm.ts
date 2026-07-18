"use client";

import { useCallback, useState } from "react";

export type ConfirmState = {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

const initialState: ConfirmState = {
  open: false,
  title: ""
};

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>(initialState);

  const openConfirm = useCallback((next: Omit<ConfirmState, "open">) => {
    setState({ ...next, open: true });
  }, []);

  const closeConfirm = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    confirm: state,
    openConfirm,
    closeConfirm
  };
}
