// ESLint flat config that runs the OFFICIAL Obsidian plugin guideline rules
// (eslint-plugin-obsidianmd) — the same rule set behind the Community-hub automated
// review and the 1–100 quality score.
//
// Run with: npm run lint:obsidian
// Reference:  docs/development/obsidian-review-and-scoring.md
//
// Note: today this is ADVISORY (CI runs it with continue-on-error) because the codebase
// still has known violations tracked as issues. Once those are fixed, flip the CI step to
// blocking. Day-to-day linting is oxlint (`npm run lint`); this focuses purely on the
// Obsidian score.
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "test/**",
      "docs/**",
      "backend/**",
      "**/*.mjs",
      "**/*.config.js",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaFeatures: { jsx: true },
      },
    },
  },
];
