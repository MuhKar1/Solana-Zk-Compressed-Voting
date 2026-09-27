"use strict";

/**
 * Stub replacement for `@solana-mobile/wallet-adapter-mobile`.
 *
 * This app is web-only, so the mobile wallet adapter (and its ESM-only
 * `@solana/*` 2.x dependency tree) is never used. Stubbing it out keeps those
 * packages out of the bundle, which fixes Next.js' vendor-chunk emission.
 */

const SolanaMobileWalletAdapterWalletName = "Mobile Wallet Adapter";

class SolanaMobileWalletAdapter {
  constructor() {
    throw new Error("The mobile wallet adapter is not available in this browser.");
  }
}

const createDefaultAddressSelector = () => () => {};
const createDefaultAuthorizationResultCache = () => ({
  get: () => {},
  set: () => {},
  remove: () => {},
});
const createDefaultWalletNotFoundHandler = () => () => {};

module.exports = {
  SolanaMobileWalletAdapterWalletName,
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
};
