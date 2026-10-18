import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // lib/calc, lib/ingest, lib/dq and lib/data: money is bigint, dates are calendar strings (docs/CALCULATION_MODULE.md, 9).
  {
    files: ["lib/calc/**/*.ts", "lib/ingest/**/*.ts", "lib/dq/**/*.ts", "lib/data/**/*.ts"],
    ignores: [
      "lib/calc/**/*.test.ts",
      "lib/calc/testing/**",
      "lib/ingest/**/*.test.ts",
      "lib/dq/**/*.test.ts",
      "lib/dq/testing/**",
      "lib/data/**/*.test.ts",
      "lib/data/testing/**",
    ],
    rules: {
      "no-restricted-globals": ["error", "parseFloat", "parseInt", "isNaN", "isFinite"],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "round" },
        { object: "Math", property: "floor" },
        { object: "Math", property: "ceil" },
        { object: "Math", property: "trunc" },
        { object: "Number", property: "parseFloat" },
        { object: "Date", property: "now" },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "Literal[raw=/^\\d*\\.\\d/]", message: 'Дробные литералы запрещены: parseRate("0.17")' },
        { selector: "CallExpression[callee.property.name='toFixed']", message: "toFixed округляет двоичное число" },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Текущая дата — только аргументом asOf" },
      ],
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "next", "next/*", "postgres", "@supabase/*", "@/lib/*"] },
      ],
    },
  },
  // The rest of the app imports only the public API of lib/calc.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/calc/**"],
    rules: { "no-restricted-imports": ["error", { patterns: ["@/lib/calc/*"] }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
]);

export default eslintConfig;
