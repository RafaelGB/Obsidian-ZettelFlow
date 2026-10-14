/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("architecture/components/core/surface/runCommand", () => ({ runCommand: jest.fn() }));
jest.mock("architecture/plugin/services/ViewActivation", () => ({ activateSurface: jest.fn(async () => undefined) }));
jest.mock("architecture/components/core/surface/openSettings", () => ({ openZettelFlowSettings: jest.fn() }));
jest.mock("application/community/view/legacyRooms", () => {
    const room = { mount: () => ({ dispose: () => undefined }) };
    return { LEGACY_ROOMS: { contribute: room, installed: room } };
});
jest.mock("application/community/view/systemsRoom", () => ({ SYSTEMS_ROOM: { mount: () => ({ dispose: () => undefined }) } }));

import { __resetLocal } from "architecture";
import { runCommand } from "architecture/components/core/surface/runCommand";
import { activateSurface } from "architecture/plugin/services/ViewActivation";
import { openZettelFlowSettings } from "architecture/components/core/surface/openSettings";
import { resolveDoor, runDoor } from "application/community/learn/doItNow";
import { forgetLearnSession } from "application/community/learn/learnSource";
import { DomNode, flush } from "../../support/dashboardDom";
import { press } from "../../support/readerKeys";
import { cardOf, focusOn, mountLearn, openLearnView } from "../../support/learnRoomHarness";

beforeEach(() => {
    __resetLocal();
    forgetLearnSession();
    jest.clearAllMocks();
});

afterEach(() => {
    delete (globalThis as any).activeDocument;
});

describe("Do it now goes through the capability's best door Learn can run (#802 AC-8, FR-13)", () => {
    it("runs the ribbon's command, or a command", () => {
        expect(resolveDoor("home")).toEqual({ kind: "command", id: "show-home" });
        // Quick capture's first door is a control on Home; its command is the one Learn can run.
        expect(resolveDoor("quick-capture")).toEqual({ kind: "command", id: "quick-capture" });
    });

    it("opens a surface at its mode", () => {
        expect(resolveDoor("knowledge-map")).toEqual({ kind: "surface", viewType: "zettelflow-explore", mode: "explore" });
    });

    it("opens settings on the door's section", () => {
        const doors = { tune: { nameKey: "x", owner: "x", doors: [{ kind: "settings", at: "settings_section_flows" }] } } as any;
        expect(resolveDoor("tune", doors)).toEqual({ kind: "settings", section: "flows" });
    });

    it("has nothing to run for a control or a menu only, nor for an unknown capability", () => {
        expect(resolveDoor("inquiry")).toBeNull();
        expect(resolveDoor("collision")).toBeNull();
        expect(resolveDoor("launch-rockets")).toBeNull();
        expect(resolveDoor("constructor")).toBeNull();
    });

    it("runs each door the way the door already does", () => {
        const app = { id: "app" } as any;
        runDoor(app, { kind: "command", id: "show-home" });
        expect(runCommand).toHaveBeenCalledWith("show-home");
        runDoor(app, { kind: "surface", viewType: "zettelflow-explore", mode: "explore" });
        expect(activateSurface).toHaveBeenCalledWith(app, "zettelflow-explore", "explore");
        runDoor(app, { kind: "settings", section: "flows" });
        expect(openZettelFlowSettings).toHaveBeenCalledWith(app, "flows");
    });
});

async function lessonOf(id: string) {
    const mounted = await mountLearn();
    cardOf(mounted.roomEl, id).click();
    await flush();
    const lesson = () => mounted.roomEl.oneByClass("learn-lesson");
    return { ...mounted, lesson };
}

const active = (lesson: DomNode) => lesson.byClass("learn-step").findIndex((step) => step.hasClass("is-active"));
const frame = (lesson: DomNode) => lesson.oneByClass("learn-film-track").cssProps["--zf-learn-frame"];

describe("a lesson, in place (#802 AC-6, FR-9, FR-10)", () => {
    it("opens where the room was, with a crumb, the door and the numbered steps", async () => {
        const { roomEl, lesson } = await lessonOf("get-started");
        expect(roomEl.oneByClass("learn-home").hasClass("is-hidden")).toBe(true);
        expect(lesson().oneByClass("learn-crumb").textContent).toBe("Learn/Your first ten minutes");
        expect(lesson().oneByClass("learn-lesson-title").textContent).toBe("Get started");
        expect(lesson().oneByClass("learn-door").textContent).toBe("Where it isRibbon menu");
        expect(lesson().byClass("learn-step-title").map((el) => el.textContent)).toEqual(["Step 1", "Step 2", "Step 3", "Step 4"]);
        expect(lesson().oneByClass("learn-step-of").textContent).toBe("Step 1 of 4");
        expect(lesson().byClass("learn-film-frame")).toHaveLength(3);
    });

    it("walks the steps: Next step twice is step 3; the camera holds still on a step with no picture of its own", async () => {
        const { lesson } = await lessonOf("get-started");
        lesson().oneByClass("learn-next-step").click();
        expect(frame(lesson())).toBe("1");
        lesson().oneByClass("learn-next-step").click();
        expect(active(lesson())).toBe(2);
        expect(lesson().oneByClass("learn-step-of").textContent).toBe("Step 3 of 4");
        // Step 3 has no picture: step 2's stays in view.
        expect(frame(lesson())).toBe("1");
        lesson().oneByClass("learn-next-step").click();
        expect(frame(lesson())).toBe("2");
        expect((lesson().oneByClass("learn-next-step") as any).disabled).toBe(true);
        lesson().byClass("learn-step")[0].click();
        expect(frame(lesson())).toBe("0");
        expect((lesson().oneByClass("learn-prev") as any).disabled).toBe(true);
    });

    it("steps with the arrows, but not while you type, and the arrows are gone once it closes (FR-11)", async () => {
        const { room, scope, lesson } = await lessonOf("get-started");
        focusOn(new DomNode("body"));
        expect(press({ view: { scope } }, "ArrowDown").defaultPrevented).toBe(true);
        expect(press({ view: { scope } }, "ArrowRight").defaultPrevented).toBe(true);
        expect(active(lesson())).toBe(2);
        expect(press({ view: { scope } }, "ArrowUp").defaultPrevented).toBe(true);
        expect(active(lesson())).toBe(1);
        focusOn(new DomNode("input"));
        expect(press({ view: { scope } }, "ArrowLeft").defaultPrevented).toBe(false);
        expect(active(lesson())).toBe(1);
        await room.close();
        focusOn(new DomNode("body"));
        expect(press({ view: { scope } }, "ArrowDown").defaultPrevented).toBe(false);
        expect((scope as any).keys.filter((key: any) => key.key.startsWith("Arrow"))).toEqual([]);
    });

    it("toggles Mark as done", async () => {
        const { lesson, settings } = await lessonOf("get-started");
        const done = () => lesson().oneByClass("learn-mark-done");
        done().click();
        expect(done().textContent).toBe("Done");
        expect(done().getAttribute("aria-pressed")).toBe("true");
        expect(settings.learnProgress.done).toEqual(["get-started"]);
        done().click();
        expect(done().textContent).toBe("Mark as done");
        expect(settings.learnProgress.done).toEqual([]);
    });

    it("offers Do it now, in the tutorial's own words, only when its capability has a door to run (AC-8)", async () => {
        const first = await lessonOf("get-started");
        const button = first.lesson().oneByClass("learn-do-it");
        expect(button.textContent).toBe("Show home");
        button.click();
        expect(first.runDoor).toHaveBeenCalledWith(first.host.app, { kind: "command", id: "show-home" });
        const think = await lessonOf("think");
        expect(think.lesson().byClass("learn-do-it")).toEqual([]);
    });

    it("reads the full page on the docs site", async () => {
        const { lesson, openUrl } = await lessonOf("get-started");
        lesson().oneByClass("learn-read-doc").click();
        expect(openUrl).toHaveBeenCalledWith("https://rafaelgb.github.io/Obsidian-ZettelFlow/architecture/reversibility/");
        const library = await lessonOf("library");
        expect(library.lesson().byClass("learn-read-doc")).toEqual([]);
    });

    it("turns to Up next, then to a related tutorial, and Back still goes to the room", async () => {
        const { roomEl, room, lesson } = await lessonOf("get-started");
        expect(lesson().oneByClass("learn-up-next-title").textContent).toBe("Undo what a flow wrote");
        expect(lesson().byClass("learn-related-chip").map((el) => el.textContent)).toEqual(["Think before it is knowledge"]);
        lesson().oneByClass("learn-related-chip").click();
        await flush();
        expect(roomEl.byClass("learn-lesson").map((el) => el.getAttribute("data-tutorial"))).toEqual(["think"]);
        lesson().oneByClass("learn-up-next").click();
        await flush();
        expect(roomEl.byClass("learn-lesson").map((el) => el.getAttribute("data-tutorial"))).toEqual(["library"]);
        expect(lesson().byClass("learn-up-next")).toEqual([]);
        await room.close();
        expect(roomEl.byClass("learn-lesson")).toEqual([]);
        expect(roomEl.oneByClass("learn-home").hasClass("is-hidden")).toBe(false);
    });
});

describe("Esc closes the lesson, and the room is as it was (#802 AC-6)", () => {
    it("closes through the view's scope and keeps the room's own nodes", async () => {
        const { view, content } = await openLearnView();
        const home = content.oneByClass("learn-home");
        const card = cardOf(content, "undo");
        card.click();
        await flush();
        expect(content.byClass("learn-lesson")).toHaveLength(1);
        expect(press({ view }, "Escape").defaultPrevented).toBe(true);
        await flush();
        expect(content.byClass("learn-lesson")).toEqual([]);
        expect(content.oneByClass("learn-home")).toBe(home);
        expect(home.hasClass("is-hidden")).toBe(false);
        expect(cardOf(content, "undo")).toBe(card);
        // With no lesson open, Esc is Obsidian's again.
        expect(press({ view }, "Escape").defaultPrevented).toBe(false);
        await view.onClose();
    });
});

describe("a reference row (#802 AC-9)", () => {
    it("opens its lesson when it has a tutorial, and its docs page otherwise", async () => {
        const { roomEl, openUrl } = await mountLearn();
        const rows = roomEl.oneByClass("learn-lookup").byClass("learn-ref-row");
        rows.find((row) => row.oneByClass("learn-ref-name").textContent === "Home")?.click();
        expect(openUrl).toHaveBeenCalledWith("https://rafaelgb.github.io/Obsidian-ZettelFlow/development/zettelflow-home/");
        expect(roomEl.byClass("learn-lesson")).toEqual([]);
        rows.find((row) => row.oneByClass("learn-ref-name").textContent === "Undo")?.click();
        await flush();
        expect(roomEl.oneByClass("learn-lesson").getAttribute("data-tutorial")).toBe("undo");
    });
});

describe("a deep link to a tutorial (S6's How to contribute)", () => {
    it("opens it once the catalog is here", async () => {
        const { room, roomEl } = await mountLearn();
        room.applyState({ tutorial: "library" });
        await flush();
        expect(roomEl.oneByClass("learn-lesson").getAttribute("data-tutorial")).toBe("library");
    });
});
