import "../polyfills";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import {
  bn,
  PackedAccounts,
  SystemAccountMetaConfig,
  deriveAddressSeedV2,
  deriveAddressV2,
} from "@lightprotocol/stateless.js";
import { PROGRAM_ID, COMPUTE_UNITS } from "../config";
import type { VoterProgram, LightRpc } from "../program";
import type { SendFn } from "../send";
import { AppError } from "../errors";
import { parsePublicKey } from "./common";

const programId = new PublicKey(PROGRAM_ID);

export interface CastVoteInput {
  proposal: string;
  candidateId: number;
}

export async function castVote(
  program: VoterProgram,
  rpc: LightRpc,
  input: CastVoteInput,
  send: SendFn
): Promise<string> {
  const proposal = parsePublicKey(input.proposal, "proposal address");
  const voter = program.provider.wallet.publicKey;
  const candidate = input.candidateId;

  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 10) {
    throw new AppError(
      "Invalid option",
      "Pick an option number between 1 and 10."
    );
  }

  const addressTree = await rpc.getAddressTreeInfoV2();

  const ticketSeed = deriveAddressSeedV2([
    Buffer.from("voter_ticket"),
    proposal.toBuffer(),
    voter.toBuffer(),
  ]);
  const ticketAddress = deriveAddressV2(ticketSeed, addressTree.tree, programId);

  const compressedAccount = await rpc.getCompressedAccount(
    bn(ticketAddress.toBytes())
  );

  if (!compressedAccount) {
    throw new AppError(
      "No voter ticket found",
      "This wallet doesn't have a ticket for this proposal. Ask the proposal creator to mint one for you."
    );
  }

  const voteRecordSeed = deriveAddressSeedV2([
    Buffer.from("vote_record"),
    proposal.toBuffer(),
    voter.toBuffer(),
  ]);
  const voteRecordAddress = deriveAddressV2(
    voteRecordSeed,
    addressTree.tree,
    programId
  );

  const proof = await rpc.getValidityProofV0(
    [
      {
        hash: compressedAccount.hash,
        tree: compressedAccount.treeInfo.tree,
        queue: compressedAccount.treeInfo.queue,
      },
    ],
    [
      {
        address: bn(voteRecordAddress.toBytes()),
        tree: addressTree.tree,
        queue: addressTree.queue,
      },
    ]
  );

  const packed = new PackedAccounts();
  packed.addSystemAccounts(SystemAccountMetaConfig.new(programId));

  const stateTreeIndex = packed.insertOrGet(compressedAccount.treeInfo.tree);
  const stateQueueIndex = packed.insertOrGet(compressedAccount.treeInfo.queue);
  const outputStateTreeIndex = stateQueueIndex;
  const addressTreeIndex = packed.insertOrGet(addressTree.tree);
  const addressQueueIndex = packed.insertOrGet(addressTree.queue);

  const { remainingAccounts } = packed.toAccountMetas();

  const ticketMeta = {
    treeInfo: {
      rootIndex: proof.rootIndices[0],
      proveByIndex: true,
      merkleTreePubkeyIndex: stateTreeIndex,
      queuePubkeyIndex: stateQueueIndex,
      leafIndex: compressedAccount.leafIndex,
    },
    address: compressedAccount.address,
    outputStateTreeIndex,
  };

  const ticket = { proposal, voter };

  const validityProof = {
    0: proof.compressedProof
      ? {
          a: proof.compressedProof.a,
          b: proof.compressedProof.b,
          c: proof.compressedProof.c,
        }
      : null,
  };

  const addressTreeInfo = {
    rootIndex: proof.rootIndices[proof.rootIndices.length - 1],
    addressMerkleTreePubkeyIndex: addressTreeIndex,
    addressQueuePubkeyIndex: addressQueueIndex,
  };

  const instruction = await (program.methods as any)
    .castVote(
      validityProof,
      ticketMeta,
      ticket,
      addressTreeInfo,
      outputStateTreeIndex,
      candidate
    )
    .accounts({ voter, proposal })
    .remainingAccounts(remainingAccounts)
    .instruction();

  return await send([
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    instruction,
  ]);
}
