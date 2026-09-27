"use client";

import { useCallback, useEffect, useState } from "react";
import { getReadProgram } from "../lib/program";
import { fetchProposal } from "../lib/voting";
import { toFriendlyError } from "../lib/errors";
import type { ProposalAccount, Banner } from "../lib/types";

/** Fetch and refresh a single poll account. */
export function usePoll(address: string | undefined) {
  const [poll, setPoll] = useState<ProposalAccount | null>(null);
  const [loading, setLoading] = useState(Boolean(address));
  const [error, setError] = useState<Banner | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      setPoll(await fetchProposal(getReadProgram(), address));
    } catch (err) {
      setError(toFriendlyError(err, "Load poll"));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { poll, loading, error, refresh };
}
