import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const RAW = readFileSync(join(ROOT, "src/architecture/components/core/graph3d/Graph3DRenderer.ts"), "utf8");

/** The source with its comments removed, so a rule is never satisfied by prose about the rule. */
const CODE = RAW.split("\n")
    .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

function slice(from: string, to: string): string {
    const start = CODE.indexOf(from);
    expect(start).toBeGreaterThan(-1);
    const end = CODE.indexOf(to, start + from.length);
    return CODE.slice(start, end > start ? end : undefined);
}

/**
 * **The gap lens costs nothing until it is used, and moves nothing when it is** (#532, epic #529).
 *
 * Both halves are source-scanned rather than exercised, and that is the honest instrument here:
 * `jest.config.js` runs `testEnvironment: "node"` with no jsdom, so this view cannot be mounted at
 * all. Every `graph3d` suite in this folder works the same way, and the behaviour a scan cannot
 * reach is a manual step in the issue (§XIV) rather than a test that pretends.
 */
describe("the render path never pays for the gap projection (#532, FR-9, AC-6)", () => {
    it("reads it in exactly one method, and calls that method from exactly one place", () => {
        const reader = slice("private ensureGapSource", "private syncEdgeLens");
        expect(reader).toContain("gapTally(model).size");
        expect(reader).toContain("topGaps(model, GAP_DRAW_MAX)");

        // Nowhere else. A second reader is a second render paying 982 ms at ten thousand notes.
        const outside = CODE.replace(reader, "");
        expect(outside).not.toContain("gapTally(");
        expect(outside).not.toContain("topGaps(");

        expect(CODE.match(/this\.ensureGapSource\(\)/g) ?? []).toHaveLength(1);
    });

    it("is not on any path a render takes", () => {
        for (const [from, to] of [
            ["private buildTopBar", "private addColorButton"],
            ["private applyGraphData", "private preservePositions"],
            ["private updateStatus", "private arrivalFact"],
        ] as const) {
            const body = slice(from, to);
            expect(body).not.toContain("ensureGapSource");
            expect(body).not.toContain("gapTally(");
            expect(body).not.toContain("topGaps(");
        }
    });

    it("skips the work when the model has not moved", () => {
        const reader = slice("private ensureGapSource", "private syncEdgeLens");
        expect(reader).toContain("if (this.gapRevision === model.revision()) return;");
        expect(reader).toContain('if (index.status !== "ready") return;');
    });

    it("keeps one zero-count rule for all seven chips", () => {
        const label = slice("private labelChip", "private syncEdgeLens");
        // Byte-identical to what `addLensChip` held before (#516 greps for this line).
        expect(label).toContain('if (count === 0) chip.setAttribute("disabled", "true");');
        // A count that has not arrived is not a count of zero.
        expect(label).toContain("count === null ? name :");
        expect(CODE).toContain("counts: Record<OverlayKind, number | null>");
        expect(CODE).toContain('"gaps": this.gapTotal');
    });
});

describe("the lens paints, and paints only (#532, FR-2, FR-9, AC-2, AC-3)", () => {
    it("branches once per kind, not once per lens", () => {
        const colour = slice("private computeNodeColor", "private baseNodeColor");
        expect(colour).toContain('if (spec.on === "node")');
        expect(colour).toContain("this.edgeLensEndpoints?.has");
        // One branch for the two kinds that light endpoints, not one per lens.
        expect((colour.match(/spec\.on ===/g) ?? []).length).toBe(1);
    });

    it("keeps the anchor #526's own paint-only test slices from", () => {
        // Renaming `syncEdgeLens` would make that suite pass vacuously against an empty slice.
        expect(CODE).toContain("private syncEdgeLens");
    });

    it("narrows nothing and moves no camera on the gap paths", () => {
        for (const [from, to] of [
            ["private syncEdgeLens", "private edgeLensMatches"],
            ["private rebuildGhosts", "private dropGhost"],
        ] as const) {
            const body = slice(from, to);
            expect(body).not.toContain("filterGraph3D");
            expect(body).not.toContain("hiddenNodes");
            expect(body).not.toContain("zoomToFit");
            expect(body).not.toContain("cameraPosition");
        }
    });

    it("drops an activation that would dim the graph to light nothing", () => {
        const toggle = slice("private toggleOverlay", "private buildBottomBar");
        expect(toggle).toContain('if (this.overlay === "gaps" && this.gapTotal === 0)');
        expect(toggle).toContain("this.overlay = null;");
    });
});
