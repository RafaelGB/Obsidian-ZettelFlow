import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { DomNode, flush } from "../../../../support/dashboardDom";
import { KnowledgeIndex } from "architecture/knowledge";
import { TendRenderer } from "architecture/components/core/tend/TendRenderer";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { idea, buildModel } from "../../../../actions/knowledge/support/knowledgeFixture";
import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const claim = [{ text: "a claim" }];
const sourced = [{ text: "a claim", sources: [{ ref: "Book", kind: "text" as const }] }];

/** `count` notes with a claim, no source and no links: three issues each. */
function needy(count: number): KnowledgeModel {
    return buildModel(Array.from({ length: count }, (_, i) => idea(`n${String(i).padStart(3, "0")}.md`, "fleeting", [], { claims: claim })));
}

let progress: ((p: { done: number; total: number }) => void) | undefined;
const cancelEnrichment = jest.fn();

function fakeIndex(model: KnowledgeModel | (() => KnowledgeModel), status = "ready") {
    jest.spyOn(KnowledgeIndex, "getInstance").mockReturnValue({
        status,
        getModel: typeof model === "function" ? model : () => model,
        onEnrichmentProgress: (listener: typeof progress) => {
            progress = listener;
        },
        cancelEnrichment,
    } as never);
}

function mount(model: KnowledgeModel | (() => KnowledgeModel), status = "ready") {
    fakeIndex(model, status);
    const host = new DomNode();
    const app = {
        workspace: { openLinkText: jest.fn(async () => undefined), trigger: jest.fn() },
        metadataCache: { on: () => ({}) },
        vault: { on: () => ({}) },
    };
    const openCompanion = jest.fn(async () => undefined);
    const renderer = new TendRenderer(host as never, app as never, { openCompanion });
    renderer.load();
    return { host, app, openCompanion, renderer };
}

const text = (host: DomNode, cls: string) => host.oneByClass(cls).textContent;

beforeEach(() => {
    progress = undefined;
    cancelEnrichment.mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe("Tend lists the notes that need you (#644 AC-9/AC-10)", () => {
    it("draws at most 200 rows and says how many more there are", () => {
        const { host } = mount(needy(250));
        expect(host.byClass("tend-row")).toHaveLength(200);
        expect(text(host, "tend-more")).toBe("+50 more notes");
        expect(text(host, "tend-lede")).toBe("250 notes need attention.");
    });

    it("agrees in number", () => {
        expect(text(mount(needy(1)).host, "tend-lede")).toBe("1 note needs attention.");
        expect(text(mount(needy(201)).host, "tend-more")).toBe("+1 more note");
    });

    it("reads the same in Spanish", () => {
        expect(es.tend_lede_one.replace("{0}", "1")).toBe("1 nota necesita atención.");
        expect(es.tend_lede.replace("{0}", "12")).toBe("12 notas necesitan atención.");
    });

    it("counts the notes with nothing pending, faintly, under the list", () => {
        const model = buildModel([
            idea("a.md", "fleeting", [], { claims: claim }),
            idea("b.md", "permanent", [{ to: "c.md", type: "example" }], { claims: sourced, hasSources: true }),
            idea("c.md", "permanent", [{ to: "b.md", type: "example" }], { claims: sourced, hasSources: true }),
        ]);
        expect(text(mount(model).host, "tend-clear")).toBe("2 notes have nothing pending.");
    });
});

describe("the four states (#644 AC-11)", () => {
    it("says it is indexing, with no list", () => {
        const { host } = mount(needy(3), "indexing");
        expect(host.byClass("tend-status")).toHaveLength(1);
        expect(host.byClass("tend-row")).toEqual([]);
        expect(host.byClass("tend-filters")).toEqual([]);
    });

    it("says it failed, and logs it", () => {
        const { host } = mount(() => {
            throw new Error("boom");
        });
        expect(host.byClass("tend-status--error")).toHaveLength(1);
    });

    it("says when nothing needs you, with no chips or list, and keeps the weekly review", () => {
        const model = buildModel([
            idea("b.md", "permanent", [{ to: "c.md", type: "example" }], { claims: sourced, hasSources: true }),
            idea("c.md", "permanent", [{ to: "b.md", type: "example" }], { claims: sourced, hasSources: true }),
        ]);
        const { host } = mount(model);
        expect(text(host, "tend-lede")).toBe("No note needs attention.");
        expect(host.byClass("tend-filters")).toEqual([]);
        expect(host.byClass("tend-list")).toEqual([]);
        expect(host.byClass("mode-header-primary")).toHaveLength(1);
    });
});

describe("what left (#644 AC-12)", () => {
    it("draws none of the old Health mode's sections, and one primary: the weekly review", () => {
        const { host } = mount(needy(5));
        for (const gone of [
            "slipbox-health-summary",
            "knowledge-dashboard-panel",
            "knowledge-debt",
            "knowledge-balance",
            "slipbox-health-orphan",
            "slipbox-health-deadend",
            "slipbox-health-item--agency",
        ]) {
            expect({ gone, found: host.byClass(gone).length }).toEqual({ gone, found: 0 });
        }
        const primary = host.byClass("mode-header-primary");
        expect(primary).toHaveLength(1);
        expect(primary[0].textContent).toBe(en.weekly_review_command_name);
    });
});

describe("filter chips (#644 AC-6 at the view, FR-9/FR-10)", () => {
    const model = () =>
        buildModel([
            idea("a.md", "fleeting", [], { claims: claim }),
            idea("b.md", "fleeting", [{ to: "a.md" }], { claims: claim }),
        ]);

    it("offers All and each issue some row carries, with counts", () => {
        const { host } = mount(model());
        const labels = host.byClass("tend-filter").map((chip) => chip.textContent);
        expect(labels).toEqual(["All2", "No source2", "Links nowhere1", "Nobody links it1"]);
    });

    it("presses one chip at a time and lists only its rows, without rebuilding the rest", () => {
        const { host } = mount(model());
        const lede = host.oneByClass("tend-lede");
        const nowhere = host.byClass("tend-filter")[2];
        nowhere.click();
        const pressed = host.byClass("tend-filter").filter((chip) => chip.getAttribute("aria-pressed") === "true");
        expect(pressed.map((chip) => chip.textContent)).toEqual(["Links nowhere1"]);
        expect(pressed[0].hasClass("is-active")).toBe(true);
        expect(host.byClass("tend-row").map((row) => row.getAttribute("title"))).toEqual(["a.md"]);
        expect(host.oneByClass("tend-lede")).toBe(lede);
    });

    it("starts from All every time the mode opens", () => {
        const { host, renderer } = mount(model());
        host.byClass("tend-filter")[2].click();
        renderer.unload();
        renderer.load();
        expect(host.byClass("tend-filter")[0].getAttribute("aria-pressed")).toBe("true");
    });
});

describe("a row hands the note to This note on its fix (#644 AC-13)", () => {
    const model = () =>
        buildModel([
            idea("a.md", "fleeting", [{ to: "q.md", type: "question" }], { claims: claim, modified: 3 }),
            idea("q.md", "permanent", [{ to: "a.md" }], { claims: sourced, hasSources: true, modified: 1 }),
            idea("w.md", "fleeting", [], { claims: claim, modified: 2 }),
        ]);

    it("opens the note, then the companion on the first issue's move — by click and by Enter", async () => {
        const { host, app, openCompanion } = mount(model());
        const row = host.byClass("tend-row").find((el) => el.getAttribute("title") === "w.md")!;
        row.click();
        await flush();
        expect(app.workspace.openLinkText).toHaveBeenCalledWith("w.md", "", false);
        expect(openCompanion).toHaveBeenCalledWith(app, { path: "w.md", focus: "next", move: "add-source" });
        row.fire("keydown", { key: "Enter" });
        await flush();
        expect(openCompanion).toHaveBeenCalledTimes(2);
    });

    it("lands on Near and forgotten when the filter is Nobody links it", async () => {
        const { host, app, openCompanion } = mount(model());
        host.byClass("tend-filter").find((chip) => chip.textContent.startsWith("Nobody links it"))!.click();
        host.byClass("tend-row").find((el) => el.getAttribute("title") === "w.md")!.click();
        await flush();
        expect(openCompanion).toHaveBeenCalledWith(app, { path: "w.md", focus: "nearby" });
    });

    it("lands on Gaps for an open question", async () => {
        const { host, app, openCompanion } = mount(model());
        host.byClass("tend-filter").find((chip) => chip.textContent.startsWith("Open question"))!.click();
        host.byClass("tend-row").find((el) => el.getAttribute("title") === "a.md")!.click();
        await flush();
        expect(openCompanion).toHaveBeenCalledWith(app, { path: "a.md", focus: "gaps" });
    });
});

describe("the live pass sits under the lede; nothing else moves (#644 AC-14/AC-15)", () => {
    it("shows the pass with Stop right under the lede, and redraws only that row", () => {
        const { host } = mount(needy(3));
        const list = host.oneByClass("tend-list");
        progress!({ done: 10, total: 100 });
        const pass = host.oneByClass("tend-pass");
        expect(pass.textContent).toContain("10");
        expect(pass.textContent).toContain("100");
        const root = host.oneByClass("tend");
        const order = root.children.map((child) => [...child.classes].join(" "));
        expect(order.indexOf("zettelkasten-flow__tend-pass")).toBe(order.indexOf("zettelkasten-flow__tend-hint") + 1);
        expect(host.oneByClass("tend-list")).toBe(list);
        pass.oneByClass("speed-stop").click();
        expect(cancelEnrichment).toHaveBeenCalled();
        progress!({ done: 100, total: 100 });
        expect(host.oneByClass("tend-pass").children).toEqual([]);
    });

    it("keeps the list it drew when the model has not changed", () => {
        const { host, renderer } = mount(needy(3));
        const list = host.oneByClass("tend-list");
        renderer.recompute();
        expect(host.oneByClass("tend-list")).toBe(list);
    });

    it("keeps the timings at the bottom, with no pass of their own", () => {
        const { host } = mount(needy(3));
        const root = host.oneByClass("tend");
        expect([...root.children[root.children.length - 1].classes]).toContain("zettelkasten-flow__tend-section");
        expect(root.children[root.children.length - 1].byClass("speed-stop")).toEqual([]);
    });
});

describe("Tend's words and sources (#644 AC-18, FR-12)", () => {
    const source = readFileSync(join(ROOT, "src/architecture/components/core/tend/TendRenderer.ts"), "utf8");

    it("reads the model, never the metadata cache's link tables", () => {
        expect(source).toContain("deriveTend(model)");
        expect(source).not.toMatch(/resolvedLinks|getMarkdownFiles|cachedRead/);
    });

    it("writes every tend string in sentence case, in both locales, with real singulars", () => {
        for (const locale of [en, es] as Record<string, string>[]) {
            for (const [key, value] of Object.entries(locale).filter(([key]) => key.startsWith("tend_"))) {
                expect({ key, ok: /^[+{]|^[A-ZÁÉÍÓÚÑ][^A-Z]*$/.test(value.replace(/This note|Esta nota/g, "x")) }).toEqual({
                    key,
                    ok: true,
                });
            }
        }
        for (const base of ["tend_lede", "tend_clear", "tend_more"] as const) {
            expect(en[`${base}_one` as keyof typeof en]).not.toBe(en[base]);
            expect(es[`${base}_one` as keyof typeof es]).not.toBe(es[base]);
        }
    });
});
