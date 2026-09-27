import "../polyfills";
import type { VoterProgram } from "../program";
import type { SendFn } from "../send";
import { parsePublicKey } from "./common";

export interface CloseVoteInput {
  proposal: string;
}

export async function closeVote(
  program: VoterProgram,
  input: CloseVoteInput,
  send: SendFn
): Promise<string> {
  const proposal = parsePublicKey(input.proposal, "proposal address");

  const instruction = await (program.methods as any)
    .closeVote()
    .accounts({
      admin: program.provider.wallet.publicKey,
      proposal,
    })
    .instruction();

  return await send([instruction]);
}
