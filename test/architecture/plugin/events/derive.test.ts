import { describe, it, expect } from "@jest/globals";
import { deriveFrontmatterEvents, moveBaseline, seedBaselines } from "architecture/plugin/events/derive";

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

describe("seedBaselines — the first edit of a note has an old value", () => {
    it("remembers notes it does not know, so a property added to one is a change", () => {
        const baselines = new Map<string, Record<string, unknown>>();
        seedBaselines(baselines, [[NOTE, undefined]]);

        expect(deriveFrontmatterEvents(NOTE, baselines.get(NOTE), { status: "done" })).toEqual([
            { event: "property.changed", notePath: NOTE, property: "status", oldValue: undefined, newValue: "done" },
        ]);
    });

    it("keeps what it already remembered and copies, so the live cache cannot hide a change", () => {
        const live: Record<string, unknown> = { status: "draft" };
        const baselines = new Map<string, Record<string, unknown>>([[NOTE, { status: "known" }]]);
        seedBaselines(baselines, [[NOTE, live], ["other.md", live]]);
        live.status = "done";

        expect(baselines.get(NOTE)).toEqual({ status: "known" });
        expect(baselines.get("other.md")).toEqual({ status: "draft" });
    });
});

describe("moveBaseline — a renamed note keeps its old value", () => {
    it("carries the baseline to the new path, so the first change after a rename still fires", () => {
        const baselines = new Map<string, Record<string, unknown>>([["old.md", { status: "draft" }]]);
        moveBaseline(baselines, "old.md", "new.md");
        expect(baselines.has("old.md")).toBe(false);
        expect(deriveFrontmatterEvents("new.md", baselines.get("new.md"), { status: "done" })).toHaveLength(1);
    });

    it("does nothing for a note it never knew", () => {
        const baselines = new Map<string, Record<string, unknown>>();
        moveBaseline(baselines, "a.md", "b.md");
        expect(baselines.size).toBe(0);
    });
});
