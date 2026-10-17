/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode } from "../support/dashboardDom";
import { fakeFrames } from "../support/fakeFrames";
import { frameMeterLines, frameMeterSettingsItems } from "config/modals/handlers/frameMeterSettingsItems";
import { clearFrameTraces, frameMeterOn, meterGesture, setFrameMeter } from "architecture/monitoring/frameMeter";

const SRC = join(__dirname, "..", "..", "src");
const SOURCE = readFileSync(join(SRC, "config", "modals", "handlers", "frameMeterSettingsItems.ts"), "utf8");
const GROUPS = readFileSync(join(SRC, "config", "modals", "handlers", "advancedSettingsGroups.ts"), "utf8");

/** A Setting stand-in: a description to draw into, and the toggle it was given. */
function setting() {
    let toggle: any = null;
    const descEl = new DomNode();
    return {
        descEl,
        addToggle(build: (t: any) => void) {
            toggle = { value: false, change: (_: boolean) => undefined, setValue(v: boolean) { this.value = v; return this; }, onChange(fn: (v: boolean) => void) { this.change = fn; return this; } };
            build(toggle);
            return this;
        },
        get toggle() {
            return toggle;
        },
    };
}

/** One way to turn a gesture's frames on, where a developer looks (#826 FR-3, §XIII). */
describe("the frame meter in Settings › Advanced (#826)", () => {
    afterEach(() => {
        setFrameMeter(false);
        clearFrameTraces();
    });

    it("is one row beside the timings, off until turned on, and never on Health", () => {
        const items = frameMeterSettingsItems();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ name: "Frame meter" });
        expect(GROUPS.indexOf("...frameMeterSettingsItems()")).toBeGreaterThan(GROUPS.indexOf("...speedSettingsItems()"));
        const s = setting();
        (items[0] as any).render(s);
        expect(s.toggle.value).toBe(false);
        s.toggle.change(true);
        expect(frameMeterOn()).toBe(true);
        expect(s.descEl.textContent).toContain("Nothing traced yet.");
    });

    it("says how each gesture held its frames, read when drawn", () => {
        setFrameMeter(true);
        const f = fakeFrames();
        const meter = meterGesture("chapter-turn:leaf:clock", "clock", f.win);
        f.frames(20);
        meter.end();
        f.frames(4);
        const [line] = frameMeterLines();
        expect(line).toContain("Chapter turn · leaf · clock");
        expect(line).toContain("1 run");
        expect(line).toContain("Within budget");
        const s = setting();
        (frameMeterSettingsItems()[0] as any).render(s);
        expect(s.descEl.textContent).toContain("Screen refresh: 120 Hz");
    });

    it("names what failed", () => {
        setFrameMeter(true);
        const f = fakeFrames();
        const meter = meterGesture("page-drag", "tracked", f.win);
        f.frames(3);
        meter.moved();
        f.frames(10);
        f.frames(1, 50);
        f.frames(10);
        meter.end("turn");
        f.frames(4);
        expect(frameMeterLines()[0]).toContain("Over budget: a long frame");
    });

    it("writes nothing and saves nothing: it lasts this session only", () => {
        for (const forbidden of ["saveSettings", "FileService", "vault.", "clipboard"]) {
            expect({ forbidden, present: SOURCE.includes(forbidden) }).toEqual({ forbidden, present: false });
        }
    });
});
