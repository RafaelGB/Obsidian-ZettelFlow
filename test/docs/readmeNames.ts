/**
 * Every capability name the README carried at `2f6198f5` — frozen (#588, FR-4 / AC-4).
 *
 * This is the record the rewrite may not lose. `readmeNamesKept.test.ts` asserts every name below
 * still occurs in `README.md` or under `docs/**` — a re-ranking of the inventory, never a deletion.
 *
 * **84 unique names** = 35 `## Zettelkasten toolkit` bullets + 69 `## Features` rows − 20 that
 * appear in both. Extracted in **Node, never shell grep**: `grep -oE '^- \*\*[^*]+\*\*'` cannot
 * match a bullet whose emoji is outside the BMP (🎯 🎲 💬 🏠 🌱 🔎 📖 …) and silently dropped 28 of
 * the 35 toolkit bullets — including all four practice loops, the exact material this issue is about.
 *
 * Regenerate the list (at the frozen commit) with:
 *
 *   git show 2f6198f5:README.md > /tmp/readme.md   # then run the Node extractor over it
 *
 * The extractor: within `## Zettelkasten toolkit` take each `- **…**` lead-in, within `## Features`
 * each `| **…** |` lead-in, strip a leading emoji/punctuation run, de-duplicate. Do not edit this
 * list to make a test pass — route the name to its owning `docs/` page instead.
 */
export const FROZEN_README_NAMES: readonly string[] = [
    "Knowledge with purpose",
    "A thought you can be wrong about",
    "Two things far apart",
    "What this note claims, asked again",
    "ZettelFlow Home",
    "Quick capture",
    "Cultivate",
    "Agency review",
    "Shareable idea card",
    "Explore your graph",
    "Note-builder companion pane",
    "Derived projects",
    "Zettel ID action",
    "Slip-box health",
    "Systems Gallery",
    "Map-of-content builder",
    "Connection resurfacing",
    "Second-brain review",
    "Thinking heatmap",
    "Morning discovery",
    "Living knowledge map",
    "Concept navigation",
    "3D knowledge graph",
    "Open questions",
    "Evolution timeline",
    "Evidence map",
    "Atomicity split assist",
    "Note lifecycle states",
    "Knowledge phases for steps",
    "Event-driven workflows",
    "Visual workflow language (WHEN / IF / ACTION / WAIT)",
    "Knowledge actions",
    "Relation actions",
    "Research actions",
    "AI actions — optional, off by default",
    "Wagers",
    "Two things far apart (collision)",
    "The return of a claim",
    "Canvas-based flows",
    "Knowledge patterns",
    "31 built-in actions",
    "Scriptable knowledge API",
    "Script workbench",
    "Conditional edges",
    "Steps own their exits",
    "Colour means the phase",
    "Review this flow",
    "Your flows have a role",
    "Triggers only where they fire",
    "Systems install into a role",
    "Try a system before installing",
    "Settings you can read",
    "Rehearse a flow",
    "Dynamic templates",
    "Live body preview",
    "Go back to any step",
    "See what will change",
    "Companion pane",
    "Inline steps are first-class",
    "One flow, two connected notes",
    "Unfinished notes survive",
    "Honest progress",
    "Cultivate (thinking sessions)",
    "A gap you ruled on stops asking",
    "Seams",
    "The graph lens",
    "Atomicity split",
    "Knowledge scope",
    "Vault hooks",
    "Visual workflow language",
    "Action picker by capability",
    "Remove a relation",
    "Community Hub",
    "Community systems",
    "zftemplate export/import",
    "Think about this",
    "Think",
    "Cognitive moves",
    "How you got here",
    "Think before you look",
    "Timings from this vault",
    "What ZettelFlow changed",
    "Mobile support",
    "Accessibility",
];
