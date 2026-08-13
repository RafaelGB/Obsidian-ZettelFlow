import { describe, it, expect } from "@jest/globals";
import { deriveFrontmatterEvents } from "architecture/plugin/events/derive";

const NOTE = "notes/idea.md";

describe("synthesized event derivation from a frontmatter snapshot diff (AC-11, FR-2)", () => {
    it("yields property.changed for a changed key", () => {
        const events = deriveFrontmatterEvents(NOTE, { state: "fleeting" }, { state: "permanent" });
        expect(events).toEqual([
            {
                event: "property.changed",
                notePath: NOTE,
                property: "state",
                oldValue: "fleeting",
                newValue: "permanent",
            },
        ]);
    });

    it("yields property.changed for a newly-added key", () => {
        const events = deriveFrontmatterEvents(NOTE, {}, { priority: 3 });
        expect(events).toEqual([
            {
                event: "property.changed",
                notePath: NOTE,
                property: "priority",
                oldValue: undefined,
                newValue: 3,
            },
        ]);
    });

    it("yields nothing for an unchanged key", () => {
        expect(deriveFrontmatterEvents(NOTE, { state: "fleeting" }, { state: "fleeting" })).toEqual(
            []
        );
    });

    it("yields nothing for identical snapshots (deterministic)", () => {
        const fm = { state: "permanent", tags: ["a", "b"], nested: { x: 1 } };
        expect(deriveFrontmatterEvents(NOTE, fm, { ...fm })).toEqual([]);
    });

    it("yields tag.added for each newly-present tag (array form)", () => {
        const events = deriveFrontmatterEvents(NOTE, { tags: ["a"] }, { tags: ["a", "b", "c"] });
        expect(events).toEqual([
            { event: "tag.added", notePath: NOTE, tag: "b" },
            { event: "tag.added", notePath: NOTE, tag: "c" },
        ]);
    });

    it("supports a single-string tags value", () => {
        const events = deriveFrontmatterEvents(NOTE, {}, { tags: "solo" });
        expect(events).toEqual([{ event: "tag.added", notePath: NOTE, tag: "solo" }]);
    });

    it("does not report the tags key as a property.changed (tags are their own event)", () => {
        const events = deriveFrontmatterEvents(NOTE, { tags: ["a"] }, { tags: ["a", "b"] });
        expect(events.every((event) => event.event !== "property.changed")).toBe(true);
    });

    it("handles missing snapshots (first sight of a note) without throwing", () => {
        expect(deriveFrontmatterEvents(NOTE, undefined, { state: "fleeting" })).toEqual([
            {
                event: "property.changed",
                notePath: NOTE,
                property: "state",
                oldValue: undefined,
                newValue: "fleeting",
            },
        ]);
    });
});
