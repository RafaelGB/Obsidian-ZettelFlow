import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";
import { LEGACY_OPEN_TARGETS } from "architecture/components/core/surface/legacyTargets";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const VIEW = read("src/architecture/components/core/timeline/EvolutionTimelineRenderer.ts");
const EN = read("src/architecture/lang/locale/en.ts");
const ES = read("src/architecture/lang/locale/es.ts");

/**
 * **What is around this note, in one place** (#506, epic #504).
 *
 * Two of Discovery's modes were never about discovery. **Challenges** asked what supports and
 * contradicts *the active note*; **Forgotten** ranked notes near *the active note* you had not
 * revisited. Both sat in a surface named for browsing the vault, while the question they answer
 * had no home — except that it did: this view is already per-note.
 */

/** One method's body, so a rule can be about *where* something happens. */
function methodBody(source: string, signature: string): string {
    const at = source.indexOf(signature);
    if (at === -1) return "";
    const rest = source.slice(at);
    const end = rest.indexOf("\n    }");
    return end === -1 ? rest : rest.slice(0, end);
}

function code(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");
}

describe("the note's view holds what is around the note (#506)", () => {
    it("mounts both renderers rather than reimplementing them", () => {
        // A move, not a rewrite: the sections keep their behaviour because they keep their code,
        // and their listeners are cleaned up by this component's lifecycle.
        expect(code(VIEW)).toContain("new EvidenceMapRenderer(host, this.app)");
        expect(code(VIEW)).toContain("new ResurfaceRenderer(host, this.app)");
        expect(code(VIEW)).toContain("this.addChild(build(");
    });

    it("shows them even when the history is off", () => {
        // The history is opt-in because it stores claim texts. Neither of these does, so a user
        // with snapshots off must still see what contradicts the note in front of them — the
        // same reasoning #494 used for moves.
        const body = methodBody(code(VIEW), "private render()");
        expect(body.indexOf("renderAround(")).toBeGreaterThan(body.indexOf("renderHistory("));
        expect(methodBody(code(VIEW), "private renderHistory(")).toContain('this.state === "disabled"');
        // The state gate belongs to the history alone.
        expect(methodBody(code(VIEW), "private renderAround(")).not.toContain("this.state");
    });

    it("names each section in both locales", () => {
        for (const [name, locale] of [["en", EN], ["es", ES]] as const) {
            for (const key of ["evolution_timeline_contradicts", "evolution_timeline_unrevisited"]) {
                expect({ name, key, present: locale.includes(`${key}:`) }).toEqual({ name, key, present: true });
            }
        }
    });
});

describe("renamed, never re-keyed (#506)", () => {
    it("keeps the mode id, so every alias and deep link still lands", () => {
        const health = SURFACES.find((surface) => surface.viewType === "zettelflow-health");
        expect(health?.modes.map((mode) => mode.id)).toContain("timeline");
    });

    it("reads as what it is now", () => {
        expect(EN).toContain("surface_mode_timeline: 'This note',");
        expect(ES).toContain("surface_mode_timeline: 'Esta nota',");
    });

    it("and the three aliases resolve to it", () => {
        for (const id of ["show-evolution-timeline", "show-evidence-map", "resurface-related-notes"]) {
            expect({ id, target: LEGACY_OPEN_TARGETS[id] }).toEqual({ id, target: expect.any(Object) });
        }
    });
});
