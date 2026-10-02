import { describe, it, expect } from "@jest/globals";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";
import { LEGACY_OPEN_TARGETS, relocateMode } from "architecture/components/core/surface/legacyTargets";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const TIMELINE = read("src/architecture/components/core/timeline/EvolutionTimelineRenderer.ts");
const MODEL = read("src/architecture/components/core/noteCompanion/companionModel.ts");
const EN = read("src/architecture/lang/locale/en.ts");
const ES = read("src/architecture/lang/locale/es.ts");

function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

/**
 * **What is around this note, in one place** (#506, then #640).
 *
 * Two of Discovery's modes were never about discovery: *what contradicts the note I am reading* and
 * *what near it have I forgotten*. #506 mounted both inside the note's own mode, each still with its
 * own heading and refresh button. #640 gave the note its own view and turned the two panels into
 * that view's counted sections — computed by the **same** analyses, drawn once, outside the
 * history's opt-in gate.
 */
describe("the companion holds what is around the note (#640)", () => {
    it("reads the same two analyses rather than re-deriving them", () => {
        expect(code(MODEL)).toContain("buildEvidenceMap(model, path)");
        expect(code(MODEL)).toContain("rankResurfacedNotes(");
    });

    it("draws them outside the history, so they show when snapshots are off", () => {
        // The history is opt-in because it stores claim texts; neither of these does.
        expect(code(MODEL)).not.toContain("ConceptualTimeline");
    });

    it("no longer mounts the two panels inside the history, nor gives it a refresh of its own", () => {
        expect(code(TIMELINE)).not.toContain("renderAround(");
        expect(code(TIMELINE)).not.toContain("new EvidenceMapRenderer(");
        expect(code(TIMELINE)).not.toContain("new ResurfaceRenderer(");
        expect(code(TIMELINE)).not.toContain("evolution_timeline_refresh_button");
    });

    it("deleted the panels it absorbed", () => {
        for (const file of [
            "src/architecture/components/core/evidenceMap/EvidenceMapRenderer.ts",
            "src/architecture/components/core/resurface/ResurfaceRenderer.ts",
        ]) {
            expect({ file, exists: existsSync(join(ROOT, file)) }).toEqual({ file, exists: false });
        }
    });
});

describe("renamed, never re-keyed (#506)", () => {
    it("keeps every alias and deep link landing, now on the note's own view (#640)", () => {
        // The mode left Health for the right sidebar; a saved `timeline` leaf is relocated, not lost.
        const health = SURFACES.find((surface) => surface.viewType === "zettelflow-health");
        expect(health?.modes.map((mode) => mode.id)).not.toContain("timeline");
        expect(relocateMode("zettelflow-health", "timeline")).toEqual({ view: "zettelflow-note" });
    });

    it("reads as what it is now", () => {
        // The view, not a mode, carries the name since #640.
        expect(EN).toContain("note_companion_title: 'This note',");
        expect(ES).toContain("note_companion_title: 'Esta nota',");
    });

    it("and the three aliases resolve to it", () => {
        for (const id of ["show-evolution-timeline", "show-evidence-map", "resurface-related-notes"]) {
            expect({ id, target: LEGACY_OPEN_TARGETS[id] }).toEqual({ id, target: { view: "zettelflow-note" } });
        }
    });
});
