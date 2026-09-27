import "../polyfills";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  bn,
  PackedAccounts,
  SystemAccountMetaConfig,
  selectStateTreeInfo,
  deriveAddressSeedV2,
  deriveAddressV2,
} from "@lightprotocol/stateless.js";
import { PROGRAM_ID } from "../config";
import type { VoterProgram, LightRpc } from "../program";
import type { SendFn } from "../send";
import { AppError } from "../errors";
import { parsePublicKey } from "./common";

const programId = new PublicKey(PROGRAM_ID);

/**
 * Tickets minted per transaction. Batch minting is compute-heavy (each new
 * compressed account adds to the ZK proof + tree updates), so we split large
 * lists into smaller transactions to stay within limits.
 */
const BATCH_SIZE = 3;

/** Max compute budget for a single mint transaction. */
const MINT_COMPUTE_UNITS = 1_400_000;

export interface MintTicketsInput {
  proposal: string;
  voters: string[];
}

export interface MintTicketsResult {
  signature: string;
  txCount: number;
}

export async function mintTickets(
  program: VoterProgram,
  rpc: LightRpc,
  input: MintTicketsInput,
  send: SendFn
): Promise<MintTicketsResult> {
  const proposal = parsePublicKey(input.proposal, "proposal address");
  const voters = input.voters.map((v) => parsePublicKey(v, "voter address"));

  if (voters.length === 0) {
    throw new AppError(
      "No voters provided",
      "Enter at least one voter wallet address to mint a ticket for."
    );
  }

  const chunks: PublicKey[][] = [];
  for (let i = 0; i < voters.length; i += BATCH_SIZE) {
    chunks.push(voters.slice(i, i + BATCH_SIZE));
  }

  let lastSignature = "";
  for (const chunk of chunks) {
    lastSignature = await mintBatch(program, rpc, proposal, chunk, send);
  }

  return { signature: lastSignature, txCount: chunks.length };
}

async function mintBatch(
  program: VoterProgram,
  rpc: LightRpc,
  proposal: PublicKey,
  voters: PublicKey[],
  send: SendFn
): Promise<string> {
  const addressTree = await rpc.getAddressTreeInfoV2();

  const addresses = voters.map((voter) => {
    const seed = deriveAddressSeedV2([
      Buffer.from("voter_ticket"),
      proposal.toBuffer(),
      voter.toBuffer(),
    ]);
    const address = deriveAddressV2(seed, addressTree.tree, programId);
    return { address, seed };
  });

  const proof = await rpc.getValidityProofV0(
    [],
    addresses.map((item) => ({
      address: bn(item.address.toBytes()),
      tree: addressTree.tree,
      queue: addressTree.queue,
    }))
  );

  const packedAccounts = new PackedAccounts();
  packedAccounts.addSystemAccounts(SystemAccountMetaConfig.new(programId));

  const addressTreeIndex = packedAccounts.insertOrGet(addressTree.tree);
  const addressQueueIndex = packedAccounts.insertOrGet(addressTree.queue);

  const stateTrees = await rpc.getStateTreeInfos();
  const outputStateTree = selectStateTreeInfo(stateTrees);
  const outputStateTreeIndex = packedAccounts.insertOrGet(outputStateTree.queue);

  const { remainingAccounts } = packedAccounts.toAccountMetas();

  const addressTreeInfo = {
    rootIndex: proof.rootIndices[0],
    addressMerkleTreePubkeyIndex: addressTreeIndex,
    addressQueuePubkeyIndex: addressQueueIndex,
  };

  const validityProof = {
    0: {
      a: proof.compressedProof.a,
      b: proof.compressedProof.b,
      c: proof.compressedProof.c,
    },
  };

  const signer = program.provider.wallet.publicKey;

  const instruction = await (program.methods as any)
    .mintVoterTickets(
      validityProof,
      addressTreeInfo,
      outputStateTreeIndex,
      voters
    )
    .accounts({ signer, proposal })
    .remainingAccounts(remainingAccounts)
    .instruction();

  return await send([
    ComputeBudgetProgram.setComputeUnitLimit({ units: MINT_COMPUTE_UNITS }),
    instruction,
  ]);
}
