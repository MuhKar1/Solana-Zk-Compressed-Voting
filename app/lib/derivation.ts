import "./polyfills";
import { PublicKey } from "@solana/web3.js";
import {
  deriveAddressSeedV2,
  deriveAddressV2,
} from "@lightprotocol/stateless.js";
import { PROGRAM_ID } from "./config";
import type { LightRpc } from "./program";

const programId = new PublicKey(PROGRAM_ID);

/** Encode a human title into the fixed 32-byte array the program expects. */
export function titleToBytes(title: string): number[] {
  const buffer = Buffer.alloc(32);
  Buffer.from(title, "utf8").subarray(0, 32).copy(buffer);
  return Array.from(buffer);
}

/** Decode the 32-byte title, trimming trailing zero bytes. */
export function titleFromBytes(bytes: number[] | Uint8Array): string {
  const arr = Array.from(bytes);
  let end = arr.length;
  while (end > 0 && arr[end - 1] === 0) end -= 1;
  return Buffer.from(arr.slice(0, end)).toString("utf8");
}

/**
 * Derive the canonical proposal PDA:
 * `[b"proposal", creator, title_bytes]`.
 */
export function proposalPda(
  creator: PublicKey,
  titleBytes: number[]
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), creator.toBuffer(), Buffer.from(titleBytes)],
    programId
  )[0];
}

/**
 * Derive the deterministic compressed VoterTicket address:
 * `[b"voter_ticket", proposal, voter]`.
 */
export async function deriveTicketAddress(
  rpc: LightRpc,
  proposal: PublicKey,
  voter: PublicKey
): Promise<PublicKey> {
  const addressTree = await rpc.getAddressTreeInfoV2();
  const seed = deriveAddressSeedV2([
    Buffer.from("voter_ticket"),
    proposal.toBuffer(),
    voter.toBuffer(),
  ]);
  return deriveAddressV2(seed, addressTree.tree, programId);
}

/**
 * Derive the deterministic compressed VoteRecord address:
 * `[b"vote_record", proposal, voter]`.
 */
export async function deriveVoteRecordAddress(
  rpc: LightRpc,
  proposal: PublicKey,
  voter: PublicKey
): Promise<PublicKey> {
  const addressTree = await rpc.getAddressTreeInfoV2();
  const seed = deriveAddressSeedV2([
    Buffer.from("vote_record"),
    proposal.toBuffer(),
    voter.toBuffer(),
  ]);
  return deriveAddressV2(seed, addressTree.tree, programId);
}
