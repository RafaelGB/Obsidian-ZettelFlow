import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { REGION_COLORS, regionColor, ALONE_COLOR } from "architecture/knowledge/map/graph3d";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const RENDERER = read("src/architecture/components/core/graph3d/Graph3DRenderer.ts");
const SCSS = read("src/styles/components/graph3d.scss");

/**
 * **The colour, the bubble and the legend say the same thing** (#515, epic #512).
 *
 * Reading it turned up two hue expressions that disagreed: `clusterHue()` at 62 % lightness for
 * the halo and the hull, `baseNodeColor()` at 66 % for the node. The same region, two colours,
 * four per cent apart — which is exactly why it drifted unnoticed.
 *
 * The generated `hsl()` also had to go for a second reason: a legend swatch is DOM, this repo
 * forbids inline `el.style.*`, and a colour computed at runtime cannot reach a stylesheet without
 * one. So the palette is a fixed list, mirrored by SCSS classes — the arrangement
 * `RELATION_COLOR_VARS` already uses, with the same guardrail keeping the two honest.
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

describe("one colour per region, from one place (#515)", () => {
    it("gives a region a colour and alone its own", () => {
        expect(regionColor(0)).toBe(REGION_COLORS[0]);
        expect(regionColor(-1)).toBe(ALONE_COLOR);
    });

    it("wraps rather than running out", () => {
        // #513 left the reference vault with nine regions; twelve colours is headroom, not a
        // guess. Two distant regions sharing a hue is survivable — a colour that cannot be
        // styled is not.
        expect(REGION_COLORS).toHaveLength(12);
        expect(regionColor(REGION_COLORS.length)).toBe(REGION_COLORS[0]);
    });

    it("leaves no second hue expression in the renderer", () => {
        expect(code(RENDERER)).not.toContain("hsl(");
        expect(code(RENDERER)).not.toContain("clusterHue");
        expect(code(RENDERER)).toContain("regionColor(");
    });

    it("keeps the stylesheet in step with the palette", () => {
        // The swatches are CSS classes because inline styles are forbidden, so the two lists can
        // drift. They do not, and this is why.
        REGION_COLORS.forEach((colour, index) => {
            const rule = new RegExp(`graph3d-swatch--region-${index}\\s*\\{[^}]*${colour.replace("#", "#")}`, "i");
            expect({ index, colour, inScss: rule.test(SCSS) }).toEqual({ index, colour, inScss: true });
        });
        expect(SCSS.toLowerCase()).toContain(ALONE_COLOR.toLowerCase());
    });
});

describe("every real region gets a bubble (#515)", () => {
    it("has no cap left over from the 31-region days", () => {
        // The cap was written when a 421-note vault produced 31 regions covering 27 % of it. With
        // an honest partition there are single digits, and the cap only hid them.
        expect(code(RENDERER)).not.toContain("made >= 12");
        expect(code(RENDERER)).toContain("HULL_MIN_NODES");
    });
});

describe("framing is a camera move, and only that (#515)", () => {
    it("reaches the camera", () => {
        const frame = code(RENDERER).slice(code(RENDERER).indexOf("private frameRegion"));
        expect(frame.slice(0, 700)).toContain("zoomToFit(");
    });

    it("hides nothing", () => {
        // A region filter would be a fourth way to narrow a graph that already has a query, a lens
        // and a time cursor. Asserted at the source so a later refactor cannot turn "show me this"
        // into "hide the rest" without this failing.
        const frame = code(RENDERER).slice(code(RENDERER).indexOf("private frameRegion"));
        const body = frame.slice(0, 700);
        expect(body).not.toContain("setLit");
        expect(body).not.toContain("filterGraph3D");
        expect(body).not.toContain("hiddenNodes");
    });

    it("clears when you click the framed region again", () => {
        expect(code(RENDERER)).toContain("framedRegion");
    });
});

describe("the legend is reachable without a mouse (#515)", () => {
    it("makes the region rows focusable and keyboard-operable", () => {
        // #325 is open on keyboard operability. This must not add to it.
        const rows = code(RENDERER).slice(code(RENDERER).indexOf("private legendRegionRows"));
        const body = rows.slice(0, rows.indexOf("private legendKindRow"));
        expect(body).toContain("tabIndex");
        expect(body).toContain('"keydown"');
    });

    it("styles through classes, never inline", () => {
        const rows = code(RENDERER).slice(code(RENDERER).indexOf("private legendRegionRows"));
        expect(rows.slice(0, rows.indexOf("private legendKindRow"))).not.toContain(".style.");
    });
});
