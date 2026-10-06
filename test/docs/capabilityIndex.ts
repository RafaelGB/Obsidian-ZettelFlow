import EN from "architecture/lang/locale/en";
import {
    CAPABILITIES,
    CAPABILITY_DOORS,
    type CapabilityId,
    type DoorKind,
} from "architecture/components/core/surface/capabilities";

/**
 * The reader-facing rendering of the capability registry (#588, FR-2 / decision 2).
 *
 * `docs/development/capability-doors.md` renders `CAPABILITIES` for a **maintainer**, keyed by symbol
 * id and showing every door. This is the **second rendering of the same source**, for a **reader**:
 * keyed by *how you reach it* (the best door's kind) rather than by declaration order, one line each,
 * so the long tail is complete without competing for the first screen's attention. There is no third
 * inventory — a list nobody regenerates is the staleness this issue exists to end.
 *
 * **Why it lives in `test/`.** #588's AC-10 freezes `src/` byte-for-byte, so the reader-side renderer
 * cannot sit beside `capabilityAudit.ts`. It imports `capabilities` and the locale through the jest
 * alias exactly as `capabilityAudit.test.ts` does; `tsconfig.jest.json` includes `test/**`, so the
 * `Record<CapabilityId, …>` below is still a **compile error** when a capability is added without a
 * reader entry — the exhaustiveness guarantee is unchanged, it just runs under `npm test`. When `src/`
 * is next unfrozen this is a file move and one import.
 *
 * It improves on the `capability-doors.md` precedent by shipping a **write mode**:
 * `UPDATE_DOCS=1 npx jest capabilityIndex` rewrites the committed page, mirroring `UPDATE_API_DOCS`.
 *
 * Names resolve from `nameKey` against `architecture/lang/locale/en` imported **directly** — not via
 * `architecture/lang` — so no `t()`, no `moment`, no `obsidian`, the same reasoning `capabilityAudit`
 * records for not calling `t()` inside a generator.
 */
const LOCALE = EN as Record<string, string>;

export const CAPABILITY_INDEX_MARK = "<!-- generated: capabilityIndex -->";

/** A reader-facing section, one per best-door kind, in the order a reader meets them. */
interface Section {
    kind: DoorKind;
    heading: string;
    blurb: string;
    /** Shown when the section has no members — which for `settings` and `command` is the point. */
    empty: string;
}

const SECTIONS: readonly Section[] = [
    {
        kind: "object",
        heading: "Right where you're working",
        blurb: "A control on screen where you already are — the ribbon menu, a button in the view, or the note's right-click menu.",
        empty: "",
    },
    {
        kind: "surface",
        heading: "On a ZettelFlow surface",
        blurb: "Open the surface, or one of its modes.",
        empty: "",
    },
    {
        kind: "recommendation",
        heading: "It comes to you",
        blurb: "A line on Home that arrives without being looked for.",
        empty: "",
    },
    {
        kind: "settings",
        heading: "In settings",
        blurb: "",
        empty: "Nothing is configured-only — everything above has a door you reach it by.",
    },
    {
        kind: "command",
        heading: "Only in the command palette",
        blurb: "",
        empty: "Nothing lives only in the palette. Every capability has a door of rank 1–3 you can find without already knowing its name — that is the rule (see [capability doors](../development/capability-doors.md)).",
    },
];

interface ReaderEntry {
    /** One line, lower-case start — it follows an em-dash after the name. Compressed from the old `## Features` prose. */
    summary: string;
    /** The docs page that owns the subject, relative to `docs/reference/`. */
    page: string;
}

/**
 * The only hand-written data: a line and an owning page for each capability. Exhaustive by type —
 * add a capability without an entry here and this file stops compiling under `tsconfig.jest.json`.
 */
const READER: Record<CapabilityId, ReaderEntry> = {
    "note-creation": { summary: "draw a workflow on a Canvas and the wizard walks it to build a note.", page: "../architecture/overview.md" },
    "run-a-flow": { summary: "run the open canvas as a flow — create notes, edit the open one, or react to an event.", page: "../architecture/flow-roles.md" },
    "canvas-editing": { summary: "open and edit the canvas that drives a flow.", page: "../architecture/overview.md" },
    "quick-capture": { summary: "one keystroke from a thought to a fleeting note in your Inbox.", page: "../development/quick-capture.md" },
    home: { summary: "the front door — what to do next on your knowledge, at a glance, read-only and offline.", page: "../development/zettelflow-home.md" },
    "moc-builder": { summary: "gather notes by tag or folder into a map of content, refreshed safely.", page: "../development/moc-builder.md" },
    "derive-project": { summary: "turn a folder of notes into a book, course, or article outline from the graph.", page: "../development/derived-projects.md" },
    "knowledge-map": { summary: "the connected regions and named neighbourhoods of your graph.", page: "../development/living-knowledge-map.md" },
    "concept-nav": { summary: "walk your vault by typed relation, note to note, like a wiki you wrote.", page: "../development/concept-navigation.md" },
    explore: { summary: "narrow your vault by clicking; the query is what that produces.", page: "../development/ask-your-graph.md" },
    "graph-lens": { summary: "your slip-box as a 3D Knowledge Galaxy, and a lens on your Explore selection.", page: "../development/graph-3d.md" },
    "reasoning-paths": { summary: "read the argument chains leaving a note (supports → expands → example).", page: "../development/concept-navigation.md" },
    "slipbox-health": { summary: "which notes need you, each handed to This note on what it is missing.", page: "../development/slipbox-health-dashboard.md" },
    "knowledge-dashboard": { summary: "the knowledge read-out for scripts; its panels became Tend and Home.", page: "../development/knowledge-dashboard.md" },
    "weekly-review": { summary: "a weekly review note: created, orphaned, forgotten, and unreviewed ideas.", page: "../development/second-brain-review.md" },
    practice: { summary: "what you have developed lately and how you answered proposals — facts, never a grade.", page: "../development/practice.md" },
    "note-companion": { summary: "the note you are reading, from the right sidebar — where it stands, what surrounds it, how it got here.", page: "../development/this-note.md" },
    "next-step": { summary: "the note's next step — add a source, connect, mark an example or move it on — finished in place, with an undo.", page: "../development/this-note.md#next-step" },
    "evolution-timeline": { summary: "the conceptual history of one idea — states, claims, moves, and verdicts.", page: "../development/evolution-timeline.md" },
    "evidence-map": { summary: "a grounded synthesis of a note from your own graph (experimental).", page: "../development/evidence-map.md" },
    "open-questions": { summary: "every unanswered question in your vault, made first-class.", page: "../development/open-questions.md" },
    resurface: { summary: "older related notes worth revisiting, plus a daily spark of forgotten ideas.", page: "../development/connection-resurfacing.md" },
    "atomicity-split": { summary: "split a multi-topic note into linked atomic notes, leaving a hub.", page: "../development/atomicity-split.md" },
    cultivate: { summary: "a guided thinking session that makes one idea evolve, one real move at a time.", page: "../development/cultivate.md" },
    inquiry: { summary: "start from your own question, inspect bounded context, and write a provisional response.", page: "../development/cultivate.md" },
    "thought-lab": { summary: "a place to think before it has to be knowledge — nothing here is a note.", page: "../architecture/thought-lab.md" },
    "blind-ask": { summary: "in Explore, write what you currently think before it answers.", page: "../development/ask-your-graph.md" },
    collision: { summary: "two of your notes with nothing in common, one question, no answer.", page: "../architecture/collision.md" },
    moves: { summary: "make a cognitive move on the note you are reading — challenge, reframe, branch.", page: "../development/cultivate.md#the-moves" },
    reader: { summary: "right-click a note and read a path across your notes, the way you read a book — no MOC, nothing written.", page: "../development/reader.md" },
    "highlights-review": { summary: "what you marked in the Reader comes back a few at a time — still think so, changed your mind, or let it go.", page: "../development/highlights-review.md" },
    "think-about": { summary: "open a thread about a note without writing to it.", page: "../architecture/thought-lab.md" },
    "claim-door": { summary: "say in one sentence what a note claims.", page: "../development/claim-returns.md" },
    "claim-return": { summary: "a claim you wrote comes back, blind, to be re-judged after a while.", page: "../development/claim-returns.md" },
    wager: { summary: "a claim with an expected observation and a date you expect to know by.", page: "../development/wagers.md" },
    "note-state": { summary: "move a note through its lifecycle state (fleeting → … → evergreen).", page: "../architecture/knowledge-lifecycle.md" },
    "remove-relation": { summary: "delete a typed relation from the active note, after a confirmation.", page: "../architecture/knowledge-model.md" },
    "script-workbench": { summary: "try a script before it touches anything, and read every run in a log.", page: "../architecture/script-workbench.md" },
    "systems-gallery": { summary: "install a complete knowledge system from the community, in one click.", page: "../how-to-contribute/systems-gallery.md" },
    "template-export": { summary: "bundle a canvas and its steps into one portable .zftemplate file.", page: "../architecture/zftemplate-schema.md" },
    "template-import": { summary: "install a .zftemplate bundle into your vault.", page: "../architecture/zftemplate-schema.md" },
    "manage-templates": { summary: "manage the systems and templates you have installed.", page: "../how-to-contribute/systems-gallery.md" },
    "base-dashboard": { summary: "compose chart panels over an Obsidian Base — a local Grafana for your vault.", page: "../development/base-dashboards.md" },
};

/** The best (first) door decides the section; the registry keeps doors best-first. */
const bestKind = (id: CapabilityId): DoorKind => CAPABILITY_DOORS[id].doors[0].kind;

/** Display name from the locale, falling back to the id so a missing key is visible, not silent. */
export const readerName = (id: CapabilityId): string => LOCALE[CAPABILITY_DOORS[id].nameKey] ?? id;

/** The whole page: registry in, reader-facing markdown out. Deterministic, Obsidian-free. */
export function capabilityIndex(): string {
    const lines: string[] = [
        CAPABILITY_INDEX_MARK,
        "<!-- Generated from CAPABILITIES. Do not edit by hand — regenerate with: UPDATE_DOCS=1 npx jest capabilityIndex -->",
        "",
        "# Everything it does",
        "",
        "The whole inventory, ranked by **how you reach each capability** — not by when it shipped. The",
        "practice loops the [README](https://github.com/RafaelGB/Obsidian-ZettelFlow#readme) opens with are",
        "on this list too; they lead because they *ask something of you*, not because they are the only",
        "things here. Generated from the plugin's own capability registry, so it cannot drift from the",
        "product.",
        "",
    ];

    for (const section of SECTIONS) {
        lines.push(`## ${section.heading}`, "");
        const members = CAPABILITIES.filter((id) => bestKind(id) === section.kind);
        if (members.length === 0) {
            lines.push(`*${section.empty}*`, "");
            continue;
        }
        if (section.blurb) lines.push(section.blurb, "");
        for (const id of members) {
            const entry = READER[id];
            lines.push(`- **${readerName(id)}** — ${entry.summary} [docs →](${entry.page})`);
        }
        lines.push("");
    }

    return lines.join("\n");
}
