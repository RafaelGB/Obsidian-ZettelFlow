import { describe, it, expect } from "@jest/globals";
import {
    GRAPH_TERM_FIELDS,
    GRAPH_TERM_COMPARISONS,
    buildGraphTerm,
} from "architecture/components/core/askGraph/graphTermBuilder";

/**
 * The guided term builder (#323 G5), mirroring the #235 condition builder: a `{field, comparison?,
 * value?, negate?}` selection chosen from pickers becomes a valid graph-query **term** — the exact
 * shape `runGraphQuery` parses. Pure and Obsidian-free, so a non-writer composes a valid predicate
 * from menus and every emitted term round-trips through the parser. Validates first: a gap returns a
 * reason, never a broken term.
 */
describe("guided graph-term builder (#323 G5)", () => {
    it("exposes one field per query predicate, in menu order", () => {
        const ids = GRAPH_TERM_FIELDS.map((f) => f.id);
        expect(ids).toEqual([
            "state",
            "relation",
            "incoming",
            "folder",
            "about",
            "older-than",
            "newer-than",
            "degree",
            "hub",
            "orphan",
            "leaf",
            "unsourced",
        ]);
    });

    it("offers the five numeric comparisons for degree", () => {
        expect(GRAPH_TERM_COMPARISONS).toEqual([">=", "<=", ">", "<", "="]);
        expect(GRAPH_TERM_FIELDS.find((f) => f.id === "degree")?.comparison).toBe(true);
    });

    describe("value-less fields", () => {
        it("emits the bare token", () => {
            expect(buildGraphTerm({ field: "hub" })).toEqual({ ok: true, term: "hub" });
            expect(buildGraphTerm({ field: "orphan" })).toEqual({ ok: true, term: "orphan" });
            expect(buildGraphTerm({ field: "leaf" })).toEqual({ ok: true, term: "leaf" });
            expect(buildGraphTerm({ field: "unsourced" })).toEqual({ ok: true, term: "unsourced" });
        });

        it("negation prepends !", () => {
            expect(buildGraphTerm({ field: "orphan", negate: true })).toEqual({ ok: true, term: "!orphan" });
        });
    });

    describe("text fields", () => {
        it("emits field:value", () => {
            expect(buildGraphTerm({ field: "state", value: "permanent" })).toEqual({ ok: true, term: "state:permanent" });
            expect(buildGraphTerm({ field: "folder", value: "Projects" })).toEqual({ ok: true, term: "folder:Projects" });
        });

        it("keeps a colon so relation:<type>:<target> composes", () => {
            expect(buildGraphTerm({ field: "relation", value: "contradicts:ideaA" })).toEqual({
                ok: true,
                term: "relation:contradicts:ideaA",
            });
        });

        it("allows spaces in a folder path", () => {
            expect(buildGraphTerm({ field: "folder", value: "My Projects" })).toEqual({
                ok: true,
                term: "folder:My Projects",
            });
        });

        it("trims and negates", () => {
            expect(buildGraphTerm({ field: "about", value: "  climate  ", negate: true })).toEqual({
                ok: true,
                term: "!about:climate",
            });
        });

        it("rejects an empty value", () => {
            expect(buildGraphTerm({ field: "state", value: "   " }).ok).toBe(false);
        });

        it("rejects a value that embeds a boolean keyword (would corrupt the query)", () => {
            expect(buildGraphTerm({ field: "about", value: "cats AND dogs" }).ok).toBe(false);
            expect(buildGraphTerm({ field: "about", value: "a or b" }).ok).toBe(false);
        });
    });

    describe("numeric age fields", () => {
        it("emits field:<n>", () => {
            expect(buildGraphTerm({ field: "older-than", value: "30" })).toEqual({ ok: true, term: "older-than:30" });
            expect(buildGraphTerm({ field: "newer-than", value: "7" })).toEqual({ ok: true, term: "newer-than:7" });
        });

        it("rejects a non-integer or negative value", () => {
            expect(buildGraphTerm({ field: "older-than", value: "3.5" }).ok).toBe(false);
            expect(buildGraphTerm({ field: "older-than", value: "-1" }).ok).toBe(false);
            expect(buildGraphTerm({ field: "older-than", value: "abc" }).ok).toBe(false);
            expect(buildGraphTerm({ field: "older-than", value: "" }).ok).toBe(false);
        });
    });

    describe("degree (comparison + number)", () => {
        it("emits degree<cmp><n> with no colon or spaces", () => {
            expect(buildGraphTerm({ field: "degree", comparison: ">=", value: "5" })).toEqual({
                ok: true,
                term: "degree>=5",
            });
            expect(buildGraphTerm({ field: "degree", comparison: "<", value: "2", negate: true })).toEqual({
                ok: true,
                term: "!degree<2",
            });
        });

        it("rejects a missing or unknown comparison", () => {
            expect(buildGraphTerm({ field: "degree", value: "5" }).ok).toBe(false);
            expect(buildGraphTerm({ field: "degree", comparison: "~", value: "5" }).ok).toBe(false);
        });
    });

    it("rejects an unknown field", () => {
        expect(buildGraphTerm({ field: "nope", value: "x" }).ok).toBe(false);
    });
});
