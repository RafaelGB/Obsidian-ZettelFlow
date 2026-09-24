import { describe, it, expect } from "@jest/globals";
import { registeredCommands, addCommandCallSites } from "../helpers/registeredCommands";

/**
 * The palette, frozen before the epic touches it (#575, epic #574).
 *
 * Two later issues assert against this list and neither means anything without it: #576 moves a
 * mechanic between surfaces and must not break a hotkey, and #578 hands nine command-only
 * capabilities a real door **without growing the palette**. "The count did not increase" is only
 * checkable against a number somebody wrote down first.
 *
 * Thirteen of these are aliases for views that no longer exist, kept on purpose so a binding never
 * breaks (§XI). They are not clutter to be cleaned up later; they are the promise that retiring a
 * view costs the user nothing.
 *
 * Measured at `ae0db945`, before any of #575–#578 changed a line.
 */
const FROZEN = [
    "ask-your-graph",
    "browse-systems",
    "build-map-of-content",
    "change-note-state",
    "cultivate",
    "derive-project",
    "editor-menu-flow",
    "explore-in-3d",
    "explore-reasoning-paths",
    "export-canvas-template",
    "generate-weekly-review",
    "import-canvas-template",
    "open-canvas",
    "open-community-templates",
    "open-manage-templates",
    "open-script-workbench",
    "open-workflow",
    "quick-capture",
    "remove-relation",
    "resurface-related-notes",
    "return-to-this-claim",
    "run-canvas-flow",
    "show-concept-nav",
    "show-discoveries",
    "show-discovery",
    "show-evidence-map",
    "show-evolution-timeline",
    "show-graph",
    "show-health",
    "show-home",
    "show-knowledge-dashboard",
    "show-knowledge-map",
    "show-notes-history",
    "show-open-questions",
    "show-slipbox-health",
    "show-thinking-heatmap",
    "split-note-into-atomic-notes",
    "think",
    "think-about-this-note",
];

describe("the frozen palette (#575)", () => {
    it("registers thirty-nine commands", () => {
        expect(FROZEN).toHaveLength(39);
    });

    it("still resolves every id it had before the epic", () => {
        const missing = FROZEN.filter((id) => !registeredCommands().includes(id));
        expect(missing).toEqual([]);
    });

    it("has not grown", () => {
        // #578 may make this list *shorter* — a capability that is merged takes its command with
        // it. It may never make it longer: a new command is the door this epic exists to refuse.
        expect(registeredCommands().length).toBeLessThanOrEqual(FROZEN.length);
    });

    it("keeps every id a literal, so the scan cannot be evaded", () => {
        // 29 call sites: 28 with a literal id, plus the one loop over `SURFACE_COMMANDS` whose
        // eleven ids the scan reads from the table instead. A 30th site means a registration the
        // frozen list above does not know about.
        expect(addCommandCallSites()).toBe(29);
    });

    it("reports a command that vanished rather than trusting anyone to notice", () => {
        const pretend = registeredCommands().filter((id) => id !== "cultivate");
        expect(FROZEN.filter((id) => !pretend.includes(id))).toEqual(["cultivate"]);
    });
});
