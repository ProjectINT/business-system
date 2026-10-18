import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // Old addresses from before the Import section; query strings pass through.
  redirects: async () =>
    ["imports", "raw-data", "data-quality", "reconciliation"].map((page) => ({
      source: `/${page}`,
      destination: page === "imports" ? "/import" : `/import/${page}`,
      permanent: false,
    })),
  partialPrefetching: true,
  // The CSV source reads the sample at request time (lib/ingest/load.ts opts out of tracing).
  outputFileTracingIncludes: {
    "/**": ["./Technical_Challenge_Data/*.csv"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
