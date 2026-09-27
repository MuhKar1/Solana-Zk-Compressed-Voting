import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";
import { AppShell } from "./components/AppShell";

export const metadata: Metadata = {
  title: "ZKC Voter",
  description:
    "Secure, one-ticket-per-voter polls on Solana using ZK Compression.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
