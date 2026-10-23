import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@/…` as in tsconfig: components import the app's modules that way.
  resolve: { alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }] },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["lib/calc/testing/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/calc/**/*.ts", "lib/ingest/**/*.ts", "lib/dq/**/*.ts", "lib/data/**/*.ts", "lib/nightly/**/*.ts"],
      exclude: [
        "lib/calc/**/*.test.ts",
        "lib/calc/testing/**",
        "lib/calc/index.ts",
        "lib/calc/types.ts",
        "lib/ingest/**/*.test.ts",
        "lib/ingest/index.ts",
        "lib/ingest/types.ts",
        "lib/dq/**/*.test.ts",
        "lib/dq/testing/**",
        "lib/dq/index.ts",
        "lib/dq/types.ts",
        "lib/data/**/*.test.ts",
        "lib/data/testing/**",
        "lib/data/index.ts",
        "lib/data/types.ts",
        "lib/nightly/**/*.test.ts",
        "lib/nightly/testing/**",
        "lib/nightly/index.ts",
        "lib/nightly/types.ts",
      ],
      thresholds: { 100: true },
    },
  },
});
