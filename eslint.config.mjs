// ESLint flat config that runs the OFFICIAL Obsidian plugin guideline rules
// (eslint-plugin-obsidianmd) — the same rule set behind the Community-hub automated
// review and the 1–100 quality score.
//
// Run with: npm run lint:obsidian
// Reference:  docs/development/obsidian-review-and-scoring.md
//
// This is BLOCKING (part of `npm run verify`, the pre-push hook and CI). The backlog from
// #85 is burned down to zero; the only remaining relaxation is one per-file rule downgrade
// for the declarative settings API migration deferred to its own tracked issue (#112). Day-to-day
// linting is oxlint (`npm run lint`); this focuses purely on the Obsidian score.
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
    rules: {
      // `no-undef` is redundant under TypeScript (tsc already enforces it) and false-positives
      // on type-only names (CanvasData, EventRef, Menu, React...). typescript-eslint recommends
      // turning it off for .ts/.tsx. See https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule
      "no-undef": "off",
    },
  },
  {
    // Deferred (tracked by #112): adopting the declarative settings API (getSettingDefinitions)
    // is a large migration. Relaxed here until #112 lands.
    files: ["src/config/modals/ZettelFlowSettingsTab.ts"],
    rules: {
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
];
