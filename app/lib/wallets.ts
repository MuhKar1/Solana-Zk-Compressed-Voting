import type { Adapter } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { CoinbaseWalletAdapter } from "@solana/wallet-adapter-coinbase";
import { TrustWalletAdapter } from "@solana/wallet-adapter-trust";
import { GlowWalletAdapter } from "@solana/wallet-adapter-glow";

/**
 * The wallets this app supports.
 *
 * Each adapter scans `window` for its injected wallet API when constructed, so
 * they must only ever be created in the browser. We build the list once and
 * cache it for the lifetime of the page. On the server (SSR) we return an
 * empty list — the real adapters are created during client hydration.
 */
let adapters: Adapter[] | null = null;

export function getWalletAdapters(): Adapter[] {
  if (typeof window === "undefined") {
    return [];
  }

  if (!adapters) {
    adapters = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new TrustWalletAdapter(),
      new GlowWalletAdapter(),
    ];
  }

  return adapters;
}
