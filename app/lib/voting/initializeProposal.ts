import "../polyfills";
import { PublicKey } from "@solana/web3.js";
import { AppError } from "../errors";
import { titleToBytes, proposalPda } from "../derivation";
import type { VoterProgram } from "../program";
import type { SendFn } from "../send";

export interface InitializeProposalInput {
  title: string;
  optionsCount: number;
}

export interface InitializeProposalResult {
  signature: string;
  address: string;
}

export async function initializeProposal(
  program: VoterProgram,
  input: InitializeProposalInput,
  send: SendFn
): Promise<InitializeProposalResult> {
  const title = input.title.trim();
  const optionsCount = input.optionsCount;

  if (!title) {
    throw new AppError(
      "A title is required",
      "Give your proposal a short, descriptive title."
    );
  }
  if (!Number.isInteger(optionsCount) || optionsCount < 2 || optionsCount > 10) {
    throw new AppError(
      "Invalid number of options",
      "A proposal must have between 2 and 10 options."
    );
  }

  const titleBytes = titleToBytes(title);
  const creator = program.provider.wallet.publicKey;
  const pda = proposalPda(creator, titleBytes);

  // The proposal PDA is derived from [creator, title], so reusing a title with
  // the same wallet collides with an existing poll. Check first and surface a
  // friendly error instead of the raw on-chain `AccountAlreadyInUse`
  // (system program custom error 0).
  const existing = await (program.account as any).proposal.fetchNullable(pda);
  if (existing) {
    throw new AppError(
      "Poll already exists",
      "You already created a poll with this title. Use a different title."
    );
  }

  const instruction = await (program.methods as any)
    .initializeProposal(titleBytes, optionsCount)
    .accounts({
      proposal: pda,
      creator,
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    })
    .instruction();

  const signature = await send([instruction]);

  return { signature, address: pda.toBase58() };
}
