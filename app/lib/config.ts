/**
 * Global application configuration.
 *
 * All values that could change between environments are exposed through
 * `NEXT_PUBLIC_*` environment variables so the same build can target
 * localnet, devnet or mainnet without code changes.
 */

/** The deployed `zkc_voter` program address. */
export const PROGRAM_ID = "D8E4AStuNybRhwSe2RDhQkVxoooKJDvphFmqnPBjSYkW";

/** Human friendly cluster label (used for explorer links and copy). */
export const CLUSTER = "devnet";

/** Confirmation level used for reads and transaction confirmation. */
export const COMMITMENT = "confirmed" as const;

/**
 * Solana RPC used for ordinary on-chain reads and transaction submission.
 * Defaults to the public Solana devnet endpoint.
 */
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

/**
 * RPC endpoint used by the Light / ZK Compression SDK.
 *
 * ZK Compression (minting tickets, casting votes) requires a Light/Helius RPC
 * that serves the Photon indexer and the prover. On devnet this is typically:
 *
 *   https://devnet.helius-rpc.com?api-key=YOUR_HELIUS_API_KEY
 *
 * The plain `api.devnet.solana.com` endpoint does NOT support the compression
 * JSON-RPC methods, so set `NEXT_PUBLIC_LIGHT_RPC_URL` explicitly for the
 * compressed flows to work.
 */
export const LIGHT_RPC_URL =
  process.env.NEXT_PUBLIC_LIGHT_RPC_URL ?? SOLANA_RPC_URL;

/**
 * Prover endpoint used to generate validity proofs. The Helius RPC bundles a
 * prover, so it defaults to the Light RPC URL.
 */
export const PROVER_URL =
  process.env.NEXT_PUBLIC_LIGHT_PROVER_URL ?? LIGHT_RPC_URL;

/** Compute budget applied to the compressed instructions. */
export const COMPUTE_UNITS = 1_000_000;

/** Build a Solana explorer URL for a transaction signature. */
export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}
