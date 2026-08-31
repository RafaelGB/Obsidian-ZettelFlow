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

The plugin's capabilities (file-system access, opt-in read-only fetches from the static community
gallery, script execution) are disclosed in the README/docs. A change that adds a new capability discloses
it in the same change. No hidden telemetry, no remote code execution, no auto-updating code.

## VIII. Documentation ships with the change

When a change alters behavior or a public surface, the matching `docs/` page (and `mkdocs.yml`
nav) is updated in the **same** change. Specs and their status live under `specs/`.

## IX. Small, conventional, single-branch

Conventional Commits (`feat(scope):`, `fix:`, `docs:`), no AI co-author trailer. Work on one
`feature/*` branch; each commit is a coherent advance that leaves `verify` green so CI passes at
every commit. Commits **reference** the issue (`(#N)`); they do **not** close it.

## X. Issues close on merge, never from a feature branch

An issue is Done only when its fix is on `main`. Close issues through the **pull request** that
merges the branch — put `Closes #N` (one per addressed issue) in the **PR body**, so merging to
`main` closes them automatically. Never `gh issue close` from a feature branch and never rely on a
commit message to close an issue (feature-branch commits don't trigger auto-close, and closing
before merge marks work shipped that isn't). The stage-5 "issue closed" gate means "listed in the
PR's `Closes` set", realised when the PR merges.

## XI. Consolidation over expansion — the transformation gate

The manifesto is the design gate: *ZettelFlow does not manage notes; it manages the processes that
**transform knowledge**.* Every change answers **"what knowledge transformation does it enable?"**
— if it does not transform, connect, evaluate, discover or advance knowledge, it is secondary.

Three invariants make this enforceable, not aspirational:

- **No net complexity.** A change **removes or merges** surface (a command, view, setting, path) or
  **hardens a boundary** — it does not *only* add. Consolidation is the default; new top-level
  surface is the exception that must justify itself against this gate.
- **No visible breakage** (consolidate & hide). Existing `.zftemplate` systems keep loading, saved
  settings keep working, and no command or view disappears without an alias.
- **Knowledge is offline and platform-free.** The Knowledge layer (`architecture/knowledge`, and the
  future `knowledge/` home) **never imports `obsidian`** and makes no network/AI call. Derived
  metrics are **queries over the model, not invented dashboard features** — *metrics are
  consequences, not inventions*.

## XII. Never write a judgement the user did not make

The manifesto's meta-principle is **cognitive agency**: ZettelFlow removes *mechanical* work and
protects *cognitive* work. **Mechanical** output — a gathered list, a derived metric, a structural
projection — may be written freely. **Interpretive** output — an interpretation, conclusion,
counterargument, synthesis or proposed connection, whether produced by AI or by a heuristic — reaches
the vault **only through an explicit human verdict** (accept / modify / reject). Machine text is
*proposed*, never *committed*.

Two consequences a reviewer can check on a diff:

- **No silent interpretive write.** An action that produces interpretive output and writes it with no
  decision point is rejected — inside a wizard build *and* inside an automation. The AI gate (#301)
  bounds cost and automation; it does not grant agency.
- **The verdict is data, not just an effect.** A human decision is recorded (the judgement record), so
  *cognitive agency* stays a **consequence of the model** like every other metric (§XI) — never an
  invented score.

**Deliberate friction** — asking for the user's reading before revealing the system's — is a design
tool, not a tax: applied only where judgement is genuinely at stake, never as a generic confirmation
dialog. It is the opposite of the *operational* friction removed by the
[friction audit](friction-audit.md); §XI still applies, so a friction step must not add net surface.
