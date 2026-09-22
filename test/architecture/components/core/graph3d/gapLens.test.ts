import { describe, it, expect } from "@jest/globals";
import { OVERLAY_KINDS, OVERLAY_SPECS } from "architecture/knowledge/map/graph3d";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * **The map draws what is not there** (#532, epic #529).
 *
 * Every lens so far narrows what is already in `Graph3DData`: a node predicate for six of them, an
 * edge predicate since #526. A **gap** is a pair of notes that share context and were never
 * linked, so there is nothing in the data to match — the thing being drawn does not exist.
 *
 * That is a third **kind** of lens, not a seventh special case, and the difference is load-bearing:
 * the renderer branches once per kind, so a candidate lens cannot quietly acquire a predicate that
 * would have to lie about something.
 */
describe("a third kind of lens, one that draws candidates (#532, FR-1, AC-1)", () => {
    it("has a gaps lens, and it matches nothing because there is nothing to match", () => {
        expect(OVERLAY_KINDS).toContain("gaps");
        const spec = OVERLAY_SPECS.gaps;
        expect(spec.on).toBe("candidate");
        expect("matches" in spec).toBe(false);
        expect(spec.colorVar.startsWith("--")).toBe(true);
    });

    it("leaves the six that were already there exactly as they were", () => {
        expect(OVERLAY_SPECS.bridges.on).toBe("edge");
        for (const kind of ["orphans", "dead-ends", "contradictions", "alone", "frontier"] as const) {
            expect(OVERLAY_SPECS[kind].on).toBe("node");
        }
    });

    it("keeps the kinds and the table in step, so a new lens cannot skip the table", () => {
        expect(new Set(OVERLAY_KINDS).size).toBe(OVERLAY_KINDS.length);
        expect(Object.keys(OVERLAY_SPECS).sort()).toEqual([...OVERLAY_KINDS].sort());
    });
});

describe("the lens has a name, in both languages (#532, FR-10, AC-9)", () => {
    it("names it in en and es", () => {
        expect(en.graph3d_overlay_gaps).toBe("Gaps");
        expect(es.graph3d_overlay_gaps).toBe("Huecos");
    });

    it("states rather than advises, and is sentence case", () => {
        for (const label of [en.graph3d_overlay_gaps, es.graph3d_overlay_gaps]) {
            // A gap is a fact about the graph. "Link these" would be the surface deciding what you
            // came for (§XII), and the other lens labels are nouns for the same reason.
            expect(label).not.toMatch(/should|deber|link these|enlaza|conecta/i);
            // Sentence case: one leading capital, and no Title Case Second Word.
            expect(label.split(" ").slice(1).every((word) => word[0] !== word[0]?.toUpperCase())).toBe(true);
        }
    });
});
