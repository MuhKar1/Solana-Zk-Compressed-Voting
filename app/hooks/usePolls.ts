"use client";

import { useCallback, useEffect, useState } from "react";
import { getReadProgram } from "../lib/program";
import { normalizeProposal } from "../lib/voting";
import { toFriendlyError } from "../lib/errors";
import type { ProposalAccount, Banner } from "../lib/types";

/**
 * Lists every on-chain poll via `getProgramAccounts`.
 *
 * Because `Proposal` is a standard (non-compressed) Anchor account owned by
 * the program, we can enumerate all of them without an indexer.
 */
export function usePolls() {
  const [polls, setPolls] = useState<ProposalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Banner | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const program = getReadProgram();
      const accounts = await (program.account as any).proposal.all();
      const next = (accounts as { publicKey: { toBase58(): string }; account: any }[])
        .map((item) => normalizeProposal(item.publicKey as any, item.account))
        .sort(
          (a, b) =>
            Number(a.isClosed) - Number(b.isClosed) ||
            a.title.localeCompare(b.title)
        );
      setPolls(next);
    } catch (err) {
      setError(toFriendlyError(err, "Could not load polls"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { polls, loading, error, refresh };
}
