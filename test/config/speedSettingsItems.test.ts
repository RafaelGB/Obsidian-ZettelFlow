import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { speedSettingsItems } from "config/modals/handlers/speedSettingsItems";
import { formatDuration } from "architecture/knowledge/state";
import type { Measurable, Sample } from "architecture/monitoring/measure";

const SOURCE = readFileSync(join(__dirname, "../../src/config/modals/handlers/speedSettingsItems.ts"), "utf8");

/**
 * The timings, read-only, in Settings › Advanced (#645 FR-16/17, AC-9, D8).
 *
 * They are facts about how long ZettelFlow took on this machine — useful to someone diagnosing,
 * noise to someone tending their notes. So they left Health for the developer group, and they are
 * still the same numbers: read from the last sample, never measured on the spot.
 */
describe("the timings in settings (#645)", () => {
    it("says once that nothing has been measured, instead of a table of zeros", () => {
        const items = speedSettingsItems(() => undefined);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ name: "Nothing measured yet this session." });
    });

    it("lists each measured timing with its duration, its scale and when", () => {
        const samples: Partial<Record<Measurable, Sample>> = {
            "index.build": { name: "index.build", ms: 103, at: 0, scale: 1 },
            "analysis.heaviest": { name: "analysis.heaviest", ms: 2400, at: 0 },
        };
        const items = speedSettingsItems((name) => samples[name]);
        expect(items).toHaveLength(3); // the intro + two timings
        const [intro, index, analysis] = items as { name: string; desc?: string }[];
        expect(intro.name).toBe("Timings from this vault");
        expect(index.desc).toContain(formatDuration(103));
        expect(index.desc).toContain("over 1 note");
        expect(index.desc).toContain("measured");
        expect(analysis.desc).toContain(formatDuration(2400));
        expect(analysis.desc).not.toContain("over");
    });

    it("draws read-only rows: no control, no render, no write, no measurement", () => {
        for (const item of speedSettingsItems((name) => ({ name, ms: 1, at: 0 }))) {
            expect(item).not.toHaveProperty("render");
            expect(item).not.toHaveProperty("control");
        }
        for (const forbidden of ["measure(", "saveSettings", "FileService", "vault."]) {
            expect({ forbidden, present: SOURCE.includes(forbidden) }).toEqual({ forbidden, present: false });
        }
    });
});
