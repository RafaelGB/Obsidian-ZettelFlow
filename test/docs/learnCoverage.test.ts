import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { CAPABILITIES, type CapabilityId } from "architecture/components/core/surface/capabilities";

// test/docs → 2 ups → repo root
const CATALOG = join(__dirname, "..", "..", "docs", "learn", "catalog.json");

/**
 * **Learn knows every capability** (#801 FR-5, AC-2; decision 6 on #797).
 *
 * Learn is where a person goes to learn *anything* ZettelFlow does, so a capability added to
 * `CAPABILITIES` without a tutorial's *Do it now* or a reference row naming it fails here — the
 * build tells the author Learn has not been told.
 *
 * A capability that genuinely cannot be covered in the same change goes in this register with the
 * issue that will cover it. It can only shrink: a registered capability that becomes covered fails
 * until its row is removed — the `DOORLESS` ratchet.
 */
const UNCOVERED: Partial<Record<CapabilityId, string>> = {};

const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    tutorials: Record<string, { tryIt?: { capability?: string } }>;
    reference: { capability?: string }[];
};

const covered = new Set<string>([
    ...Object.values(catalog.tutorials).map((tutorial) => tutorial.tryIt?.capability),
    ...catalog.reference.map((row) => row.capability),
].filter((id): id is string => typeof id === "string"));

describe("every capability is in Learn (#801 AC-2)", () => {
    it("covers each capability with a tutorial or a reference row, or registers it with an issue", () => {
        const missing = CAPABILITIES.filter((id) => !covered.has(id) && !UNCOVERED[id]);
        expect(missing).toEqual([]);
    });

    it("keeps no stale exception: a covered capability leaves the register", () => {
        expect(Object.keys(UNCOVERED).filter((id) => covered.has(id))).toEqual([]);
    });

    it("names an issue for every exception", () => {
        expect(Object.entries(UNCOVERED).filter(([, reason]) => !/#\d+/.test(reason ?? ""))).toEqual([]);
    });

    it("names only capabilities that exist", () => {
        expect([...covered].filter((id) => !(CAPABILITIES as readonly string[]).includes(id))).toEqual([]);
    });
});
