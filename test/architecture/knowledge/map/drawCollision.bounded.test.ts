import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/architecture/knowledge/map → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(join(ROOT, "src/architecture/knowledge/map/drawCollision.ts"), "utf8");

/** Comments explain what the code must not do, and say the words while doing it. */
function code(source: string): string {
    return source
        .split(String.fromCharCode(10))
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join(String.fromCharCode(10));
}

const BODY = code(SOURCE);

/**
 * Nobody enumerates it (#566, the #530 rule restated for a set forty times larger).
 *
 * #529 established this when the candidate set was 1.26 M pairs: the full list is not a thing this
 * product can return. Here the space is ~48.7 M pairs at ten thousand notes, and the whole design
 * is that it is never built — so the rule is asserted on the source, the way the write seam is.
 */
describe("the pair space is never materialised (#566)", () => {
    it("builds no cross product", () => {
        for (const forbidden of ["crossProduct", "allPairs", "flatMap(", "for (let j"]) {
            expect({ forbidden, found: BODY.includes(forbidden) }).toEqual({ forbidden, found: false });
        }
    });

    it("never wakes the heaviest projection in the product", () => {
        // `findDiscoveries` is 1.5 s at ten thousand notes (#457). A dice roll may not cost that,
        // and a gap is the complement of this anyway — reading it would be asking the wrong index.
        for (const forbidden of ["findDiscoveries", "gapTally", "topGaps", "openGaps", "discovery/"]) {
            expect({ forbidden, found: BODY.includes(forbidden) }).toEqual({ forbidden, found: false });
        }
    });

    it("is bounded, and the bound is a named constant", () => {
        expect(BODY).toContain("COLLISION_DRAW_ATTEMPTS");
        expect(BODY).toMatch(/attempt < COLLISION_DRAW_ATTEMPTS/);
    });

    it("reads no clock and rolls no unseeded dice", () => {
        // The seed is an argument, so every draw is reproducible and nothing depends on the day.
        for (const forbidden of ["Math.random", "Date.now", "new Date"]) {
            expect({ forbidden, found: BODY.includes(forbidden) }).toEqual({ forbidden, found: false });
        }
    });

    it("stays out of Obsidian, like every other projection", () => {
        expect(BODY).not.toContain('from "obsidian"');
    });

    it("memoises what is a function of the model, and nothing that is a function of the seed", () => {
        // The partition is pure; the draw is not. A cache keyed by seed is a list of pairs.
        expect(BODY).toContain('memoise("collisionPartition"');
        expect(BODY).not.toMatch(/memoise\("collisionDraw/);
    });
});
