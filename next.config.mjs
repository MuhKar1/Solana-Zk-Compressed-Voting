import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, context) => {
    // Replace the mobile wallet adapter with a stub. This app is web-only,
    // and the mobile adapter pulls in ESM-only `@solana/*` 2.x packages that
    // break Next.js' vendor-chunk emission (causing "Cannot find module
    // './vendor-chunks/@solana.js'").
    config.resolve.alias = {
      ...config.resolve.alias,
      "@solana-mobile/wallet-adapter-mobile": path.resolve(
        process.cwd(),
        "app/lib/mobile-adapter-stub.js"
      ),
    };

    if (!context.isServer) {
      // The Solana / Light SDKs pull in Node built-ins that do not exist in
      // the browser. Stub them out for the client bundle.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
      };

      // Provide a `Buffer` global (from the `buffer` package) for libraries
      // that reference it directly.
      const webpack = context.webpack;
      if (webpack && typeof webpack.ProvidePlugin === "function") {
        config.plugins.push(
          new webpack.ProvidePlugin({
            Buffer: ["buffer", "Buffer"],
          })
        );
      }
    }
    return config;
  },
};

export default nextConfig;
