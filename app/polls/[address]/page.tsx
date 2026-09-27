"use client";

import Link from "next/link";
import { usePoll } from "../../hooks/usePoll";
import { useVoterStatus } from "../../hooks/useVoterStatus";
import { useApp } from "../../context/AppProvider";
import { ResultsBars } from "../../components/polls/ResultsBars";
import { VoterStatusCard } from "../../components/polls/VoterStatusCard";
import { VotePanel } from "../../components/polls/VotePanel";
import { AdminPanel } from "../../components/polls/AdminPanel";
import { ChainDetails } from "../../components/polls/ChainDetails";
import { Badge, CopyButton, EmptyState, Spinner } from "../../components/ui";

export default function PollDetailPage({
  params,
}: {
  params: { address: string };
}) {
  const address = params.address;
  const { connected, publicKey } = useApp();
  const { poll, loading, error, refresh } = usePoll(address);
  const status = useVoterStatus(address, publicKey);

  if (loading) {
    return <Spinner label="Loading poll…" />;
  }
  if (error) {
    return <EmptyState title="Couldn't load this poll" detail={error.detail} />;
  }
  if (!poll) {
    return (
      <EmptyState title="Poll not found" detail="No poll exists at this address." />
    );
  }

  const isAdmin =
    connected && publicKey && publicKey.toBase58() === poll.creator;
  const canVote =
    connected && !poll.isClosed && status.hasTicket && !status.hasVoted;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/polls/${poll.address}`
      : "";

  function onDone() {
    refresh();
    status.refresh();
  }

  return (
    <div>
      <Link href="/" className="back-link">
        ← All polls
      </Link>

      <section className="panel detail-header">
        <div className="detail-header-main">
          <h1>{poll.title || "Untitled poll"}</h1>
          <div className="detail-header-meta">
            <Badge tone={poll.isClosed ? "danger" : "success"}>
              {poll.isClosed ? "Closed" : "Open"}
            </Badge>
            <span className="hint">
              {poll.totalVotes} total vote{poll.totalVotes === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="detail-header-actions">
          <CopyButton text={poll.address} label="Copy address" />
          {shareUrl ? <CopyButton text={shareUrl} label="Copy link" /> : null}
        </div>
      </section>

      <div className="detail-grid">
        <div className="col">
          <ResultsBars poll={poll} />
          <VoterStatusCard status={status} />
          {canVote ? <VotePanel poll={poll} onDone={onDone} /> : null}
        </div>
        <div className="col">
          {isAdmin ? <AdminPanel poll={poll} onDone={onDone} /> : null}
          <ChainDetails poll={poll} status={status} />
        </div>
      </div>
    </div>
  );
}
