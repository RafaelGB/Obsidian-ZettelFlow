import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { JudgementLog, type JudgementHost } from "architecture/plugin/judgement/JudgementLog";
import type { Judgement } from "architecture/knowledge/judgement";

const NOW = Date.UTC(2026, 7, 31, 12, 0, 0);
const NOTE = "ideas/atomicity.md";

function host(over: Partial<JudgementHost["settings"]> = {}): JudgementHost & { saved: number } {
    return {
        saved: 0,
        settings: {
            judgements: { enabled: true, log: [] },
            ...over,
        } as JudgementHost["settings"],
        saveSettings() {
            (this as unknown as { saved: number }).saved++;
        },
    };
}

/** The singleton is shared, so every test re-points it at a fresh host. */
function fresh(over: Partial<JudgementHost["settings"]> = {}) {
    const h = host(over);
    JudgementLog.getInstance().init(h);
    return h;
}

const move = { path: NOTE, subject: "connect", origin: "derived", verdict: "accepted" } as const;

describe("JudgementLog (#336, FR-7)", () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    it("records a verdict into the persisted log", () => {
        const h = fresh();
        JudgementLog.getInstance().record(move, NOW);

        expect(h.settings.judgements.log).toEqual([{ ...move, at: NOW }]);
    });

    it("stamps the current time when none is given", () => {
        const h = fresh();
        JudgementLog.getInstance().record(move);

        expect(h.settings.judgements.log[0].at).toEqual(expect.any(Number));
    });

    it("reads back the entries it recorded", () => {
        fresh();
        JudgementLog.getInstance().record(move, NOW);

        expect(JudgementLog.getInstance().entries()).toHaveLength(1);
    });

    it("records nothing while disabled", () => {
        const h = fresh({ judgements: { enabled: false, log: [] } });
        JudgementLog.getInstance().record(move, NOW);

        expect(h.settings.judgements.log).toEqual([]);
        expect(JudgementLog.getInstance().enabled()).toBe(false);
    });

    it("records nothing for a malformed verdict, and never throws", () => {
        const h = fresh();
        expect(() => JudgementLog.getInstance().record({ ...move, path: "  " }, NOW)).not.toThrow();

        expect(h.settings.judgements.log).toEqual([]);
    });

    it("degrades a corrupt persisted log to an empty one instead of throwing", () => {
        const h = fresh();
        (h.settings.judgements as { log: unknown }).log = "not a log";

        expect(JudgementLog.getInstance().entries()).toEqual([]);
        expect(() => JudgementLog.getInstance().record(move, NOW)).not.toThrow();
        expect(h.settings.judgements.log).toEqual([{ ...move, at: NOW }]);
    });

    it("persists through a debounced save", () => {
        const h = fresh();
        JudgementLog.getInstance().record(move, NOW);
        expect(h.saved).toBe(0);

        jest.advanceTimersByTime(5000);
        expect(h.saved).toBe(1);
    });

    it("flush persists immediately", () => {
        const h = fresh();
        JudgementLog.getInstance().record(move, NOW);
        JudgementLog.getInstance().flush();

        expect(h.saved).toBe(1);
    });
});

describe("JudgementLog respects the knowledge scope (#336, FR-9)", () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    it("records nothing for a note under a user-excluded path", () => {
        const h = fresh({ excludedPaths: ["templates"] });
        JudgementLog.getInstance().record({ ...move, path: "templates/daily.md" }, NOW);

        expect(h.settings.judgements.log).toEqual([]);
    });

    it("records nothing for a note under a ZettelFlow system folder", () => {
        const h = fresh({ foldersFlowsPath: "ZettelFlow/flows" });
        JudgementLog.getInstance().record({ ...move, path: "ZettelFlow/flows/step.md" }, NOW);

        expect(h.settings.judgements.log).toEqual([]);
    });

    it("still records a note that only shares a prefix with an excluded folder", () => {
        const h = fresh({ excludedPaths: ["templates"] });
        JudgementLog.getInstance().record({ ...move, path: "templates-of-mine/idea.md" }, NOW);

        expect(h.settings.judgements.log).toHaveLength(1);
    });
});

describe("JudgementLog before it is wired (#336)", () => {
    it("no-ops safely with no host", () => {
        const log = JudgementLog.getInstance();
        log.init(null as unknown as JudgementHost);

        expect(log.enabled()).toBe(false);
        expect(log.entries()).toEqual([]);
        expect(() => log.record(move, NOW)).not.toThrow();
        expect(() => log.flush()).not.toThrow();
    });
});

describe("the recorded shape carries no content (#336, the privacy promise)", () => {
    it("stores only path, subject, origin, verdict and time", () => {
        const h = fresh();
        JudgementLog.getInstance().record(move, NOW);

        const recorded = h.settings.judgements.log[0] as Judgement;
        expect(Object.keys(recorded).sort()).toEqual(["at", "origin", "path", "subject", "verdict"]);
    });
});
