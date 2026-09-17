import { describe, it, expect } from "@jest/globals";
import {
    diffFrontmatter,
    isChange,
    snapshotFrontmatter,
} from "application/writes/frontmatterDiff";

describe("what a frontmatter write actually changed (#453)", () => {
    it("reports only the keys that differ", () => {
        const change = diffFrontmatter(
            { status: "seed", title: "Unchanged" },
            { status: "grown", title: "Unchanged" }
        );
        expect(change.before).toEqual({ status: "seed" });
        expect(change.after).toEqual({ status: "grown" });
    });

    it("records a key that did not exist as absent, so it can be removed again", () => {
        const change = diffFrontmatter({}, { id: "202601011200" });
        expect(change.before).toEqual({ id: undefined });
        expect(change.after).toEqual({ id: "202601011200" });
        expect("id" in change.before).toBe(true);
    });

    it("records a removed key as the value it had", () => {
        const change = diffFrontmatter({ draft: true }, {});
        expect(change.before).toEqual({ draft: true });
        expect(change.after).toEqual({ draft: undefined });
    });

    it("says nothing changed when a hook set a property to the value it already had", () => {
        const change = diffFrontmatter({ status: "grown" }, { status: "grown" });
        expect(isChange(change)).toBe(false);
    });

    it("compares arrays and objects by value, not by identity", () => {
        expect(isChange(diffFrontmatter({ tags: ["a", "b"] }, { tags: ["a", "b"] }))).toBe(false);
        expect(isChange(diffFrontmatter({ tags: ["a"] }, { tags: ["a", "b"] }))).toBe(true);
    });

    it("treats a value it cannot compare as changed, rather than losing the undo", () => {
        const one: Record<string, unknown> = {};
        one.self = one;
        const other: Record<string, unknown> = {};
        other.self = other;
        expect(isChange(diffFrontmatter({ x: one }, { x: other }))).toBe(true);
        // The same object is still the same value — identity answers before serialisation is tried.
        expect(isChange(diffFrontmatter({ x: one }, { x: one }))).toBe(false);
    });

    it("snapshots deeply, so a mutation in place is still seen as a change", () => {
        const frontmatter: Record<string, unknown> = { tags: ["a"] };
        const before = snapshotFrontmatter(frontmatter);
        (frontmatter.tags as string[]).push("b");
        expect(isChange(diffFrontmatter(before, frontmatter))).toBe(true);
        expect(before.tags).toEqual(["a"]);
    });

    it("keeps a value it cannot clone rather than dropping the key", () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(snapshotFrontmatter({ x: cyclic }).x).toBe(cyclic);
    });
});
