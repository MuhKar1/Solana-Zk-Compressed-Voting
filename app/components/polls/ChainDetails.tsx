"use client";

import { useState } from "react";
import type { ProposalAccount, VoterStatus } from "../../lib/types";
import { PROGRAM_ID } from "../../lib/config";

export function ChainDetails({
  poll,
  status,
}: {
  poll: ProposalAccount;
  status: VoterStatus;
}) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Proposal PDA", value: poll.address, mono: true },
    { label: "Creator", value: poll.creator, mono: true },
    { label: "Program", value: PROGRAM_ID, mono: true },
    { label: "Options", value: String(poll.optionsCount) },
    { label: "Total votes", value: String(poll.totalVotes) },
    { label: "Bump", value: String(poll.bump) },
    { label: "Status", value: poll.isClosed ? "Closed" : "Open" },
  ];
  if (status.ticketAddress) {
    rows.push({ label: "Your ticket", value: status.ticketAddress, mono: true });
  }
  if (status.voteRecordAddress) {
    rows.push({
      label: "Your vote record",
      value: status.voteRecordAddress,
      mono: true,
    });
  }

  return (
    <section className="panel">
      <button
        className="details-toggle"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="details-title">On-chain details</span>
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="details-grid">
          {rows.map((row) => (
            <div className="details-row" key={row.label}>
              <span>{row.label}</span>
              <strong className={row.mono ? "mono" : ""}>{row.value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
