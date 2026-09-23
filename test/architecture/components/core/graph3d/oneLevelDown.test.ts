import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const RENDERER = read("src/architecture/components/core/graph3d/Graph3DRenderer.ts");

/**
 * **One level down, and no new toggle** (#527, epic #522).
 *
 * After #513 the hull, the colour and the legend all spoke at the **region** level. On the
 * reference vault that is one bubble containing 59 % of the notes — a sphere around most of the
 * graph — and one legend row that is almost the whole vault.
 *
 * The communities are the right size for all three: 17 of them, 9 to 36 notes. Seventeen labelled
 * bubbles is a map; one bubble is a bag.
 *
 * The trap was obvious and is refused here: a third colour mode beside *state* and *region*.
 * Three buttons to answer "what am I looking at" is worse than the problem.
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

const CODE = code(RENDERER);
const HULLS = (() => {
    const from = CODE.slice(CODE.indexOf("private rebuildHulls"));
    return from.slice(0, from.indexOf("private dropHull"));
})();
const LEGEND = (() => {
    const from = CODE.slice(CODE.indexOf("private legendRegionRows"));
    return from.slice(0, from.indexOf("private legendRegionRow("));
})();

describe("the bubble is a neighbourhood now (#527)", () => {
    it("groups the hulls by community, not by region", () => {
        // A region of five communities has to draw five bubbles. Grouping by `group` drew one.
        expect(HULLS).toContain("node.community");
        expect(HULLS).not.toMatch(/byGroup\.get\(node\.group\)/);
    });

    it("labels each one with the community's name", () => {
        expect(HULLS).toContain("node.communityName");
    });

    it("and the node takes the same colour as its bubble", () => {
        expect(CODE).toContain("communityColor(node.community)");
        expect(CODE).toContain("communityColor(gn.community)");
    });
});

describe("the legend groups without repeating itself (#527)", () => {
    it("puts a region heading over the communities inside it", () => {
        expect(LEGEND).toContain("legendRegionHeading");
        expect(LEGEND).toContain("byRegion");
    });

    it("renders no heading when a region holds a single community", () => {
        // "Region X" above a single row called "X" is the legend saying the same thing twice,
        // which is the failure this whole epic is built to avoid.
        expect(LEGEND).toMatch(/if \(communities\.length > 1\) this\.legendRegionHeading/);
    });

    it("counts from what is on screen, not from the model", () => {
        expect(LEGEND).toContain("displayed.nodes");
    });
});

describe("framing works at both levels, and is still only a camera (#527)", () => {
    it("frames a community from a row and a whole region from its heading", () => {
        // **By index since #533**, not by name: `node.communityName === name` framed every
        // neighbourhood sharing a label, and the reference vault has two called `readme`. The
        // assertion is kept rather than deleted, pointing at the predicate that replaced it.
        expect(CODE).toContain("private frameCommunity(index: number): void");
        expect(CODE).toContain("private frameWholeRegion(region: string): void");
        expect(CODE).toContain("belongsToCommunity(index)");
        expect(CODE).not.toContain("node.communityName === name");
        expect(CODE).toContain("node.region === region");
    });

    it("hides nothing at either level", () => {
        // #515 made this rule for regions; one shared helper now carries it for both, so there is
        // one place a refactor could break it and one place asserting it cannot.
        const frame = CODE.slice(CODE.indexOf("private frameBy"));
        const body = frame.slice(0, 700);
        expect(body).toContain("zoomToFit(");
        expect(body).not.toContain("setLit");
        expect(body).not.toContain("filterGraph3D");
        expect(body).not.toContain("hiddenNodes");
    });

    it("keeps every framable row keyboard-operable through one helper", () => {
        const helper = CODE.slice(CODE.indexOf("private makeFramable"));
        const body = helper.slice(0, 700);
        expect(body).toContain("tabIndex");
        expect(body).toContain('"keydown"');
        expect(body).toContain('role", "button');
    });
});

describe("no third colour mode (#527)", () => {
    it("still offers exactly two", () => {
        // If this had needed a third button, FR-4 said the toggle wins and the feature waits.
        expect((CODE.match(/this\.addColorButton\(/g) ?? [])).toHaveLength(2);
        expect(CODE).toContain('type ColorMode = "state" | "neighbourhood"');
    });
});

describe("arrival names both levels (#527)", () => {
    it("says the neighbourhood and the region it sits in", () => {
        const arrival = CODE.slice(CODE.indexOf("private arrivalFact"));
        const body = arrival.slice(0, 700);
        expect(body).toContain("node.communityName");
        expect(body).toContain("node.region");
    });

    it("carries three placeholders in both locales, and still states rather than advises", () => {
        const REPROACH = [/\bshould\b/i, /\byou have\b/i, /\bdeberías\b/i, /\bconecta\b/i, /\btodavía\b/i];
        for (const [name, locale] of [["en", en], ["es", es]] as const) {
            const value = (locale as Record<string, string>).graph3d_status_in_region;
            for (const slot of ["{0}", "{1}", "{2}"]) {
                expect({ name, slot, has: value.includes(slot) }).toEqual({ name, slot, has: true });
            }
            expect({ name, offends: REPROACH.some((p) => p.test(value)) }).toEqual({ name, offends: false });
        }
    });
});

describe("the legend has to fit on screen (#527)", () => {
    it("is bounded and scrolls", () => {
        // Before #527 this was about nine region rows. It is now up to seventeen neighbourhoods
        // plus their headings, anchored to the bottom and growing upward — off the top of a side
        // panel. Found by rendering it, which is the one thing a node test suite cannot do.
        const scss = read("src/styles/components/graph3d.scss");
        const box = scss.slice(scss.indexOf(".zettelkasten-flow__graph3d-legend {"));
        const body = box.slice(0, box.indexOf("}"));
        expect(body).toContain("max-height");
        expect(body).toContain("overflow-y: auto");
        // The container sets `pointer-events: none` so the gaps pass clicks to the graph; a
        // scrollable box has to take them back or it cannot receive the wheel.
        expect(body).toContain("pointer-events: auto");
    });
});
