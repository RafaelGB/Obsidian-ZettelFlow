import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";

// test/architecture/plugin → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");

function host() {
    return {
        settings: {
            judgements: { enabled: true, log: [] },
            excludedPaths: [],
        },
        saveSettings: jest.fn(),
    } as unknown as Parameters<JudgementLog["init"]>[0];
}

/**
 * `flush()` is called only from `onunload`. These are static singletons, so a retained `host` keeps a
 * reference to the unloaded plugin alive across a disable/enable — and the next enable wires a *new*
 * plugin into the same instance while the old one is still reachable.
 */
describe("unload releases the plugin reference (#320)", () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    it("stops recording once the plugin has unloaded", () => {
        const log = JudgementLog.getInstance();
        log.init(host());
        log.record({ path: "a.md", subject: "s", origin: "human", verdict: "accepted" });
        expect(log.entries()).toHaveLength(1);

        log.flush();

        expect(log.enabled()).toBe(false);
        log.record({ path: "b.md", subject: "s", origin: "human", verdict: "accepted" });
        expect(log.entries()).toEqual([]);
    });

    it("still persists what was pending before letting go", () => {
        const plugin = host();
        const log = JudgementLog.getInstance();
        log.init(plugin);
        log.record({ path: "a.md", subject: "s", origin: "human", verdict: "accepted" });

        log.flush();

        expect((plugin as unknown as { saveSettings: jest.Mock }).saveSettings).toHaveBeenCalled();
    });

    it("can be wired again by a fresh plugin instance", () => {
        const log = JudgementLog.getInstance();
        log.flush();
        log.init(host());

        expect(log.enabled()).toBe(true);
    });

    /** The same shape in all three persisted singletons, so the fix does not drift back apart. */
    it.each([
        ["journal/DevelopmentJournal.ts"],
        ["judgement/JudgementLog.ts"],
        ["timeline/ConceptualTimeline.ts"],
    ])("%s releases its host in flush", (file) => {
        const source = readFileSync(join(ROOT, "src", "architecture", "plugin", file), "utf8");
        const flush = source.slice(source.indexOf("public flush()"));

        expect(flush.slice(0, flush.indexOf("}"))).toContain("this.host = null");
    });
});

describe("a retired setting does not linger in data.json (#320, #337)", () => {
    /**
     * `ai.allowInAutomations` was removed with the toggle. Leaving the saved key behind implies a
     * switch that no longer exists to anyone reading their own `data.json`.
     */
    it("is deleted on load, next to the existing clipboard-template cleanup", () => {
        const main = readFileSync(join(ROOT, "src", "main.ts"), "utf8");
        const loadSettings = main.slice(main.indexOf("async loadSettings()"));

        expect(loadSettings).toContain("allowInAutomations");
        expect(loadSettings.indexOf("allowInAutomations")).toBeLessThan(loadSettings.indexOf("saveSettings()"));
    });
});
