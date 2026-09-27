"use client";

import { useApp } from "../../context/AppProvider";
import type { VoterStatus } from "../../lib/types";
import { Spinner } from "../ui";

export function VoterStatusCard({ status }: { status: VoterStatus }) {
  const { connected } = useApp();

  if (!connected) {
    return (
      <section className="panel">
        <h2>Your vote</h2>
        <p className="hint">Connect your wallet to check if you can vote.</p>
      </section>
    );
  }

  if (status.checking) {
    return (
      <section className="panel">
        <h2>Your vote</h2>
        <Spinner label="Checking your ticket…" />
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Your vote</h2>
      {status.hasVoted ? (
        <p className="hint">You have already voted in this poll.</p>
      ) : status.hasTicket ? (
        <p className="hint">You have a voter ticket — cast your vote below.</p>
      ) : (
        <p className="hint">
          You don&apos;t have a ticket for this poll. Ask the poll admin to mint
          one for your wallet.
        </p>
      )}
    </section>
  );
}
