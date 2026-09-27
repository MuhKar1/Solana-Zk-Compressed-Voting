"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { PublicKey } from "@solana/web3.js";
import { useApp } from "../../context/AppProvider";
import { useAction } from "../../hooks/useAction";
import { mintTickets, closeVote } from "../../lib/voting";
import { deriveTicketAddress } from "../../lib/derivation";
import { Field } from "../ui";
import type { ProposalAccount } from "../../lib/types";

interface MintedTicket {
  voter: string;
  ticket: string;
}

export function AdminPanel({
  poll,
  onDone,
}: {
  poll: ProposalAccount;
  onDone: () => void;
}) {
  const { getProgram, getRpc, getSender } = useApp();
  const { busy, run } = useAction();
  const [raw, setRaw] = useState("");
  const [minted, setMinted] = useState<MintedTicket[]>([]);

  const parsed = useMemo(() => {
    // Extract base58 tokens so pasted lists work regardless of separators,
    // stray punctuation, or trailing whitespace. De-duplicated to avoid
    // minting the same wallet twice in one transaction.
    const tokens = raw.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? [];
    const valid: PublicKey[] = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      try {
        const pk = new PublicKey(token);
        const key = pk.toBase58();
        if (!seen.has(key)) {
          seen.add(key);
          valid.push(pk);
        }
      } catch {
        // Skip malformed tokens.
      }
    }
    return { valid };
  }, [raw]);

  async function onMint(event: FormEvent) {
    event.preventDefault();
    setMinted([]);
    const voters = parsed.valid;
    const signature = await run("Mint tickets", async () => {
      const program = getProgram();
      const rpc = getRpc();
      const { signature, txCount } = await mintTickets(
        program,
        rpc,
        {
          proposal: poll.address,
          voters: voters.map((voter) => voter.toBase58()),
        },
        getSender()
      );

      const proposal = new PublicKey(poll.address);
      const tickets: MintedTicket[] = [];
      try {
        for (const voter of voters) {
          const ticket = await deriveTicketAddress(rpc, proposal, voter);
          tickets.push({ voter: voter.toBase58(), ticket: ticket.toBase58() });
        }
      } catch {
        // Deriving ticket addresses is display-only; a failure here shouldn't
        // hide a successful mint.
      }
      setMinted(tickets);

      const noun = voters.length === 1 ? "ticket" : "tickets";
      const inTxs = txCount > 1 ? ` across ${txCount} transactions` : "";
      return {
        signature,
        title: "Tickets minted",
        detail: `Minted ${voters.length} ${noun}${inTxs}.`,
      };
    });
    if (signature) onDone();
  }

  async function onClose() {
    const signature = await run("Close poll", async () => {
      const sig = await closeVote(
        getProgram(),
        { proposal: poll.address },
        getSender()
      );
      return {
        signature: sig,
        title: "Poll closed",
        detail: "Voting is now closed for this poll.",
      };
    });
    if (signature) onDone();
  }

  return (
    <section className="panel form-stack">
      <h2>Admin</h2>
      <p className="hint">You created this poll.</p>

      <form className="form-stack" onSubmit={onMint}>
        <Field label="Voter wallets (one per line or comma-separated)">
          <textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={4}
            placeholder={"Wallet1…\nWallet2…"}
            disabled={busy || poll.isClosed}
          />
        </Field>

        {raw.trim().length > 0 && parsed.valid.length === 0 && (
          <p className="hint">No valid wallet addresses found.</p>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={busy || poll.isClosed || parsed.valid.length === 0}
        >
          {busy
            ? "Minting…"
            : `Mint ${parsed.valid.length} ticket${parsed.valid.length === 1 ? "" : "s"}`}
        </button>
      </form>

      {minted.length > 0 && (
        <div className="ticket-table">
          <p className="hint">Minted ticket addresses:</p>
          {minted.map((item) => (
            <div className="ticket-row" key={item.voter}>
              <span className="mono" title={item.voter}>
                {item.voter.slice(0, 8)}…
              </span>
              <span className="mono" title={item.ticket}>
                {item.ticket.slice(0, 12)}…
              </span>
            </div>
          ))}
        </div>
      )}

      {!poll.isClosed && (
        <button className="ghost-button" onClick={onClose} disabled={busy}>
          {busy ? "Closing…" : "Close poll"}
        </button>
      )}
    </section>
  );
}
