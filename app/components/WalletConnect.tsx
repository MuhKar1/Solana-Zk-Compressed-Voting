"use client";

import { useEffect, useRef, useState } from "react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { Adapter, WalletName } from "@solana/wallet-adapter-base";
import { useApp } from "../context/AppProvider";
import { toFriendlyError } from "../lib/errors";

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletConnect() {
  const {
    wallets,
    select,
    disconnect,
    connected,
    connecting,
    publicKeyString,
    notify,
  } = useApp();

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onPointer(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const detected = wallets.filter(
    (wallet) => wallet.readyState === WalletReadyState.Installed
  );
  const loadable = wallets.filter(
    (wallet) => wallet.readyState === WalletReadyState.Loadable
  );
  const notDetected = wallets.filter(
    (wallet) => wallet.readyState === WalletReadyState.NotDetected
  );

  async function pick(walletName: WalletName) {
    const found = wallets.find((wallet) => wallet.adapter.name === walletName);
    if (!found) return;

    select(walletName);
    setPending(walletName);
    try {
      await found.adapter.connect();
      setOpen(false);
    } catch (err) {
      notify(toFriendlyError(err, "Could not connect wallet"));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="wallet-pill">
      {connected && publicKeyString ? (
        <>
          <span className="dot dot-online" aria-hidden />
          <span className="wallet-address" title={publicKeyString}>
            {shortAddress(publicKeyString)}
          </span>
          <button className="ghost-button" onClick={() => void disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <button
          className="primary-button"
          onClick={() => setOpen(true)}
          disabled={connecting}
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      )}

      {open && (
        <div className="modal-backdrop">
          <div
            className="wallet-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
          >
            <div className="wallet-modal-header">
              <h2>Connect a wallet</h2>
              <button
                className="icon-button"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {detected.length === 0 && (
              <p className="hint">
                No wallet extension was detected. Install one of the wallets
                below, then reload this page.
              </p>
            )}

            {detected.length > 0 && (
              <div className="wallet-list">
                {detected.map(({ adapter }) => (
                  <WalletRow
                    key={adapter.name}
                    adapter={adapter}
                    badge="Detected"
                    disabled={pending !== null}
                    onClick={() => pick(adapter.name)}
                  />
                ))}
              </div>
            )}

            {loadable.length > 0 && (
              <>
                <p className="hint">Also available:</p>
                <div className="wallet-list">
                  {loadable.map(({ adapter }) => (
                    <WalletRow
                      key={adapter.name}
                      adapter={adapter}
                      disabled={pending !== null}
                      onClick={() => pick(adapter.name)}
                    />
                  ))}
                </div>
              </>
            )}

            {notDetected.length > 0 && (
              <>
                <p className="hint">Not installed:</p>
                <div className="wallet-list">
                  {notDetected.map(({ adapter }) => (
                    <WalletRow
                      key={adapter.name}
                      adapter={adapter}
                      badge="Not installed"
                      muted
                      onClick={() =>
                        window.open(adapter.url, "_blank", "noopener,noreferrer")
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WalletRow({
  adapter,
  onClick,
  badge,
  muted = false,
  disabled = false,
}: {
  adapter: Adapter;
  onClick: () => void;
  badge?: string;
  muted?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`wallet-row${muted ? " wallet-row-muted" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {adapter.icon ? (
        <img className="wallet-icon" src={adapter.icon} alt="" />
      ) : (
        <span className="wallet-icon wallet-icon-placeholder" />
      )}
      <span className="wallet-name">{adapter.name}</span>
      {badge ? <span className="wallet-badge">{badge}</span> : null}
    </button>
  );
}
