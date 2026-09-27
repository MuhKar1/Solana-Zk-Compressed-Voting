import "../polyfills";
import { PublicKey } from "@solana/web3.js";
import { AppError } from "../errors";
import { titleFromBytes } from "../derivation";
import type { VoterProgram } from "../program";
import type { ProposalAccount, ProposalRaw } from "../types";

/** Parse and validate a base58 public key, throwing a friendly error. */
export function parsePublicKey(value: string, label: string): PublicKey {
  const trimmed = value.trim();
  try {
    return new PublicKey(trimmed);
  } catch {
    throw new AppError(
      "Invalid address",
      `The ${label} you entered is not a valid Solana public key.`
    );
  }
}

/** Convert the raw Anchor account into a UI-friendly object. */
export function normalizeProposal(
  pda: PublicKey,
  raw: ProposalRaw
): ProposalAccount {
  const votes = raw.votes.map((v) => v.toNumber());
  return {
    address: pda.toBase58(),
    creator: new PublicKey(raw.creator).toBase58(),
    title: titleFromBytes(raw.title),
    optionsCount: raw.optionsCount,
    votes,
    totalVotes: votes.reduce((sum, n) => sum + n, 0),
    isClosed: raw.isClosed,
    bump: raw.bump,
  };
}

/** Fetch and normalise a single proposal account. */
export async function fetchProposal(
  program: VoterProgram,
  address: string | PublicKey
): Promise<ProposalAccount> {
  const pda = parsePublicKey(
    typeof address === "string" ? address : address.toBase58(),
    "proposal address"
  );

  const raw = (await (program.account as any).proposal.fetch(pda)) as ProposalRaw;
  return normalizeProposal(pda, raw);
}
