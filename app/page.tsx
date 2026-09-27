"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "./context/AppProvider";
import { usePolls } from "./hooks/usePolls";
import { PollCard } from "./components/polls/PollCard";
import { HowItWorks } from "./components/HowItWorks";
import { EmptyState, Spinner } from "./components/ui";
import { CLUSTER } from "./lib/config";

type Filter = "all" | "mine";

export default function HomePage() {
  const { polls, loading, error, refresh } = usePolls();
  const { connected, publicKey } = useApp();
  const [filter, setFilter] = useState<Filter>("all");

  const mine = publicKey ? publicKey.toBase58() : null;
  const visible =
    filter === "mine" && mine
      ? polls.filter((poll) => poll.creator === mine)
      : polls;

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Solana governance · {CLUSTER}</p>
          <h1>ZKC Voter</h1>
          <p className="subtitle">
            One ticket per voter, tallied on-chain with ZK Compression.
          </p>
        </div>
        <Link className="primary-button" href="/polls/new">
          Create poll
        </Link>
      </section>

      <section className="panel">
        <div className="list-header">
          <h2>Polls</h2>
          <div className="list-actions">
            <div className="filters">
              <button
                className={`chip${filter === "all" ? " chip-active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                className={`chip${filter === "mine" ? " chip-active" : ""}`}
                onClick={() => setFilter("mine")}
                disabled={!connected}
              >
                Mine
              </button>
            </div>
            <button className="ghost-button" onClick={refresh} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <EmptyState title="Couldn't load polls" detail={error.detail} />
        ) : loading ? (
          <Spinner label="Loading polls…" />
        ) : visible.length === 0 ? (
          <EmptyState
            title={
              filter === "mine"
                ? "You haven't created any polls"
                : "No polls yet"
            }
            detail={
              filter === "mine"
                ? "Polls you create will appear here."
                : "Create the first poll to get started."
            }
          />
        ) : (
          <div className="poll-grid">
            {visible.map((poll) => (
              <PollCard key={poll.address} poll={poll} />
            ))}
          </div>
        )}
      </section>

      <HowItWorks />
    </>
  );
}
