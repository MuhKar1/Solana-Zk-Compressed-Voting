"use client";

import Link from "next/link";
import type { ProposalAccount } from "../../lib/types";
import { Badge } from "../ui";

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function PollCard({ poll }: { poll: ProposalAccount }) {
  const leadingIndex =
    poll.totalVotes > 0
      ? poll.votes
          .slice(0, poll.optionsCount)
          .indexOf(Math.max(...poll.votes.slice(0, poll.optionsCount)))
      : -1;

  return (
    <Link className="poll-card" href={`/polls/${poll.address}`}>
      <div className="poll-card-top">
        <h3>{poll.title || "Untitled poll"}</h3>
        <Badge tone={poll.isClosed ? "danger" : "success"}>
          {poll.isClosed ? "Closed" : "Open"}
        </Badge>
      </div>
      <p className="poll-card-meta">
        {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
        {leadingIndex >= 0 ? ` · leading: Option ${leadingIndex + 1}` : ""}
      </p>
      <p className="poll-card-meta muted">
        creator {shorten(poll.creator)} · {shorten(poll.address)}
      </p>
    </Link>
  );
}
