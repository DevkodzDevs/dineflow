import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * The lint gate. `next lint` was deprecated out from under this repo: with no config on disk it
 * dropped into an interactive setup prompt and exited 1, so `pnpm lint` failed for everyone and
 * nothing was actually being linted — including the eslint-disable comments scattered through the
 * app, which had nothing left to disable. This is the flat config that `next lint` would have
 * written, wired to the ESLint CLI so it runs the same on a laptop and in CI.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", ".next-dev/**", "node_modules/**", "public/sw.js", "next-env.d.ts", "*.tsbuildinfo"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // the codebase leans on inferred types and narrow casts at the Supabase boundary; these are
      // style opinions, not correctness, and turning them on now would bury the real findings
      "@typescript-eslint/no-explicit-any": "warn",
      /**
       * Off on purpose. This rule wants every apostrophe in copy written as `&apos;` — "tomorrow&apos;s
       * brief is ready". JSX renders the plain character correctly; the rule exists to catch a stray
       * entity confusing a reader of the source, and in a product whose screens are this full of
       * written English it does the opposite. Every one of the 26 it flagged here was an apostrophe
       * or a quotation mark in a sentence, and none of them was a bug.
       */
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
