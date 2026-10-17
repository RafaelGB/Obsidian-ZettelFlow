import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import type { SettingGroupItem } from "obsidian";
import { DomNode } from "../support/dashboardDom";
import { speedLines, speedSettingsItems } from "config/modals/handlers/speedSettingsItems";
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
/** A Setting stand-in: the row draws its lines into `descEl`. */
function draw(item: SettingGroupItem): string[] {
    const descEl = new DomNode();
    (item as { render: (setting: unknown) => void }).render({ descEl });
    return descEl.children.map((line) => line.textContent);
}

describe("the timings in settings (#645)", () => {
    it("says once that nothing has been measured, instead of a table of zeros", () => {
        expect(speedLines(() => undefined)).toEqual(["Nothing measured yet this session."]);
    });

    it("lists each measured timing with its duration, its scale and when", () => {
        const samples: Partial<Record<Measurable, Sample>> = {
            "index.build": { name: "index.build", ms: 103, at: 0, scale: 1 },
            "analysis.heaviest": { name: "analysis.heaviest", ms: 2400, at: 0 },
        };
        const lines = speedLines((name) => samples[name]);
        expect(lines).toHaveLength(3); // the intro + two timings
        const [, index, analysis] = lines;
        expect(index).toContain(formatDuration(103));
        expect(index).toContain("over 1 note");
        expect(index).toContain("measured");
        expect(analysis).toContain(formatDuration(2400));
        expect(analysis).not.toContain("over");
    });

    it("says how many times a Reader moment ran, and never over how many notes (#825)", () => {
        const samples: Partial<Record<Measurable, Sample>> = {
            "plugin.load": { name: "plugin.load", ms: 50, at: 0, ok: true },
            "reader.page.turn": { name: "reader.page.turn", ms: 3, at: 0, ok: true },
            "reader.relayout": { name: "reader.relayout", ms: 90, at: 0, ok: true },
        };
        const counts: Partial<Record<Measurable, number>> = { "plugin.load": 1, "reader.page.turn": 12, "reader.relayout": 1 };
        const [, load, turn, relayout] = speedLines((name) => samples[name], (name) => counts[name] ?? 0);
        expect(turn).toContain("12 times");
        expect(turn).toContain("measured");
        expect(turn).not.toContain("over");
        expect(relayout).toContain("1 time ");
        expect(load).not.toContain("time");
    });

    it("is one read-only row: a title, lines drawn into its description, no control", () => {
        const items = speedSettingsItems(() => undefined);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ name: "Timings from this vault" });
        expect(items[0]).not.toHaveProperty("control");
        for (const forbidden of ["measure(", "saveSettings", "FileService", "vault."]) {
            expect({ forbidden, present: SOURCE.includes(forbidden) }).toEqual({ forbidden, present: false });
        }
    });

    it("reads the timings when the row is drawn, not when the settings are built (#639)", () => {
        let sample: Sample | undefined;
        const items = speedSettingsItems((name) => (name === "index.build" ? sample : undefined));
        expect(draw(items[0])).toEqual(["Nothing measured yet this session."]);
        sample = { name: "index.build", ms: 103, at: 0, scale: 1 };
        const lines = draw(items[0]);
        expect(lines).toHaveLength(2);
        expect(lines[1]).toContain(formatDuration(103));
    });
});
