# Obsidian review system & quality score

> **Why this page exists.** In May 2026 Obsidian launched a new **Community hub** with
> **automated reviews** and a **source‑code quality score** for every plugin and theme.
> This page explains how that system works and how ZettelFlow reaches (and keeps) the
> maximum score. It is the reference behind the `obsidian-plugin-quality` harness skill
> and the `obsidian-plugin-reviewer` agent (see [`CLAUDE.md`](../../CLAUDE.md)).

## 1. Why Obsidian now scores plugins

The community directory grew to thousands of plugins installed inside people's most
private notes. To protect users and reward well‑maintained projects, Obsidian moved from
a one‑time, manual submission review to a **continuous, automated review of every
version**. The goals are:

- **Safety** — detect malware, remote code execution, hidden telemetry and known
  vulnerabilities before users install an update.
- **Transparency** — users see, *before installing*, what a plugin accesses (network,
  file system, clipboard…) and how healthy its code is.
- **Trust & signal** — a visible score and **scorecards** let good plugins stand out and
  nudge every author toward the official guidelines.

## 2. How the review works

Every submitted **version** goes through an automated pipeline that checks three things:

1. **Policy compliance** — the [Developer policies](https://docs.obsidian.md/Developer+policies):
   no hidden telemetry, no remote code execution, no auto‑updating code outside normal
   releases, no collecting vault contents / personal data without consent, no deceptive
   patterns or spam.
2. **Code quality** — the source is linted against the official
   [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) using
   the rule set from [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin).
3. **Security** — dependency/known‑vulnerability scanning plus malware scanning for
   potentially malicious additions.

Around that pipeline:

- **Scorecards** are shown on each project page and summarise the automated checks. Obsidian
  has announced they will grow to include **disclosures** (network / file system /
  clipboard / other capabilities), **privacy labels**, **artifact attestation**, manual
  review results and **app‑capability adoption**.
- **Manual review** still happens for **popular or flagged** extensions.
- **Verified authors** — a trust label for developers who pass extra verification and stay
  in good standing.
- **The score** — community reporting describes the code‑quality result as a **rating from
  1 to 100**, derived from how well the source follows the guidelines above. Fewer guideline
  violations ⇒ higher score. Older projects that fail automated checks get a temporary
  exception but may eventually be removed from the directory.

> **Takeaway for us:** the score is essentially *"how clean is the code against
> `eslint-plugin-obsidianmd` + the developer policies + the submission requirements"*. We
> can reproduce almost the entire check locally.

## 3. What the score measures — the checklist

The automated grade maps to concrete, fixable rules. The tables below group the official
[`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin) rules (and the
plugin guidelines behind them) into the categories that drive the score.

### 3.1 Security & DOM construction

| Guideline | Rule(s) | What to do |
|---|---|---|
| Never inject HTML strings | `no-forbidden-elements` | No `innerHTML` / `outerHTML` / `insertAdjacentHTML`. Build DOM with `createEl()`, `createDiv()`, `createSpan()`. |
| Clear nodes safely | — | Use `el.empty()` instead of `el.innerHTML = ""`. |
| No raw DOM casts | `no-tfile-tfolder-cast`, `prefer-instanceof` | Use `instanceof TFile/TFolder` and cross‑window‑safe `.instanceOf()`. |

### 3.2 Resource management & lifecycle

| Guideline | Rule(s) | What to do |
|---|---|---|
| Auto‑clean listeners | — | Register via `registerEvent()`, `registerDomEvent()`, `registerInterval()`, `addCommand()`. |
| Don't detach leaves on unload | `detach-leaves` | Obsidian cleans custom leaves automatically — remove `detachLeavesOfType()` from `onunload()`. |
| Don't hold view references | `no-view-references-in-plugin` | Look views up with `getActiveViewOfType()` / `getLeavesOfType()`. |
| Renderer components | `no-plugin-as-component` | Don't pass the plugin as the `Component` to `MarkdownRenderer.render()`. |

### 3.3 Commands & settings UI

| Guideline | Rule(s) | What to do |
|---|---|---|
| Clean command ids/names | `commands/no-command-in-command-id`, `commands/no-command-in-command-name`, `commands/no-plugin-id-in-command-id`, `commands/no-plugin-name-in-command-name` | Don't repeat the plugin id/name or the word "command" in ids/names. |
| No default hotkeys | `commands/no-default-hotkeys` | Ship without default hotkeys; let users assign them. |
| Sentence case everywhere | `ui/sentence-case`, `ui/sentence-case-json`, `ui/sentence-case-locale-module` | UI strings use "Sentence case", not "Title Case". |
| Settings headings | `settings-tab/no-manual-html-headings`, `settings-tab/no-problematic-settings-headings`, `settings-tab/prefer-setting-definitions` | Use `setHeading()` / setting definitions; don't put "settings" in headings. |

### 3.4 Vault & workspace API usage

| Guideline | Rule(s) | What to do |
|---|---|---|
| Prefer Vault over Adapter | — | Use the `Vault` API; avoid `vault.adapter` unless strictly necessary. |
| Don't iterate all files | `vault/iterate` | Use `getFileByPath()` / `getAbstractFileByPath()`. |
| Respect user trash | `prefer-file-manager-trash-file` | Delete via `FileManager.trashFile()`. |
| Frontmatter edits | — | Use `FileManager.processFrontMatter()`. |
| Normalise paths | — | Wrap user paths with `normalizePath()`. |
| No hardcoded config dir | `hardcoded-config-path` | Use `vault.configDir`, not a literal `.obsidian`. |

### 3.5 Styling

| Guideline | Rule(s) | What to do |
|---|---|---|
| No inline styles | `no-static-styles-assignment` | Don't assign `el.style.*`; add a CSS class in `styles.css`. |
| Use Obsidian theme variables | — | Prefer CSS custom properties (`var(--...)`) over hardcoded colors/sizes. |

### 3.6 Mobile & cross‑platform

| Guideline | Rule(s) | What to do |
|---|---|---|
| Guard Node/Electron | `no-nodejs-modules`, `platform` | Gate desktop‑only APIs behind `Platform.isDesktop`; set `isDesktopOnly` if unavoidable. |
| Popout‑window safe | `prefer-active-doc`, `no-global-this`, `prefer-window-timers` | Use `activeDocument` / `activeWindow`, `window.setTimeout`, not `globalThis`. |
| iOS‑safe regex | `regex-lookbehind` | Avoid lookbehind (unsupported on some iOS versions). |
| Language detection | `prefer-get-language` | Use Obsidian's language API, not `localStorage`. |
| API availability | `no-unsupported-api` | Don't call APIs newer than `minAppVersion`. |

### 3.7 Repository hygiene

| Guideline | Rule(s) | What to do |
|---|---|---|
| Valid manifest | `validate-manifest` | Correct `manifest.json` (see §4). |
| Valid license | `validate-license` | `LICENSE` with a proper copyright notice. |
| No template leftovers | `no-sample-code`, `sample-names` | Remove sample‑plugin code and placeholder class names. |

## 4. Submission requirements (manifest & release)

Beyond code style, the directory enforces
[submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins):

- **`manifest.json`** — valid `id`, `name`, `version` (semver), `minAppVersion`,
  `description`, `author`. Optional `authorUrl`, `fundingUrl` (only if you accept
  donations), `isDesktopOnly`.
- **Description** — ≤ 250 chars, ends with a period, starts with an action verb, does **not**
  start with "This is a plugin", no emoji, correct capitalisation of proper nouns.
- **`versions.json`** — maps each plugin version to its required `minAppVersion` so Obsidian
  serves the right build to each app version. **Required for the release workflow.**
- **Release artifacts** — a GitHub release whose **tag equals the manifest `version`**
  (no `v` prefix) containing `main.js`, `manifest.json` and, if present, `styles.css`.
- **Repo** — public, with `LICENSE` and a `README.md` that documents usage.

## 5. How to self‑check locally

The single highest‑leverage action is to run the **same linter Obsidian runs**:

```bash
# one-off, no install
npx eslint-plugin-obsidianmd   # via an eslint flat config, see below
```

Add it as a dev dependency and an ESLint **flat config** (`eslint.config.mjs`):

```js
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: { parser: tsparser, parserOptions: { project: "./tsconfig.json" } },
  },
]);
```

Then wire an `npm run lint:obsidian` script and run it in CI on every PR and release.
The `obsidian-plugin-quality` harness skill automates this audit; see
[`CLAUDE.md`](../../CLAUDE.md).

## 6. ZettelFlow compliance snapshot

The **single** record of where this repository stands against the checklist above, re-run by the
`obsidian-plugin-quality` skill before each release. It replaced a second, older snapshot that sat
forty lines higher and contradicted it on every row — two accounts of the same thing is one too many,
and the stale one is always the one somebody quotes.

| Area | Status |
|---|---|
| **Security & DOM** — `innerHTML`, HTML-string rewrites | ✅ 0 remaining; enforced by the blocking `lint:obsidian` |
| **Styling** — inline `el.style.*` | ✅ 0 remaining; enforced by the lint |
| **Resource management** — `onunload` teardown | ✅ `main.onunload` unloads components + flushes journal/timeline + unregisters actions (test-verified) |
| **Commands & settings** — ids/names, sentence-case | ✅ command ids kebab-case + unique (test); settings via the declarative API |
| **Vault/workspace API** — `Vault`/`FileManager`, no `app` globals, path-normalised | ✅ writes go through `FileService`/`FrontmatterService`; canvas patching is guarded (#304) |
| **i18n** — en/es parity | ✅ full parity, enforced by `localeParity.test.ts` |
| **Capabilities disclosure** | ✅ [Capabilities & privacy](capabilities-and-privacy.md): FS access, opt-in read-only community fetch, opt-in https AI endpoint, script execution; adopt Obsidian's machine-readable disclosure labels when the format ships |
| **Submission** — `versions.json`, tag == `manifest.version`, three artifacts | ✅ `versions.json` present; the release workflow **fails if the tag ≠ `manifest.version`** and attaches `main.js`/`manifest.json`/`styles.css` (#316) |
| **Network / telemetry** | ✅ no telemetry; the only outbound calls are the opt-in community fetches (read-only) and the opt-in AI endpoint |
| **Mobile & accessibility** (#319, E4) | ✅ core-loop touch targets; graph degrades to a navigable list on mobile; WAI-ARIA tablist + keyboard nav; `makeActivatable` note links; focus rings; `prefers-reduced-motion`; guardrail test + [matrix doc](mobile-and-accessibility.md). Remaining lens sweep + device walkthrough tracked in #325 |

Remaining pre-launch item lives in the last launch epic: **design by subtraction** (#320, E5).

## Sources

- [The future of Obsidian plugins — obsidian.md](https://obsidian.md/blog/future-of-plugins/)
- [Obsidian launches Community hub with automated plugin reviews — AlternativeTo](https://alternativeto.net/news/2026/5/obsidian-launches-community-hub-with-automated-plugin-reviews-and-enhanced-safety/)
- [obsidianmd/eslint-plugin (official guideline rules)](https://github.com/obsidianmd/eslint-plugin)
- [Plugin guidelines — Obsidian Developer Docs](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Submission requirements for plugins — Obsidian Developer Docs](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)
- [Developer policies — Obsidian Developer Docs](https://docs.obsidian.md/Developer+policies)
</invoke>
