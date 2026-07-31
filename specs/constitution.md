# ZettelFlow constitution

The **non-negotiables** every spec, plan and change must honor. This is the top gate of the
[Spec-Driven Development pipeline](README.md): a `spec.md` or `plan.md` that violates a principle
is rejected at review, not at merge. It restates — it does not replace — the conventions in
[`CLAUDE.md`](../CLAUDE.md) and the scoring rules in
[`docs/development/obsidian-review-and-scoring.md`](../docs/development/obsidian-review-and-scoring.md).

Amend this file only through a spec of its own (`specs/NNNN-constitution-*/`). Keep it short; if a
rule needs a paragraph of nuance, link the doc that owns it.

## I. The score is a release gate, not a nice-to-have

Obsidian runs an automated review on every version and publishes a 1–100 quality score. No change
may **lower** it. Every plan states which `eslint-plugin-obsidianmd` rules it could trip and how it
avoids them. `npm run lint:obsidian` is the ground truth; a change that adds new violations is not
Done.

## II. Test-first (TDD is the implementation contract)

Behavior changes and bug fixes land with a test that failed before the change and passes after
(the `tdd` skill). No new unit of pure logic ships without a test. The blocking guardrails
(`npm run verify` = typecheck + oxlint + jest) are green before every commit.

## III. Go through the facades

Obsidian access goes through the `ObsidianApi` facade and the `Vault` API — never global `app`,
never the `Adapter` API when a `Vault` call exists. DOM is built with `createEl`/`createDiv`/
`createSpan` and cleared with `el.empty()` — **never `innerHTML`**. Styling is CSS classes via
`c()` + SCSS partials — **never inline `el.style.*`**. Logging is `log` — never bare `console.*`.

## IV. One product surface, two locales, sentence case

User-facing strings live in the i18n layer (`architecture/lang/`) in **sentence case**, with keys
present in **both** `en.ts` and `es.ts`. Commands don't repeat the plugin id/name or the word
"command" and ship **no default hotkeys**. Settings headings use `setHeading()` and don't contain
the word "settings".

## V. Cross-platform by default

The plugin is `isDesktopOnly: false`. Node/Electron APIs (`fs`, `path`, `child_process`,
`electron`) are gated behind `Platform.isDesktop` or the change sets `isDesktopOnly`. No regex
lookbehind, no `globalThis`, use `activeWindow`/`activeDocument` and `window.setTimeout`.

## VI. Defensive against Obsidian internals

Code that touches undocumented internals — above all the Canvas monkey-patcher
(`architecture/plugin/canvas`) — guards every access with existence/shape checks, degrades
gracefully with a user `Notice` when internals change, and uninstalls its patches on unload.

## VII. Disclose capabilities honestly

The plugin's capabilities (file-system access, optional network calls to the community backend,
script execution) are disclosed in the README/docs. A change that adds a new capability discloses
it in the same change. No hidden telemetry, no remote code execution, no auto-updating code.

## VIII. Documentation ships with the change

When a change alters behavior or a public surface, the matching `docs/` page (and `mkdocs.yml`
nav) is updated in the **same** change. Specs and their status live under `specs/`.

## IX. Small, conventional, single-branch

Conventional Commits (`feat(scope):`, `fix:`, `docs:`), no AI co-author trailer. Work on one
`feature/*` branch; each commit is a coherent advance that leaves `verify` green so CI passes at
every commit.
