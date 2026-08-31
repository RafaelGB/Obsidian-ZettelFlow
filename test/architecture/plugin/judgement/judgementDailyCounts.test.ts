import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { JudgementLog, type JudgementHost } from "architecture/plugin/judgement/JudgementLog";
import { toDayKey } from "architecture/knowledge/journal/heatmap";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const NOW = Date.UTC(2026, 7, 31, 12, 0, 0);
const DAY = 86_400_000;

function fresh() {
    const host = {
        settings: { judgements: { enabled: true, log: [] } },
        saveSettings() { /* no-op */ },
    } as unknown as JudgementHost;
    JudgementLog.getInstance().init(host);
    return host;
}

describe("one definition of a judgement day (#339, AC-4)", () => {
    // Fake timers so the debounced save never leaves a live handle behind.
    beforeEach(() => {
        jest.useFakeTimers();
    });

    it("tallies the log by UTC day, using the heatmap's own key", () => {
        fresh();
        const log = JudgementLog.getInstance();
        log.record({ path: "a.md", subject: "x", origin: "ai", verdict: "accepted" }, NOW);
        log.record({ path: "b.md", subject: "y", origin: "derived", verdict: "confirmed" }, NOW + 1000);
        log.record({ path: "c.md", subject: "z", origin: "human", verdict: "challenged" }, NOW + DAY);

        expect(log.dailyCounts()).toEqual({ [toDayKey(NOW)]: 2, [toDayKey(NOW + DAY)]: 1 });
    });

    it("is empty before anything has been ruled on — a streak of zero, not a failure", () => {
        fresh();
        expect(JudgementLog.getInstance().dailyCounts()).toEqual({});
    });
});

describe("Home and Cultivate cannot drift apart (#339, AC-4)", () => {
    const sources = [
        "src/architecture/components/core/home/HomeModeRenderer.ts",
        "src/architecture/components/core/cultivate/CultivateModeRenderer.ts",
    ];

    it("both read the streak from the judgement log, not the development journal", () => {
        for (const file of sources) {
            const source = read(file);
            expect(source).toMatch(/developmentStreak\(\s*JudgementLog\.getInstance\(\)\.dailyCounts\(\)/);
            expect(source).not.toMatch(/developmentStreak\(\s*DevelopmentJournal/);
        }
    });

    it("leaves the thinking heatmap on development events, deliberately", () => {
        // The heatmap is a history of what you developed, not a reward mechanic — switching it would
        // discard a year of journal data and show every existing user an empty grid. See #339.
        const heatmap = read("src/architecture/components/core/thinkingHeatmap/ThinkingHeatmapRenderer.ts");
        expect(heatmap).toContain("DevelopmentJournal.getInstance().dailyCounts()");
    });
});
