"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useApp } from "../../context/AppProvider";
import { useAction } from "../../hooks/useAction";
import { castVote } from "../../lib/voting";
import { getDisplayLabels } from "../../lib/storage";
import type { ProposalAccount } from "../../lib/types";

export function VotePanel({
  poll,
  onDone,
}: {
  poll: ProposalAccount;
  onDone: () => void;
}) {
  const { getProgram, getRpc, getSender } = useApp();
  const { busy, run } = useAction();
  const [candidate, setCandidate] = useState(1);
  const labels = getDisplayLabels(poll.address, poll.optionsCount);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const signature = await run("Cast vote", async () => {
      const sig = await castVote(
        getProgram(),
        getRpc(),
        {
          proposal: poll.address,
          candidateId: candidate,
        },
        getSender()
      );
      return {
        signature: sig,
        title: "Vote recorded",
        detail: `Your vote for "${labels[candidate - 1]}" has been recorded.`,
      };
    });
    if (signature) onDone();
  }

  return (
    <form className="panel form-stack" onSubmit={onSubmit}>
      <h2>Cast your vote</h2>
      <div className="option-list">
        {labels.map((label, index) => {
          const id = index + 1;
          return (
            <label className="option-row" key={id}>
              <input
                type="radio"
                name="candidate"
                checked={candidate === id}
                onChange={() => setCandidate(id)}
                disabled={busy}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
      <button className="primary-button" type="submit" disabled={busy}>
        {busy ? "Voting…" : "Cast vote"}
      </button>
    </form>
  );
}
