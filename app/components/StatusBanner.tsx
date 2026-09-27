"use client";

import { useApp } from "../context/AppProvider";
import { explorerTxUrl } from "../lib/config";

export function StatusBanner() {
  const { banner, dismiss } = useApp();

  if (!banner) return null;

  return (
    <div className={`banner banner-${banner.kind}`} role="status">
      <div className="banner-body">
        <strong>{banner.title}</strong>
        {banner.detail && <p>{banner.detail}</p>}
        {banner.txSignature && (
          <a
            href={explorerTxUrl(banner.txSignature)}
            target="_blank"
            rel="noreferrer"
          >
            View transaction on Solana Explorer ↗
          </a>
        )}
      </div>
      <button
        className="banner-close"
        onClick={dismiss}
        aria-label="Dismiss message"
      >
        ×
      </button>
    </div>
  );
}
