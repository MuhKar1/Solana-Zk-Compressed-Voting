"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  getProvider,
  getProgram as buildProgram,
  getLightRpc,
  type VoterProgram,
  type LightRpc,
} from "../lib/program";
import type { SignerWallet } from "../lib/wallet";
import type { Banner } from "../lib/types";
import { createSender, type SendFn } from "../lib/send";

/**
 * Combines the wallet-adapter state with the app-specific helpers:
 *  - a user-facing banner for success / error feedback,
 *  - lazily-built Anchor `Program` and Light `Rpc` instances.
 */
interface AppContextValue extends WalletContextState {
  publicKeyString: string | null;
  banner: Banner | null;
  notify: (banner: Banner) => void;
  dismiss: () => void;
  getProgram: () => VoterProgram;
  getRpc: () => LightRpc;
  getSender: () => SendFn;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [banner, setBanner] = useState<Banner | null>(null);

  const adapter = wallet.wallet?.adapter as unknown as SignerWallet | undefined;

  const adapterRef = useRef<SignerWallet | null>(null);
  const programRef = useRef<VoterProgram | null>(null);

  const notify = useCallback((next: Banner) => setBanner(next), []);
  const dismiss = useCallback(() => setBanner(null), []);

  const getProgramSafe = useCallback((): VoterProgram => {
    if (!adapter) {
      throw new Error("Wallet is not connected");
    }
    if (!programRef.current || adapterRef.current !== adapter) {
      adapterRef.current = adapter;
      programRef.current = buildProgram(getProvider(adapter));
    }
    return programRef.current;
  }, [adapter]);

  const getRpcSafe = useCallback((): LightRpc => getLightRpc(), []);

  const getSenderSafe = useCallback((): SendFn => {
    if (!wallet.publicKey) {
      throw new Error("Wallet is not connected");
    }
    return createSender(wallet.sendTransaction, wallet.publicKey);
  }, [wallet]);

  const publicKeyString = wallet.publicKey ? wallet.publicKey.toBase58() : null;

  const value = useMemo<AppContextValue>(
    () => ({
      ...wallet,
      publicKeyString,
      banner,
      notify,
      dismiss,
      getProgram: getProgramSafe,
      getRpc: getRpcSafe,
      getSender: getSenderSafe,
    }),
    [
      wallet,
      publicKeyString,
      banner,
      notify,
      dismiss,
      getProgramSafe,
      getRpcSafe,
      getSenderSafe,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
