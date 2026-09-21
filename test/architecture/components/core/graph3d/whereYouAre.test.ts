import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const RENDERER = read("src/architecture/components/core/graph3d/Graph3DRenderer.ts");

/**
 * **Opened from a note, you know where you are** (#517, epic #512).
 *
 * `consumeGraph3DFocus()` flies the camera to a note and leaves you at a dot in a cloud, while the
 * status line talks about the graph — colour mode, node count, active lens — and never about where
 * you landed.
 *
 * It is the sentence that makes the rest of the epic pay off. A region you can name is a region
 * you can be *in*; without this, naming them is decoration.
 */

function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

const STATUS = (() => {
    const body = code(RENDERER).slice(code(RENDERER).indexOf("private updateStatus"));
    return body.slice(0, body.indexOf("private renderLegend"));
})();

describe("the status line says where you landed (#517)", () => {
    it("names the region, and how big it is", () => {
        expect(STATUS).toContain("graph3d_status_in_region");
        expect(STATUS).toContain("arrivedAt");
    });

    it("says so plainly when the note is alone", () => {
        expect(STATUS).toContain("graph3d_status_alone");
    });

    it("reads the region off the node instead of recomputing it", () => {
        // #513 and #514 already put the answer there: `region` is the name, `group < 0` is alone.
        // A second buildKnowledgeMap call here would be a second traversal for a fact in hand.
        expect(STATUS).toContain(".region");
        expect(STATUS).not.toContain("buildKnowledgeMap");
    });

    it("counts from what is on screen, like the legend", () => {
        expect(STATUS).toContain("displayed.nodes");
    });
});

describe("arriving is a moment, not a banner (#517)", () => {
    it("is set when the flight starts", () => {
        const fly = code(RENDERER).slice(code(RENDERER).indexOf("private flyToPendingFocus"));
        expect(fly.slice(0, 400)).toContain("this.arrivedAt =");
    });

    it("clears when focus is cleared and when a node is pinned", () => {
        const clear = code(RENDERER).slice(code(RENDERER).indexOf("private clearFocus"));
        expect(clear.slice(0, 500)).toContain("this.arrivedAt = null");
        const pin = code(RENDERER).slice(code(RENDERER).indexOf("private onClick"));
        expect(pin.slice(0, 900)).toContain("this.arrivedAt = null");
    });
});

describe("it states, and never nudges (#517, §XII)", () => {
    it("carries both keys in both locales", () => {
        for (const key of ["graph3d_status_in_region", "graph3d_status_alone"]) {
            expect({ key, en: key in en, es: key in es }).toEqual({ key, en: true, es: true });
        }
    });

    it("says nothing about what you ought to do with it", () => {
        // A note being alone is a fact. "Connect it" is advice, and advice on arrival is the
        // surface deciding what you came for.
        const REPROACH = [
            /\bstill\b/i, /\byou have\b/i, /\bshould\b/i, /\bwhy not\b/i,
            /\btodavía\b/i, /\bllevas\b/i, /\bdeberías\b/i, /\bconecta\b/i,
        ];
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            for (const key of ["graph3d_status_in_region", "graph3d_status_alone"]) {
                const value = (locale as Record<string, string>)[key];
                expect({ name, key, offends: REPROACH.some((p) => p.test(value)) }).toEqual({ name, key, offends: false });
            }
        }
    });
});
