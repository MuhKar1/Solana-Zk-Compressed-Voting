/**
 * Error translation layer.
 *
 * The goal of this module is to convert raw Anchor / RPC / wallet exceptions
 * into messages a non-technical user can act on, while still preserving the
 * underlying error for developers debugging in the console.
 */

import type { Banner } from "./types";

/** An error that already carries a user-facing message. */
export class AppError extends Error {
  constructor(
    public title: string,
    public detail: string
  ) {
    super(detail);
    this.name = "AppError";
  }
}

/** Human friendly descriptions for the program's custom error codes. */
const PROGRAM_ERRORS: Record<number, string> = {
  6000: "That option number isn't valid for this proposal.",
  6001: "A proposal must have between 2 and 10 options.",
  6002: "This voter ticket belongs to a different proposal.",
  6003: "This wallet doesn't own the voter ticket it's trying to spend.",
  6004: "Only the person who created the proposal can do this.",
  6005: "A number overflowed while counting votes — the totals are too large.",
  6006: "The proposal address you entered isn't the official one.",
  6007: "Voting has already closed for this proposal.",
};

/** Friendly copy for common Light System Program errors (6000–6053). */
const LIGHT_ERRORS: Record<number, string> = {
  6017: "The zero-knowledge proof was empty. Please try again.",
  6019: "No inputs were provided to the proof. Please try again.",
  6029: "No compressed accounts were provided. Please try again.",
  6043:
    "The zero-knowledge proof could not be verified on-chain. This usually means the proof is stale or there's a version mismatch — please try again.",
};

function extractLogs(err: unknown): string | null {
  const logs = (err as { logs?: unknown })?.logs;
  if (Array.isArray(logs)) return logs.join("\n");
  if (typeof logs === "string") return logs;
  return null;
}

function extractProgramErrorCode(err: unknown): number | null {
  const e = err as {
    code?: unknown;
    error?: { errorCode?: { code?: unknown }; code?: unknown };
    errorCode?: { code?: unknown };
  };

  const candidates = [
    e.code,
    e.error?.errorCode?.code,
    e.error?.code,
    e.errorCode?.code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && candidate >= 6000) {
      return candidate;
    }
  }

  // Fall back to the hex form found in simulation logs,
  // e.g. "custom program error: 0x1773" -> 6003.
  const logs = extractLogs(err);
  if (logs) {
    const match = logs.match(/custom program error:\s*0x([0-9a-fA-F]+)/);
    if (match) {
      const code = parseInt(match[1], 16);
      if (code >= 6000) return code;
    }
  }

  return null;
}

function isUserRejection(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: unknown })?.code;
  return (
    code === 4001 ||
    /user rejected|cancelled by user|canceled by user/i.test(raw)
  );
}

/**
 * Convert an arbitrary thrown value into a user facing banner.
 */
export function toFriendlyError(err: unknown, context?: string): Banner {
  const raw = err instanceof Error ? err.message : String(err ?? "Unknown error");

  if (err instanceof AppError) {
    return { kind: "error", title: err.title, detail: err.detail };
  }

  // The system program reports "AccountAlreadyInUse" as custom error 0 when the
  // poll PDA ([creator, title]) already exists (duplicate title for this wallet).
  if ((err as { code?: unknown })?.code === 0) {
    return {
      kind: "error",
      title: "Poll already exists",
      detail: "You already created a poll with this title. Use a different title.",
    };
  }

  if (isUserRejection(err)) {
    return {
      kind: "error",
      title: "Request cancelled",
      detail:
        "You declined the request in your wallet, so no changes were made.",
    };
  }

  const code = extractProgramErrorCode(err);
  if (code !== null) {
    if (PROGRAM_ERRORS[code]) {
      return {
        kind: "error",
        title: context ?? "The program rejected the request",
        detail: PROGRAM_ERRORS[code],
      };
    }

    // Light System Program errors (6008–6053) surface during compressed
    // operations (mint, vote). Map the common ones to friendly copy.
    if (code >= 6008 && code <= 6053) {
      return {
        kind: "error",
        title: "Compression error",
        detail:
          LIGHT_ERRORS[code] ??
          `A zero-knowledge compression operation failed (error ${code}). Please try again.`,
      };
    }
  }

  const logs = extractLogs(err);
  const haystack = `${raw}\n${logs ?? ""}`;

  if (/insufficient funds|Attempt to debit an account but found no record of a prior credit/i.test(haystack)) {
    return {
      kind: "error",
      title: "Not enough SOL",
      detail:
        "Your wallet doesn't have enough SOL to cover this transaction. Add some devnet SOL and try again.",
    };
  }

  if (
    /Blockhash not found|block height exceeded|blockhash not found|not confirmed|TransactionExpired|timed out|was not confirmed/i.test(
      haystack
    )
  ) {
    return {
      kind: "error",
      title: "The network is busy",
      detail:
        "The network timed out before your transaction could be confirmed. Please try again in a moment.",
    };
  }

  if (
    /ComputationalBudget|exceeded.*CU|CU.*exceeded|MaxComputeBudget|ProgramFailedToComplete|Transaction too large/i.test(
      haystack
    )
  ) {
    return {
      kind: "error",
      title: "Transaction too large",
      detail:
        "This action needs more compute units than the network allows. Try splitting it into smaller batches.",
    };
  }

  if (/getValidityProof|getCompressedAccount|getAddressTreeInfo|prover|photon|compression.*api|404|fetch failed/i.test(haystack)) {
    return {
      kind: "error",
      title: "Compression service unavailable",
      detail:
        "The ZK Compression API could not be reached. Make sure NEXT_PUBLIC_LIGHT_RPC_URL points to a Light/Helius devnet RPC that includes an API key.",
    };
  }

  if (/wallet is not connected|not connected/i.test(haystack)) {
    return {
      kind: "error",
      title: "Wallet not connected",
      detail: "Connect your wallet first, then try again.",
    };
  }

  if (/does not exist|Account does not exist/i.test(haystack)) {
    return {
      kind: "error",
      title: "Proposal not found",
      detail:
        "No proposal exists at that address. Double-check the address you entered.",
    };
  }

  return {
    kind: "error",
    title: "Something went wrong",
    detail:
      raw && raw !== "Unknown error"
        ? raw
        : "An unexpected error occurred. Please try again.",
  };
}

/** Re-export the program error table for debugging panels if needed. */
export const DEBUG_ERROR_TABLE = PROGRAM_ERRORS;
