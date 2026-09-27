"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { WalletConnect } from "./WalletConnect";
import { StatusBanner } from "./StatusBanner";

/** Persistent top bar + global status banner, shared by every page. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            ZKC Voter
          </Link>
          <WalletConnect />
        </div>
      </header>
      <div className="page-shell">
        <StatusBanner />
        {children}
      </div>
    </>
  );
}
