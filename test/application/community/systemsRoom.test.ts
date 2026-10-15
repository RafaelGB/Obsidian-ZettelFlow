import { afterEach, describe, it, expect, jest } from "@jest/globals";

// The folder field's suggester pulls in the whole plugin; the loose pieces' dialogs are React.
jest.mock("architecture/settings/suggesters/FolderSuggest", () => ({ FolderSuggest: class { } }));
const opened: string[] = [];
jest.mock("application/community/CommunityStepModal", () => ({ CommunityStepModal: class { open() { opened.push("step"); } } }));
jest.mock("application/community/CommunityActionModal", () => ({ CommunityActionModal: class { open() { opened.push("action"); } } }));
jest.mock("application/community/CommunityMarkdownModal", () => ({ CommunityMarkdownModal: class { open() { opened.push("markdown"); } } }));
jest.mock("application/community/services/CommunityHttpClientService", () => ({
    ...(jest.requireActual("application/community/services/CommunityHttpClientService") as object),
    fetchStepTemplate: async () => ({ id: "s" }),
    fetchActionTemplate: async () => ({ id: "a" }),
    fetchMarkdownTemplate: async () => "# note",
}));

import * as obsidian from "obsidian";
import type { StaticTemplateOptions } from "config";
import { DomNode, flush, settle } from "../../support/dashboardDom";
import { REFS, cardOf, fixtureCatalog, mountRoom, openCard } from "../../support/systemsRoomHarness";

const RealNotice = obsidian.Notice;
/** Every notice, as the real (fake) one: a spy that still constructs it, so a test can read and click it. */
const noticeSpy = jest.spyOn(obsidian, "Notice").mockImplementation(function (message?: string) {
    return new RealNotice(message);
} as never);
import {
    groupSystems,
    matchesQuery,
    normalizeForSearch,
    summaryOf,
} from "application/community/systemsCatalog";
import { entry } from "../../support/systemsFixtures";

describe("the Systems room's catalog, pure (#799 AC-1, AC-3, AC-4)", () => {
    const catalog: StaticTemplateOptions[] = [
        entry({ title: "Add contact", template_type: "step" }),
        entry({ title: "Zettelkasten v2", steps: 4, branches: 1 }),
        entry({ title: "Meeting notes", steps: 1, branches: 0 }),
        entry({ title: "PARA v2", steps: 5, branches: 2 }),
        entry({ title: "Daily note", template_type: "markdown" }),
        entry({ title: "Inquiry", steps: 1, branches: 0 }),
        entry({ title: "GTD", steps: 4, branches: 1 }),
        entry({ title: "New task", template_type: "step" }),
    ];

    it("puts whole methods first, then single notes, then the loose pieces — in catalog order", () => {
        const groups = groupSystems(catalog);
        expect(groups.methods.map((e) => e.title)).toEqual(["Zettelkasten v2", "PARA v2", "GTD"]);
        expect(groups.single.map((e) => e.title)).toEqual(["Meeting notes", "Inquiry"]);
        expect(groups.loose.map((e) => e.title)).toEqual(["Add contact", "Daily note", "New task"]);
    });

    it("reads the summary in the locale, then English, then the description's first sentence", () => {
        const both = entry({ title: "Reading", summary: { en: "Log a source.", es: "Registra una fuente." } });
        expect(summaryOf(both, "es")).toBe("Registra una fuente.");
        expect(summaryOf(both, "fr")).toBe("Log a source.");
        const none = entry({ title: "Writing", description: "Writing, drawn as a flow: one capture. Offline, no AI." });
        expect(summaryOf(none, "en")).toBe("Writing, drawn as a flow: one capture.");
    });

    it("folds case and accents, so «para» finds «PÁRA»", () => {
        expect(normalizeForSearch("PÁRA")).toBe("para");
        expect(normalizeForSearch("Ñandú")).toBe("nandu");
        expect(matchesQuery(entry({ title: "PÁRA v2" }), "para", "en")).toBe(true);
    });

    it("matches the name, the summary and the description, and an empty query matches all", () => {
        const zk = entry({ title: "Zettelkasten v2", summary: { en: "The slip-box." }, description: "Fleeting and permanent notes." });
        expect(matchesQuery(zk, "zettel", "en")).toBe(true);
        expect(matchesQuery(zk, "slip", "en")).toBe(true);
        expect(matchesQuery(zk, "permanent", "en")).toBe(true);
        expect(matchesQuery(zk, "zzz", "en")).toBe(false);
        expect(matchesQuery(zk, "  ", "en")).toBe(true);
    });
});

describe("the Systems room, drawn (#799 AC-1 – AC-4, FR-5, FR-6)", () => {
    afterEach(() => noticeSpy.mockClear());

    it("shows a whole method before one note, done well, in catalog order, with no filter anywhere", async () => {
        const { roomEl } = await mountRoom();
        expect(roomEl.byClass("systems-group-title").map((el) => el.text)).toEqual(["A whole method", "One note, done well"]);
        const titles = roomEl.byClass("system-card-title").map((el) => el.text);
        expect(titles).toEqual(["Zettelkasten v2", "PARA v2", "Meeting notes", "Weekly focus", "Broken"]);
        expect(roomEl.findAll((el) => [...el.classes].some((cls) => cls.includes("filter")))).toEqual([]);
    });

    it("draws each card from its template, with its level, its steps and its branch points", async () => {
        const { roomEl } = await mountRoom();
        const zk = cardOf(roomEl, "Zettelkasten v2");
        expect(zk.byClass("system-node")).toHaveLength(4);
        expect(zk.byClass("system-edge")).toHaveLength(3);
        expect(zk.byClass("system-card-meta")[0].textContent).toContain("4 steps · 1 branch point");
        expect(cardOf(roomEl, "PARA v2").byClass("system-card-meta")[0].textContent).toContain("5 steps · 2 branch points");
        expect(cardOf(roomEl, "Meeting notes").byClass("system-card-meta")[0].textContent).toContain("1 step");
        expect(zk.byClass("system-dot-level").filter((dot) => dot.hasClass("is-on"))).toHaveLength(2);
    });

    it("reads the summary in the locale, and the description's first sentence where there is none", async () => {
        const { roomEl } = await mountRoom({ lang: "es" });
        expect(cardOf(roomEl, "Zettelkasten v2").byClass("system-card-summary")[0].text).toBe("La caja de notas.");
        expect(cardOf(roomEl, "PARA v2").byClass("system-card-summary")[0].text).toBe("PARA v2 described.");
    });

    it("marks a system already in your vault", async () => {
        const { roomEl } = await mountRoom({ settings: { installedSystems: [{ id: "i", ref: REFS.para, name: "PARA v2", at: 1, folder: "F", canvas: "F/x.canvas", role: "none", files: [], folders: [] }] } });
        expect(cardOf(roomEl, "PARA v2").byClass("system-card-installed")[0].textContent).toBe("In your vault");
        expect(cardOf(roomEl, "Zettelkasten v2").byClass("system-card-installed")).toHaveLength(0);
    });

    it("redraws *In your vault* when the camera comes back, after a Remove or an install elsewhere (#804)", async () => {
        const record = { id: "i", ref: REFS.para, name: "PARA v2", at: 1, folder: "F", canvas: "F/x.canvas", role: "none", files: [], folders: [] };
        const mounted = await mountRoom({ settings: { installedSystems: [record] } });
        const settings = mounted.harness.plugin.settings as unknown as { installedSystems: unknown[] };
        const drawn = cardOf(mounted.roomEl, "PARA v2").byClass("system-drawing").length;
        // Installed's Remove drops the record while Systems is out of view…
        settings.installedSystems = [];
        mounted.room.shown();
        expect(cardOf(mounted.roomEl, "PARA v2").byClass("system-card-installed")).toHaveLength(0);
        // …and the drawing is left as it was.
        expect(cardOf(mounted.roomEl, "PARA v2").byClass("system-drawing")).toHaveLength(drawn);
        settings.installedSystems = [{ ...record, ref: REFS.zettelkasten }];
        mounted.room.shown();
        mounted.room.shown();
        expect(cardOf(mounted.roomEl, "Zettelkasten v2").byClass("system-card-installed")).toHaveLength(1);
        expect(cardOf(mounted.roomEl, "Zettelkasten v2").byClass("system-card-installed")[0].textContent).toBe("In your vault");
    });

    it("keeps only the cards that answer a search, and says so when none does", async () => {
        const { roomEl } = await mountRoom();
        const search = roomEl.oneByClass("systems-search").children.find((el) => el.tag === "input") as DomNode;
        const visible = () => roomEl.byClass("system-card").filter((card) => !card.hasClass("is-hidden")).map((card) => card.byClass("system-card-title")[0].text);
        search.value = "zettel";
        search.fire("input");
        expect(visible()).toEqual(["Zettelkasten v2"]);
        expect(roomEl.byClass("systems-group").filter((group) => !group.hasClass("is-hidden"))).toHaveLength(1);
        search.value = "zzz";
        search.fire("input");
        expect(visible()).toEqual([]);
        const none = roomEl.oneByClass("systems-no-match");
        expect(none.hasClass("is-hidden")).toBe(false);
        expect(none.textContent).toContain("Nothing matches «zzz».");
        none.byText("Clear the search")!.click();
        expect(visible()).toHaveLength(5);
        expect(none.hasClass("is-hidden")).toBe(true);
    });

    it("shows skeleton cards while the catalog is on its way", async () => {
        let release: (value: ReturnType<typeof fixtureCatalog>) => void = () => undefined;
        const pending = new Promise<ReturnType<typeof fixtureCatalog>>((resolve) => (release = resolve));
        const { roomEl } = await mountRoom({ catalog: () => pending, wait: false });
        expect(roomEl.byClass("system-card").filter((card) => card.hasClass("is-skeleton")).length).toBeGreaterThan(0);
        release(fixtureCatalog());
        await settle(() => roomEl.byClass("system-card-title").length > 0);
        expect(roomEl.byClass("system-card").filter((card) => card.hasClass("is-skeleton"))).toHaveLength(0);
    });

    it("says inline that the gallery cannot be reached, with Try again, and never a toast", async () => {
        let fail = true;
        const { roomEl } = await mountRoom({ catalog: async () => { if (fail) throw new Error("offline"); return fixtureCatalog(); } });
        const state = roomEl.oneByClass("systems-state");
        expect(state.textContent).toContain("The gallery cannot be reached right now.");
        expect(noticeSpy).not.toHaveBeenCalled();
        fail = false;
        state.byText("Try again")!.click();
        await settle(() => roomEl.byClass("system-card").length > 0);
        expect(roomEl.byClass("system-card-title").map((el) => el.text)).toContain("Zettelkasten v2");
    });

    it("draws no picture for a system it cannot fetch, and says why when it is opened", async () => {
        const mounted = await mountRoom();
        const broken = cardOf(mounted.roomEl, "Broken");
        expect(broken.byClass("system-card-thumb")[0].hasClass("is-missing")).toBe(true);
        expect(broken.byClass("system-node")).toHaveLength(0);
        const panel = await openCard(mounted, "Broken");
        expect(panel.oneByClass("system-unreachable").textContent).toContain("This system cannot be reached right now");
        expect(panel.oneByClass("system-unreachable").byText("Try again")).toBeDefined();
        expect(noticeSpy).not.toHaveBeenCalled();
    });

    it("folds the loose pieces at the bottom, counted, each opening its own install dialog", async () => {
        const { roomEl } = await mountRoom();
        const loose = roomEl.oneByClass("systems-loose");
        expect(loose.tag).toBe("details");
        expect(loose.open).toBe(false);
        expect(loose.oneByClass("systems-loose-summary").textContent).toBe("Loose pieces · 3 steps and templates for your own canvases");
        const pieces = loose.byClass("systems-piece");
        expect(pieces.map((piece) => piece.byClass("systems-piece-name")[0].text)).toEqual(["Add contact", "Daily Note Template", "New task"]);
        pieces[0].click();
        await flush();
        expect(opened).toEqual(["step"]);
        pieces[1].click();
        await flush();
        expect(opened).toEqual(["step", "markdown"]);
    });
});
