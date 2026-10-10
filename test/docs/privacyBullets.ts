/**
 * The Capabilities & privacy bullets: five frozen at 2f6198f5 (#588, disclosure guardrail), and a
 * sixth added by #748 — reading handwriting, new in kind (an image). An addition, never a re-wording.
 *
 * The disclosure may MOVE in the README but never be re-worded (constitution VII). frontDoor.test.ts
 * whitespace-collapses the README and asserts each bullet below still occurs verbatim -- collapsed on
 * purpose, so re-wrapping a moved paragraph passes and re-wording it fails. Generated from the
 * README's Capabilities & privacy section; do not hand-edit to make a test pass.
 */
export const FROZEN_PRIVACY_BULLETS: readonly string[] = [
    "- **File system (vault).** Reads canvas flow files and creates/edits notes (e.g. the **Change note state** command writes a single lifecycle property to the active note). All access goes through Obsidian's `Vault` / `FrontmatterService` API — never a hardcoded path. Works on desktop and mobile.",
    "- **Vault enumeration.** ZettelFlow lists every markdown file **path** to build the offline knowledge model that health, discovery, the graph and Cultivate all read. Paths and metadata only, all local — and you can keep folders out of it with the knowledge scope.",
    "- **Network — two opt-in paths, nothing until you use them.** The **community gallery** does read-only `GET`s of the static catalog on GitHub (no backend, no account, no uploads), and the optional **AI provider** sends length-bounded note content to the single https endpoint *you* configure. Both are off until you open the browser or enable AI.",
    "- **Dynamic code execution.** The Script action, dynamic selectors, vault hooks and workflow-event conditions run **JavaScript you write**, with the plugin's access to your vault — including read-only access to the whole knowledge model via `zf.knowledge` — so only run scripts you trust. No remote code is ever fetched or executed, and every runtime function is built in one audited module.",
    "- **Clipboard — write only.** The “copy” buttons put a step or action configuration on your clipboard as JSON. ZettelFlow never *reads* your clipboard.",
    "- **Handwriting — opt-in, per press.** Reading ink sends an image of that one ink note's strokes and its passage to your AI provider, only when you press **Read as text**. Nothing reads ink by itself.",
];
