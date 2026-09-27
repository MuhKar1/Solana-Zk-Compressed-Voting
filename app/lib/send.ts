import { Transaction } from "@solana/web3.js";
import type {
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { getConnection } from "./program";
import { AppError } from "./errors";

/** Sends a batch of instructions and returns the confirmed signature. */
export type SendFn = (instructions: TransactionInstruction[]) => Promise<string>;

/**
 * Builds a sender that signs + submits via the connected wallet adapter and
 * confirms using a freshly-fetched blockhash.
 *
 * We deliberately use the wallet adapter's `sendTransaction` (which signs and
 * submits in one step) instead of Anchor's `.rpc()`.
 */
export function createSender(
  sendTransaction: (
    tx: Transaction,
    connection: Connection,
    options?: { skipPreflight?: boolean }
  ) => Promise<string>,
  publicKey: PublicKey
): SendFn {
  return async (instructions) => {
    const connection = getConnection();
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    const tx = new Transaction({
      feePayer: publicKey,
      recentBlockhash: blockhash,
    }).add(...instructions);

    const signature = await sendTransaction(tx, connection, {
      skipPreflight: true,
    });

    const confirmation = connection.confirmTransaction(
      { blockhash, lastValidBlockHeight, signature },
      "confirmed"
    );

    // Fail fast with a friendly message instead of hanging forever.
    const result = await Promise.race([
      confirmation,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new AppError(
                "Still confirming",
                "Your transaction is taking a while to confirm. Check your wallet, then try again."
              )
            ),
          45000
        )
      ),
    ]);

    // `confirmTransaction` RESOLVES (rather than rejects) when the transaction
    // is confirmed *with an error*, so we must inspect the result ourselves.
    if (result.value.err) {
      throw toProgramError(result.value.err);
    }

    return signature;
  };
}

/**
 * Convert a confirmed-but-failed transaction result into an Error that the
 * `errors.ts` layer can map to a friendly message (it carries the Anchor
 * custom error code when present).
 */
function toProgramError(txErr: unknown): Error & { code?: number } {
  const e = txErr as {
    Custom?: number;
    InstructionError?: [number, { Custom?: number }];
  };

  let code: number | null = null;
  if (typeof e?.Custom === "number") code = e.Custom;
  const inner = e?.InstructionError?.[1];
  if (inner && typeof inner.Custom === "number") code = inner.Custom;

  const error = new Error(
    code != null
      ? `Transaction rejected by the program (error ${code}).`
      : `Transaction failed: ${JSON.stringify(txErr)}`
  ) as Error & { code?: number };

  if (code != null) error.code = code;
  return error;
}
