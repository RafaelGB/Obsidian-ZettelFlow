import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
    mergeFrontmatterDelta,
    computeOnCreationDelta,
} from "application/patterns/postIndexRerunCore";
import type { ActionLookup } from "application/patterns/runOnCreationActions";
import { log } from "architecture/monitoring/Logger";
import type { Action, ExecuteInfo } from "architecture/api";

const act = (type: string, key: string, zone: string): Action => ({
    type,
    id: type,
    hasUI: false,
    key,
    zone,
});

/** A tiny stub store mapping an action type to a headless `execute(info)` impl. */
const store = (impls: Record<string, (info: ExecuteInfo) => void>): ActionLookup =>
    (type) => (impls[type] ? { execute: impls[type] } : undefined);

describe("mergeFrontmatterDelta (#200, FR-4, AC-4)", () => {
    beforeEach(() => jest.restoreAllMocks());

    it("folds the delta over existing keys, delta wins, untouched keys survive byte-for-byte", () => {
        const existing = { tags: ["a"], aliases: ["x"], custom: "keep" };
        const delta = { related: ["[[N]]"], maturity: 3 };

        const merged = mergeFrontmatterDelta(existing, delta);

        expect(merged).toEqual({
            tags: ["a"],
            aliases: ["x"],
            custom: "keep",
            related: ["[[N]]"],
            maturity: 3,
        });
    });

    it("overwrites only the keys present in the delta", () => {
        const existing = { related: ["[[old]]"], custom: "keep" };
        const delta = { related: ["[[new]]"] };

        const merged = mergeFrontmatterDelta(existing, delta);

        expect(merged.related).toEqual(["[[new]]"]);
        expect(merged.custom).toBe("keep");
    });

    it("does not mutate the inputs", () => {
        const existing = { custom: "keep" };
        const delta = { related: ["[[N]]"] };

        mergeFrontmatterDelta(existing, delta);

        expect(existing).toEqual({ custom: "keep" });
        expect(delta).toEqual({ related: ["[[N]]"] });
    });
});

describe("computeOnCreationDelta (#200, FR-8, AC-1/AC-6)", () => {
    beforeEach(() => jest.restoreAllMocks());

    it("populates a graph result the build-time-only pass leaves empty (AC-1)", async () => {
        const lookup = store({
            "find-related": (info) => info.content.addFrontMatter({ related: ["[[Note]]"] }),
        });

        const delta = await computeOnCreationDelta(
            { title: "X" },
            [act("find-related", "related", "frontmatter")],
            lookup,
            "Notes/Note.md"
        );

        expect(delta).toEqual({ related: ["[[Note]]"] });
    });

    it("collects only declared frontmatter-zone keys — context-zone results are excluded", async () => {
        const lookup = store({
            "find-related": (info) => info.content.addFrontMatter({ related: ["[[Note]]"] }),
            "extract-claims": (info) => { info.context.claims = ["c1"]; },
        });

        const delta = await computeOnCreationDelta(
            {},
            [act("find-related", "related", "frontmatter"), act("extract-claims", "claims", "context")],
            lookup,
            "Notes/Note.md"
        );

        expect(delta).toEqual({ related: ["[[Note]]"] });
        expect(delta).not.toHaveProperty("claims");
    });

    it("is best-effort per action: one throwing action never drops the others (AC-6)", async () => {
        const errorSpy = jest.spyOn(log, "error").mockImplementation(() => undefined);
        const lookup = store({
            "calculate-maturity": () => { throw new Error("boom"); },
            "find-related": (info) => info.content.addFrontMatter({ related: ["[[Note]]"] }),
        });

        const delta = await computeOnCreationDelta(
            {},
            [act("calculate-maturity", "maturity", "frontmatter"), act("find-related", "related", "frontmatter")],
            lookup,
            "Notes/Note.md"
        );

        expect(delta).toEqual({ related: ["[[Note]]"] });
        expect(delta).not.toHaveProperty("maturity");
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it("does not carry unrelated seed frontmatter keys into the delta (AC-4)", async () => {
        const lookup = store({
            "find-related": (info) => info.content.addFrontMatter({ related: ["[[Note]]"] }),
        });

        const delta = await computeOnCreationDelta(
            { aliases: ["keep"], custom: "keep" },
            [act("find-related", "related", "frontmatter")],
            lookup,
            "Notes/Note.md"
        );

        expect(delta).toEqual({ related: ["[[Note]]"] });
    });
});
