"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { bn } from "@lightprotocol/stateless.js";
import { getLightRpc, type LightRpc } from "../lib/program";
import { deriveTicketAddress, deriveVoteRecordAddress } from "../lib/derivation";
import type { VoterStatus } from "../lib/types";

const EMPTY: VoterStatus = {
  checking: false,
  hasTicket: false,
  hasVoted: false,
  ticketAddress: null,
  voteRecordAddress: null,
};

/**
 * Determines, for the connected wallet, whether they hold a voter ticket and
 * whether they have already voted on the given poll.
 */
export function useVoterStatus(
  address: string | undefined,
  publicKey: PublicKey | null
) {
  const [status, setStatus] = useState<VoterStatus>(EMPTY);

  const refresh = useCallback(async () => {
    if (!address || !publicKey) {
      setStatus(EMPTY);
      return;
    }
    setStatus((current) => ({ ...current, checking: true }));
    try {
      const rpc = getLightRpc();
      const proposal = new PublicKey(address);
      const ticket = await deriveTicketAddress(rpc, proposal, publicKey);
      const record = await deriveVoteRecordAddress(rpc, proposal, publicKey);
      const ticketAccount = await findCompressedAccount(rpc, ticket);
      const recordAccount = await findCompressedAccount(rpc, record);
      setStatus({
        checking: false,
        hasTicket: Boolean(ticketAccount),
        hasVoted: Boolean(recordAccount),
        ticketAddress: ticket.toBase58(),
        voteRecordAddress: record.toBase58(),
      });
    } catch {
      setStatus((current) => ({ ...current, checking: false }));
    }
  }, [address, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...status, refresh };
}

async function findCompressedAccount(rpc: LightRpc, address: PublicKey) {
  // The compression indexer can lag a beat behind a fresh transaction
  // (e.g. right after casting a vote), so poll briefly before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    const account = await rpc.getCompressedAccount(bn(address.toBytes()));
    if (account) return account;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return null;
}
