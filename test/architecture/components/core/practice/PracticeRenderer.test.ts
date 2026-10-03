import { describe, it, expect, jest } from "@jest/globals";
import * as architecture from "architecture";
import { DomNode } from "../../../../support/dashboardDom";
import { PracticeRenderer, type PracticeDeps } from "architecture/components/core/practice/PracticeRenderer";
import { toDayKey, type Judgement } from "architecture/knowledge/state";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const NOW = Date.UTC(2026, 9, 2, 12);

function judgement(i: number, verdict: Judgement["verdict"], origin: Judgement["origin"] = "ai"): Judgement {
    return { at: NOW - i * 1000, path: `notes/n${i}.md`, subject: "challenge-idea", origin, verdict };
}

function log(accepted: number, modified: number, rejected: number): Judgement[] {
    const out: Judgement[] = [];
    let i = 0;
    for (let n = 0; n < accepted; n++) out.push(judgement(i++, "accepted"));
    for (let n = 0; n < modified; n++) out.push(judgement(i++, "modified"));
    for (let n = 0; n < rejected; n++) out.push(judgement(i++, "rejected"));
    return out;
}

function mount(deps: Partial<PracticeDeps> = {}) {
    const host = new DomNode();
    const app = {
        workspace: { openLinkText: jest.fn(), trigger: jest.fn() },
        metadataCache: { on: () => ({}) },
        vault: { modify: jest.fn(), create: jest.fn() },
        fileManager: { processFrontMatter: jest.fn() },
    };
    const openSettings = jest.fn();
    const renderer = new PracticeRenderer(host as never, app as never, {
        dailyCounts: () => ({ [toDayKey(NOW)]: 1 }),
        judgements: () => ({ enabled: true, entries: log(8, 5, 3) }),
        now: () => NOW,
        openSettings,
        ...deps,
    });
    renderer.load();
    return { host, app, openSettings };
}

const headings = (host: DomNode) => host.querySelectorAll("h5").map((h) => h.textContent);

describe("Practice (#645 FR-2..14, AC-3..8)", () => {
    it("reads as three blocks at one heading level, with no refresh button", () => {
        const { host } = mount();
        expect(headings(host)).toEqual(["Ideas developed", "Your decisions on proposals", "Recent"]);
        expect(host.findAll((el) => el.tag === "button" && /refresh/i.test(el.textContent))).toEqual([]);
    });

    it("draws twelve weeks of days, each labelled, and counts them in words", () => {
        const one = mount();
        expect(one.host.byClass("practice-cell")).toHaveLength(84);
        expect(one.host.byClass("practice-cell").every((cell) => cell.getAttribute("aria-label"))).toBe(true);
        expect(one.host.oneByClass("practice-subtitle").textContent).toBe("1 idea in the last 12 weeks");
        const three = mount({ dailyCounts: () => ({ [toDayKey(NOW)]: 3 }) });
        expect(three.host.byClass("practice-subtitle")[0].textContent).toBe("3 ideas in the last 12 weeks");
    });

    it("says nothing was developed, once, and still shows the other blocks", () => {
        const { host } = mount({ dailyCounts: () => ({}) });
        expect(host.byClass("practice-cell")).toEqual([]);
        expect(host.textContent).toContain("Nothing developed in the last 12 weeks.");
        expect(headings(host)).toHaveLength(3);
    });

    it("says it could not read the journal, logs it, and still shows the other blocks", () => {
        const error = jest.spyOn(architecture.log, "error");
        const { host } = mount({
            dailyCounts: () => {
                throw new Error("boom");
            },
        });
        expect(host.textContent).toContain("Could not read the development journal.");
        expect(error).toHaveBeenCalled();
        expect(headings(host)).toHaveLength(3);
        error.mockRestore();
    });

    it("counts the decisions and draws them as one proportional bar", () => {
        const { host } = mount();
        expect(host.byClass("practice-legend-item").map((item) => item.textContent)).toEqual([
            "8 were accepted",
            "5 were changed",
            "3 were rejected",
        ]);
        expect(host.byClass("practice-subtitle")[1].textContent).toBe("16 decisions on proposals");
        const bar = host.oneByClass("practice-bar");
        expect(bar.svg).toBe(true);
        expect(bar.getAttribute("role")).toBe("img");
        expect(bar.getAttribute("aria-label")).toBe("8 were accepted · 5 were changed · 3 were rejected");
        expect(host.byClass("practice-seg").map((seg) => seg.getAttribute("width"))).toEqual(["8", "5", "3"]);
    });

    it("never grades you: no percentage, no index", () => {
        const { host } = mount();
        expect(host.textContent).not.toContain("%");
        expect(host.textContent).not.toMatch(/index|índice/i);
    });

    it("says there is no decision yet instead of drawing an empty bar", () => {
        const { host } = mount({ judgements: () => ({ enabled: true, entries: [] }) });
        expect(host.byClass("practice-bar")).toEqual([]);
        expect(host.textContent).toContain("No decisions on proposals yet.");
    });

    it("keeps counts but reads no pattern from fewer than five", () => {
        const { host } = mount({ judgements: () => ({ enabled: true, entries: log(1, 0, 2) }) });
        expect(host.byClass("practice-seg")).toHaveLength(2);
        expect(host.oneByClass("practice-reading").textContent).toBe("Not enough decisions yet to read a pattern.");
    });

    it("lists the ten newest decisions, each opening its note", () => {
        const { host, app } = mount({ judgements: () => ({ enabled: true, entries: log(25, 0, 0) }) });
        const rows = host.byClass("practice-row");
        expect(rows).toHaveLength(10);
        expect(rows[0].oneByClass("practice-name").textContent).toBe("n0");
        expect(rows.every((row) => row.byClass("practice-chip").length === 1 && row.byClass("practice-when").length === 1)).toBe(
            true
        );
        rows[0].oneByClass("practice-name").click();
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("notes/n0.md", "", false);
        rows[1].oneByClass("practice-name").fire("keydown", { key: "Enter" });
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("notes/n1.md", "", false);
    });

    it("calls a changed verdict changed", () => {
        const { host } = mount({ judgements: () => ({ enabled: true, entries: [judgement(0, "modified")] }) });
        expect(host.oneByClass("practice-chip").textContent).toBe("Changed");
    });

    it("says recording is off, offers the setting, and keeps the strip", () => {
        const { host, openSettings } = mount({ judgements: () => ({ enabled: false, entries: [] }) });
        const off = host.oneByClass("practice-recording-off");
        off.querySelector("button")!.click();
        expect(openSettings).toHaveBeenCalled();
        expect(host.byClass("practice-cell")).toHaveLength(84);
        expect(host.byClass("practice-bar")).toEqual([]);
        expect(host.byClass("practice-row")).toEqual([]);
    });

    it("writes nothing", () => {
        const { host, app } = mount();
        host.byClass("practice-name")[0].click();
        expect(app.vault.modify).not.toHaveBeenCalled();
        expect(app.vault.create).not.toHaveBeenCalled();
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it("words every reading as a fact about the mix, never a verdict on you", () => {
        for (const locale of [en, es] as Record<string, string>[]) {
            for (const [key, value] of Object.entries(locale).filter(([key]) => key.startsWith("practice_reading_"))) {
                expect({ key, value }).not.toEqual({
                    key,
                    value: expect.stringMatching(/healthy|saludable|worth|vale la pena|should|deber|good|bueno|bad|malo|%/i),
                });
            }
        }
    });
});

describe("Practice keeps no listener from a draw it replaced (#639 review)", () => {
    it("drops the last draw's Open settings listener when it redraws", () => {
        const host = new DomNode();
        const app = { workspace: { openLinkText: jest.fn(), trigger: jest.fn() }, metadataCache: { on: () => ({}) } };
        const renderer = new PracticeRenderer(host as never, app as never, {
            dailyCounts: () => ({}),
            judgements: () => ({ enabled: false, entries: [] }),
            now: () => NOW,
            openSettings: jest.fn(),
        });
        renderer.load();
        const first = host.findAll((el) => el.tag === "button")[0];
        expect(first.listeners.click).toHaveLength(1);
        renderer.render();
        expect(first.listeners.click).toEqual([]);
    });
});
