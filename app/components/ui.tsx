"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export function Badge({
  tone,
  children,
}: {
  tone?: "success" | "danger" | "muted";
  children: ReactNode;
}) {
  const cls =
    tone === "success"
      ? "badge badge-open"
      : tone === "danger"
        ? "badge badge-closed"
        : "badge";
  return <span className={cls}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-row">
      <span className="spinner" aria-hidden />
      {label ? <span className="hint">{label}</span> : null}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard unavailable — ignore.
    }
  }

  return (
    <button className="ghost-button" onClick={copy} type="button">
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label>
      {label}
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}
