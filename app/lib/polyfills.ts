/**
 * Browser polyfills for the Solana / Anchor / Light SDKs.
 *
 * The Solana ecosystem libraries assume the presence of Node globals
 * (`Buffer` and `process`) that do not exist in the browser. This module
 * installs lightweight shims before any of those libraries are imported.
 *
 * It MUST be imported before any module that imports `@solana/web3.js`,
 * `@coral-xyz/anchor` or `@lightprotocol/stateless.js`.
 */
import { Buffer } from "buffer";

const g = globalThis as unknown as Record<string, unknown>;

if (typeof g.Buffer === "undefined") {
  g.Buffer = Buffer;
}

if (typeof g.process === "undefined") {
  g.process = {
    env: {},
    browser: true,
    version: "",
    versions: {},
    platform: "browser",
    arch: "web",
    cwd: () => "/",
    nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
      setTimeout(() => fn(...args), 0),
    emitWarning: () => {},
    on: () => {},
    once: () => {},
    off: () => {},
    removeListener: () => {},
    hrtime: () => [0, 0],
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  };
}

export {};
