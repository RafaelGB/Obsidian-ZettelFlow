import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { formatDuration, speedFacts, SPEED_ROWS } from "architecture/knowledge/state/speedFacts";
import type { Measurable, Sample } from "architecture/monitoring/measure";

const SRC = join(__dirname, "..", "..", "..", "..", "src");

function reader(samples: Partial<Record<Measurable, Sample>>) {
    return (name: Measurable) => samples[name];
}

describe("how fast it is here (#462)", () => {
    it("says nothing has been measured, rather than showing zeros", () => {
        const facts = speedFacts(reader({}));
        expect(facts.empty).toBe(true);
        expect(facts.facts).toEqual([]);
    });

    it("reports the timing, the note count and when it was measured", () => {
        const facts = speedFacts(
            reader({ "index.build": { name: "index.build", ms: 120.4, at: 1700, scale: 50_000, ok: true } })
        );
        expect(facts.empty).toBe(false);
        expect(facts.facts).toEqual([
            { labelKey: "speed_row_index", ms: 120.4, at: 1700, scale: 50_000 },
        ]);
    });

    it("leaves out a kind that was never measured, instead of inventing it", () => {
        const facts = speedFacts(
            reader({ "index.build": { name: "index.build", ms: 1, at: 1, ok: true } })
        );
        expect(facts.facts).toHaveLength(1);
        expect(facts.facts[0].scale).toBeUndefined();
    });

    it("keeps the rows in a stated order", () => {
        expect(SPEED_ROWS.map((row) => row.name)).toEqual([
            "index.build",
            "enrich.full",
            "enrich.incremental",
            "analysis.heaviest",
        ]);
    });

    it("reads a duration the way a person would say it", () => {
        expect(formatDuration(0.4)).toBe("<1 ms");
        expect(formatDuration(103)).toBe("103 ms");
        expect(formatDuration(1_500)).toBe("1.5 s");
        expect(formatDuration(9_000)).toBe("9.0 s");
    });
});

/**
 * §XII: this section states facts about your vault. It must not grade them.
 *
 * The same subtraction #360 made when it removed the telemetry track: a number lets you draw your
 * own conclusion; a verdict draws it for you, and it is your vault.
 */
describe("the speed section states no verdict (#462, §XII)", () => {
    const source = readFileSync(join(SRC, "architecture", "knowledge", "state", "speedFacts.ts"), "utf8");
    const en = readFileSync(join(SRC, "architecture", "lang", "locale", "en.ts"), "utf8");

    it("computes no score, band or threshold", () => {
        for (const forbidden of ["score", "band", "threshold", "grade", "rating", "healthy"]) {
            expect(source.toLowerCase().includes(`${forbidden}:`)).toBe(false);
        }
    });

    it("imports nothing from the advice or recommendation layer", () => {
        expect(source).not.toContain("recommendation");
        expect(source).not.toContain("classifyHealth");
        expect(source).not.toContain("knowledgeDebt");
    });

    it("uses no judgement words in the strings it labels", () => {
        const keys = SPEED_ROWS.map((row) => row.labelKey).concat([
            "speed_title",
            "speed_intro",
            "speed_never_measured",
            "speed_measured_at",
            "speed_over_notes",
        ]);
        const judgement = /\b(slow|fast|poor|bad|good|should|improve|optimi[sz]e|too many|warning)\b/i;
        for (const key of keys) {
            const match = new RegExp(`${key}: '([^']*)'`).exec(en);
            expect({ key, found: match !== null }).toEqual({ key, found: true });
            expect({ key, judges: judgement.test(match?.[1] ?? "") }).toEqual({ key, judges: false });
        }
    });
});
