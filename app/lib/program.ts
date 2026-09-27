import "./polyfills";
import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { createRpc, featureFlags, VERSION } from "@lightprotocol/stateless.js";
import { IDL } from "./idl";
import type { SignerWallet } from "./wallet";
import {
  SOLANA_RPC_URL,
  LIGHT_RPC_URL,
  PROVER_URL,
  COMMITMENT,
} from "./config";

// Force V2 mode (batched Merkle trees). stateless.js 0.23.x already defaults to
// V2, but we make the constraint explicit so the proof layout can't silently
// flip back to V1 with a future SDK upgrade. Without V2, consume proofs are
// decoded with empty input roots and `cast_vote` fails with 0x179b.
(featureFlags as any).version = VERSION.V2;

export type VoterProgram = anchor.Program;
export type LightRpc = ReturnType<typeof createRpc>;

/** A plain Solana connection used for ordinary reads and submission. */
export function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, COMMITMENT);
}

/** Build an Anchor provider around a connected wallet. */
export function getProvider(wallet: SignerWallet): anchor.AnchorProvider {
  return new anchor.AnchorProvider(getConnection(), wallet, {
    commitment: COMMITMENT,
    preflightCommitment: "processed",
    skipPreflight: true,
  });
}

/** Build the typed `zkc_voter` program client. */
export function getProgram(provider: anchor.AnchorProvider): VoterProgram {
  // The program address is taken from `IDL.address`.
  return new anchor.Program(IDL, provider);
}

/** A wallet that can never sign — used only for read-only account fetches. */
function readOnlyWallet(): SignerWallet {
  const keypair = anchor.web3.Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T
    ) => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      txs: T[]
    ) => txs,
  };
}

/**
 * A read-only program client that needs no connected wallet. Used to view
 * proposal state without asking the user to connect first.
 */
export function getReadProgram(): VoterProgram {
  const provider = new anchor.AnchorProvider(
    getConnection(),
    readOnlyWallet(),
    { commitment: COMMITMENT }
  );
  return new anchor.Program(IDL, provider);
}

let lightRpc: LightRpc | null = null;

/**
 * Light / ZK Compression RPC.
 *
 * The first argument is the Solana connection, the second is the compression
 * (Photon) API and the third is the prover. On devnet all three are usually
 * served by the same Helius endpoint configured in `LIGHT_RPC_URL`.
 */
export function getLightRpc(): LightRpc {
  if (!lightRpc) {
    lightRpc = createRpc(LIGHT_RPC_URL, LIGHT_RPC_URL, PROVER_URL);
  }
  return lightRpc;
}
