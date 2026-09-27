import type {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

/**
 * The wallet shape Anchor's `AnchorProvider` expects.
 *
 * Kept local because `@coral-xyz/anchor` exports a concrete `Wallet` class
 * (which requires a `payer` keypair) rather than this interface. Any
 * `@solana/wallet-adapter` adapter satisfies this shape, which lets us pass
 * it straight into Anchor.
 */
export interface SignerWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]>;
}
