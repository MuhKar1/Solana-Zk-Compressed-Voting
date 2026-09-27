"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../../context/AppProvider";
import { initializeProposal } from "../../lib/voting";
import { saveOptionLabels } from "../../lib/storage";
import { toFriendlyError } from "../../lib/errors";
import { Field } from "../ui";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

export function CreatePollForm() {
  const { connected, getProgram, getSender, notify } = useApp();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", ""]);
  const [busy, setBusy] = useState(false);

  function setOption(index: number, value: string) {
    setOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
  }

  function addOption() {
    setOptions((prev) => (prev.length < MAX_OPTIONS ? [...prev, ""] : prev));
  }

  function removeOption(index: number) {
    setOptions((prev) =>
      prev.length > MIN_OPTIONS ? prev.filter((_, i) => i !== index) : prev
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      notify({
        kind: "error",
        title: "A title is required",
        detail: "Give your poll a short, descriptive title.",
      });
      return;
    }

    setBusy(true);
    try {
      const program = getProgram();
      const { signature, address } = await initializeProposal(
        program,
        {
          title: trimmed,
          optionsCount: options.length,
        },
        getSender()
      );
      saveOptionLabels(
        address,
        options.map((option) => option.trim())
      );
      notify({
        kind: "success",
        title: "Poll created",
        detail: `“${trimmed}” is live.`,
        txSignature: signature,
      });
      router.push(`/polls/${address}`);
    } catch (err) {
      notify(toFriendlyError(err, "Create poll"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form-stack" onSubmit={onSubmit}>
      <h2>New poll</h2>

      <Field label="Title" hint="Up to 32 bytes.">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Community budget 2026"
          maxLength={32}
          disabled={busy}
        />
      </Field>

      <div className="form-stack">
        <span className="field-label">Options ({options.length})</span>
        {options.map((option, index) => (
          <div className="option-edit-row" key={index}>
            <input
              value={option}
              onChange={(event) => setOption(index, event.target.value)}
              placeholder={`Option ${index + 1}`}
              disabled={busy}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => removeOption(index)}
              disabled={busy || options.length <= MIN_OPTIONS}
              aria-label="Remove option"
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="ghost-button"
          type="button"
          onClick={addOption}
          disabled={busy || options.length >= MAX_OPTIONS}
        >
          + Add option
        </button>
      </div>

      <button className="primary-button" type="submit" disabled={!connected || busy}>
        {busy ? "Creating…" : "Create poll"}
      </button>
      {!connected && (
        <p className="hint">Connect your wallet to create a poll.</p>
      )}
    </form>
  );
}
