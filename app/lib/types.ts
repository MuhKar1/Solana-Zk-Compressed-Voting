import type { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

/**
 * Raw on-chain `Proposal` account layout as decoded by Anchor.
 * Field names mirror the Rust struct.
 */
export interface ProposalRaw {
  creator: PublicKey;
  title: number[] | Uint8Array;
  optionsCount: number;
  votes: BN[];
  isClosed: boolean;
  bump: number;
}

/** Normalised, UI-friendly view of a proposal account. */
export interface ProposalAccount {
  /** Proposal PDA as a base58 string. */
  address: string;
  /** Creator wallet as a base58 string. */
  creator: string;
  /** Human readable title (trailing zero bytes trimmed). */
  title: string;
  /** Number of voting options (2..10). */
  optionsCount: number;
  /** Vote tally per option, index 0 = option 1. */
  votes: number[];
  /** Total votes cast so far. */
  totalVotes: number;
  isClosed: boolean;
  bump: number;
}

/** Severity of a banner shown to the user. */
export type BannerKind = "success" | "error" | "info";

/** A user-facing notification banner. */
export interface Banner {
  kind: BannerKind;
  title: string;
  detail?: string;
  /** Optional explorer link, filled with the transaction signature. */
  txSignature?: string;
}

/** The eligibility state of the connected wallet for a given poll. */
export interface VoterStatus {
  checking: boolean;
  hasTicket: boolean;
  hasVoted: boolean;
  ticketAddress: string | null;
  voteRecordAddress: string | null;
}
