"use client";

import type { ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { getWalletAdapters } from "./lib/wallets";
import { SOLANA_RPC_URL } from "./lib/config";
import { AppProvider } from "./context/AppProvider";

/**
 * Shared client providers. Rendered once in the root layout so the wallet
 * connection and program/RPC instances persist across route navigation.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={getWalletAdapters()} autoConnect>
        <AppProvider>{children}</AppProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
