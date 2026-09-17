import { describe, it, expect } from "@jest/globals";
import { nodeBadges, NODE_BADGE_LABEL_KEY } from "architecture/plugin/workflow/nodeBadges";

describe("a node says what it does (#429)", () => {
    it("says which step the flow starts on", () => {
        // A root without an event trigger is not a WHEN block, so until this badge the canvas said
        // nothing at all about where a flow begins — including when the root is a group.
        expect(nodeBadges({ root: true }).map((badge) => badge.kind)).toEqual(["start"]);
        expect(nodeBadges({ root: false })).toEqual([]);
    });

    it("counts the questions it asks, ignoring what runs in the background", () => {
        const badges = nodeBadges({
            actions: [{ hasUI: true }, { hasUI: false }, { hasUI: true }],
        });
        expect(badges).toEqual([{ kind: "asks", labelKey: NODE_BADGE_LABEL_KEY.asks, count: 2 }]);
    });

    it("says it writes a template", () => {
        expect(nodeBadges({ body: "# {{title}}" }).map((badge) => badge.kind)).toEqual(["template"]);
        expect(nodeBadges({ body: "   " })).toEqual([]);
    });

    it("says it creates a linked note", () => {
        expect(nodeBadges({ satellite: { template: "x" } }).map((b) => b.kind)).toEqual(["satellite"]);
    });

    it("says it can be skipped", () => {
        expect(nodeBadges({ optional: true }).map((badge) => badge.kind)).toEqual(["optional"]);
        expect(nodeBadges({ optional: false })).toEqual([]);
    });

    it("says some of its exits are conditional", () => {
        expect(nodeBadges({ exits: { a: { when: "frontmatter.x === 1" } } }).map((b) => b.kind)).toEqual([
            "gated",
        ]);
        // An exit that only renames the option is not a condition.
        expect(nodeBadges({ exits: { a: { when: "  " } } })).toEqual([]);
    });

    it("reads in one order, whatever order the settings were written in", () => {
        const badges = nodeBadges({
            optional: true,
            exits: { a: { when: "true" } },
            satellite: {},
            body: "x",
            actions: [{ hasUI: true }],
            root: true,
        });
        expect(badges.map((badge) => badge.kind)).toEqual([
            "start",
            "asks",
            "template",
            "satellite",
            "optional",
            "gated",
        ]);
    });

    it("says nothing about a step that does nothing yet", () => {
        expect(nodeBadges({})).toEqual([]);
        expect(nodeBadges(undefined)).toEqual([]);
        expect(nodeBadges({ actions: [] })).toEqual([]);
    });
});
