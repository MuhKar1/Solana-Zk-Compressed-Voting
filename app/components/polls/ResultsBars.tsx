"use client";

import type { ProposalAccount } from "../../lib/types";
import { getDisplayLabels } from "../../lib/storage";

export function ResultsBars({ poll }: { poll: ProposalAccount }) {
  const labels = getDisplayLabels(poll.address, poll.optionsCount);

  return (
    <section className="panel">
      <h2>Results</h2>
      <div className="vote-list">
        {poll.votes.slice(0, poll.optionsCount).map((count, index) => {
          const percentage =
            poll.totalVotes > 0
              ? Math.round((count / poll.totalVotes) * 100)
              : 0;
          return (
            <div className="vote-row" key={index}>
              <span className="vote-label">{labels[index]}</span>
              <div className="vote-track">
                <div
                  className="vote-fill"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="vote-count">
                {count} · {percentage}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
