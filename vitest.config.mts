import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["lib/calc/testing/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/calc/**/*.ts"],
      exclude: ["lib/calc/**/*.test.ts", "lib/calc/testing/**", "lib/calc/index.ts", "lib/calc/types.ts"],
      thresholds: { 100: true },
    },
  },
});
