"use client";

import { useCallback, useState } from "react";
import { useApp } from "../context/AppProvider";
import { toFriendlyError } from "../lib/errors";

export interface ActionResult {
  signature: string;
  title: string;
  detail: string;
}

/**
 * Wraps a transaction-triggering callback with:
 *  - a single `busy` flag to disable the form while waiting,
 *  - automatic success / error notification via the global banner.
 */
export function useAction() {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (label: string, fn: () => Promise<ActionResult>): Promise<string | null> => {
      setBusy(true);
      try {
        const result = await fn();
        notify({
          kind: "success",
          title: result.title,
          detail: result.detail,
          txSignature: result.signature,
        });
        return result.signature;
      } catch (err) {
        notify(toFriendlyError(err, label));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [notify]
  );

  return { busy, run };
}
