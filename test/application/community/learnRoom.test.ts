/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";

// The other rooms are stand-ins: the Learn room is what these tests are about.
jest.mock("application/community/view/contributeRoom", () => ({ CONTRIBUTE_ROOM: { mount: () => ({ dispose: () => undefined }) } }));
jest.mock("application/community/view/installedRoom", () => ({ INSTALLED_ROOM: { mount: () => ({ dispose: () => undefined }) } }));
jest.mock("application/community/view/systemsRoom", () => ({ SYSTEMS_ROOM: { mount: () => ({ dispose: () => undefined }) } }));

import { jest } from "@jest/globals";
import { __setLanguage } from "obsidian";
import { __resetLocal, ObsidianApi } from "architecture";
import { forgetLearnSession, LEARN_STORAGE_KEY } from "application/community/learn/learnSource";
import { DomNode, flush } from "../../support/dashboardDom";
import { learnRoomCatalog, trackIds } from "../../support/learnFixtures";
import { cardOf, learnCount, mountLearn, openLearnView } from "../../support/learnRoomHarness";

beforeEach(() => {
    __resetLocal();
    forgetLearnSession();
    __setLanguage("en");
});

afterEach(() => {
    __setLanguage("en");
});

const text = (root: DomNode, name: string) => root.byClass(name).map((el) => el.textContent);

describe("the room, before anything is done (#802 AC-1, FR-1–FR-3)", () => {
    it("reads 0 of N, starts at the first tutorial of the first track, and every track at 0", async () => {
        const { roomEl } = await mountLearn();
        expect(text(roomEl, "learn-title")).toEqual(["Everything ZettelFlow does, step by step"]);
        expect(text(roomEl, "learn-progress-text")).toEqual(["0 of 4 tutorials"]);
        expect(text(roomEl, "learn-progress-note")).toEqual(["Your progress stays in this vault."]);
        expect(text(roomEl, "learn-next-label")).toEqual(["Start here"]);
        expect(text(roomEl, "learn-next-title")).toEqual(["Get started"]);
        expect(text(roomEl, "learn-track-title")).toEqual(["Your first ten minutes", "Think", "Read"]);
        expect(text(roomEl, "learn-track-count")).toEqual(["0/2", "0/1", "0/1"]);
        expect(roomEl.byClass("learn-track-fill").map((el) => el.cssProps["--zf-learn-track"])).toEqual(["0", "0", "0"]);
        expect(roomEl.oneByClass("learn-ring-row").cssProps["--zf-learn-ring"]).toBe("0");
        // A round cap would draw a dot at 0 %: the ring is drawn empty instead.
        expect(roomEl.oneByClass("learn-ring-row").hasClass("is-empty")).toBe(true);
    });

    it("offers the first tutorial of each track as a starter chip", async () => {
        const { roomEl } = await mountLearn();
        expect(text(roomEl, "learn-chip")).toEqual(["Get started", "Think before it is knowledge", "Your library"]);
    });

    it("says one tutorial, in the singular", async () => {
        const raw = learnRoomCatalog();
        raw.tracks = [raw.tracks[1]];
        const { roomEl } = await mountLearn({ raw });
        expect(text(roomEl, "learn-progress-text")).toEqual(["0 of 1 tutorial"]);
    });

    it("draws a card with its minutes and level, and no Done yet (FR-4)", async () => {
        const { roomEl } = await mountLearn();
        const card = cardOf(roomEl, "undo");
        expect(card.oneByClass("learn-tutorial-title").textContent).toBe("Undo what a flow wrote");
        expect(card.oneByClass("learn-card-meta").textContent).toBe("3 minEasy");
        expect(card.byClass("learn-card-done")).toEqual([]);
    });
});

describe("the room, part of the way (#802 AC-2, FR-2, FR-4)", () => {
    it("reads 1 of N, picks up the one opened last, and marks the done one Done", async () => {
        const { roomEl } = await mountLearn({ settings: { learnProgress: { done: ["get-started"], last: "think" } } });
        expect(text(roomEl, "learn-progress-text")).toEqual(["1 of 4 tutorials"]);
        expect(roomEl.oneByClass("learn-ring-row").cssProps["--zf-learn-ring"]).toBe("25");
        expect(roomEl.oneByClass("learn-ring-row").hasClass("is-empty")).toBe(false);
        expect(text(roomEl, "learn-next-label")).toEqual(["Pick up where you left off"]);
        expect(text(roomEl, "learn-next-title")).toEqual(["Think before it is knowledge"]);
        expect(text(roomEl, "learn-track-count")).toEqual(["1/2", "0/1", "0/1"]);
        expect(roomEl.byClass("learn-track-fill")[0].cssProps["--zf-learn-track"]).toBe("0.5");
        expect(cardOf(roomEl, "get-started").oneByClass("learn-card-done").textContent).toBe("Done");
        expect(cardOf(roomEl, "get-started").hasClass("is-done")).toBe(true);
    });

    it("says you have done them all", async () => {
        const { roomEl } = await mountLearn({ settings: { learnProgress: { done: ["get-started", "undo", "think", "library"] } } });
        expect(text(roomEl, "learn-next-label")).toEqual(["You have done them all."]);
        expect(roomEl.byClass("learn-next-button")).toEqual([]);
    });

    it("badges a tutorial added since the last visit as New, unless it is already done (FR-4)", async () => {
        const raw = learnRoomCatalog();
        ObsidianApi.saveLocal(LEARN_STORAGE_KEY, { catalog: raw, fetchedAt: 1, seen: trackIds(raw).filter((id) => id !== "library" && id !== "think") });
        const { roomEl } = await mountLearn({ settings: { learnProgress: { done: ["think"] } } });
        expect(cardOf(roomEl, "library").byClass("learn-new").map((el) => el.textContent)).toEqual(["New"]);
        expect(cardOf(roomEl, "think").byClass("learn-new")).toEqual([]);
    });
});

describe("look anything up, and the questions (#802 FR-5, FR-6)", () => {
    it("shows the first ten rows, then all of them, and a group chip narrows the list", async () => {
        const { roomEl } = await mountLearn();
        const lookup = roomEl.oneByClass("learn-lookup");
        expect(text(lookup, "learn-group")).toEqual(["All", "Start", "Read"]);
        expect(lookup.byClass("learn-ref-row")).toHaveLength(10);
        lookup.oneByClass("learn-show-all").click();
        expect(text(roomEl.oneByClass("learn-lookup"), "learn-show-all")).toEqual([]);
        expect(roomEl.oneByClass("learn-lookup").byClass("learn-ref-row")).toHaveLength(12);
        const read = roomEl.oneByClass("learn-lookup").byClass("learn-group").find((chip) => chip.textContent === "Read") as DomNode;
        read.click();
        const after = roomEl.oneByClass("learn-lookup");
        expect(text(after, "learn-ref-name")).toEqual(["Library", "Highlights"]);
        expect(after.byClass("learn-group").find((chip) => chip.textContent === "Read")?.getAttribute("aria-pressed")).toBe("true");
    });

    it("lists the questions closed, each one expandable", async () => {
        const { roomEl } = await mountLearn();
        const items = roomEl.oneByClass("learn-faq").byClass("learn-faq-item");
        expect(items.map((item) => item.tag)).toEqual(["details", "details"]);
        expect(items.map((item) => item.open)).toEqual([false, false]);
        expect(items[0].oneByClass("learn-faq-q").textContent).toBe("Can I undo what a flow wrote?");
    });
});

describe("loading (#802 FR-8)", () => {
    it("shows the room's shape on a first visit, until the catalog arrives", async () => {
        const { roomEl } = await mountLearn({ load: () => new Promise(() => undefined) });
        expect(roomEl.byClass("learn-card").every((card) => card.hasClass("is-skeleton"))).toBe(true);
        expect(roomEl.byClass("learn-card")).toHaveLength(4);
        expect(text(roomEl, "learn-line")).toEqual(["Loading the tutorials…"]);
        expect(roomEl.oneByClass("learn-progress").hasClass("is-hidden")).toBe(true);
    });

    it("shows the empty state, and no skeleton, with no copy and no network", async () => {
        const { roomEl } = await mountLearn({ load: async () => ({ catalog: null, freshness: { state: "empty" } }) });
        expect(roomEl.byClass("learn-card")).toEqual([]);
        expect(roomEl.oneByClass("learn-line").hasClass("is-empty-state")).toBe(true);
    });
});

describe("progress is the vault's (#802 AC-7, FR-12)", () => {
    it("keeps Done across a closed and reopened view, and the nav's count follows it", async () => {
        const settings: Record<string, any> = {};
        const first = await openLearnView({ settings });
        expect(learnCount(first.content)).toBe("0/4");
        cardOf(first.content, "get-started").click();
        await flush();
        const done = first.content.oneByClass("learn-mark-done");
        expect(done.textContent).toBe("Mark as done");
        done.click();
        expect(first.content.oneByClass("learn-mark-done").textContent).toBe("Done");
        expect(settings.learnProgress).toEqual({ done: ["get-started"], last: "get-started" });
        expect(learnCount(first.content)).toBe("1/4");
        await first.view.onClose();
        // A write still waiting goes out as the view closes.
        expect(first.plugin.saveSettings).toHaveBeenCalled();

        const again = await openLearnView({ settings });
        expect(cardOf(again.content, "get-started").oneByClass("learn-card-done").textContent).toBe("Done");
        expect(learnCount(again.content)).toBe("1/4");
        expect(again.content.oneByClass("learn-progress-text").textContent).toBe("1 of 4 tutorials");
        await again.view.onClose();
    });

    it("writes nothing to data.json for only looking", async () => {
        const settings: Record<string, any> = {};
        const { view, plugin } = await openLearnView({ settings });
        await view.onClose();
        expect(plugin.saveSettings).not.toHaveBeenCalled();
        expect(settings).toEqual({});
    });
});

describe("Learn speaks the vault's language (#802 AC-11)", () => {
    // The locale is read once, at load (the plugin's own strings); the catalog follows Obsidian's
    // language as the room draws.
    it("draws the catalog in Spanish", async () => {
        __setLanguage("es");
        const { roomEl } = await mountLearn({ lang: "es" });
        expect(text(roomEl, "learn-track-title")[0]).toBe("Tus primeros diez minutos");
        expect(cardOf(roomEl, "library").oneByClass("learn-tutorial-title").textContent).toBe("Tu Biblioteca");
    });
});
