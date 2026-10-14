/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, it, expect, jest } from "@jest/globals";

jest.mock("application/community/view/contributeRoom", () => ({ CONTRIBUTE_ROOM: {} }));
jest.mock("application/community/view/installedRoom", () => ({ INSTALLED_ROOM: {} }));
jest.mock("application/community/view/systemsRoom", () => ({ SYSTEMS_ROOM: {} }));

import { __resetLocal } from "architecture";
import { forgetLearnSession } from "application/community/learn/learnSource";
import { LEARN_SHOT } from "application/community/view/learnShots";
import { DomNode, flush, settle } from "../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord, type FakeAnimation } from "../../support/motionDom";
import { cardOf, mountLearn } from "../../support/learnRoomHarness";

/**
 * **The Learn room's shots** (#802 AC-10): the card's picture becomes the stage, the camera goes down
 * the film, *Up next* turns like a chapter, Back flies home — transform and opacity only, skipped by
 * input, settled by a timeout, and cuts under reduced motion.
 */
const COMPOSITOR = new Set(["transform", "opacity", "offset", "easing", "composite", "visibility"]);

function fakeWindow(reduce: boolean): any {
    const win = new DomNode() as any;
    win.matchMedia = () => ({ matches: reduce });
    win.setTimeout = (fn: () => void, ms: number) => {
        const timer = setTimeout(fn, ms);
        (timer as { unref?: () => void }).unref?.();
        return timer;
    };
    win.clearTimeout = (id: any) => clearTimeout(id);
    return win;
}

const ghosts = (record: AnimationRecord): FakeAnimation[] => record.animations.filter((one) => one.target?.hasClass?.("zettelkasten-flow__learn-ghost"));
const on = (record: AnimationRecord, cls: string): FakeAnimation[] => record.animations.filter((one) => one.target?.hasClass?.(`zettelkasten-flow__${cls}`));
const compositorOnly = (animations: FakeAnimation[]) => animations.every((one) => one.keyframes.every((frame) => Object.keys(frame).every((key) => COMPOSITOR.has(key))));

let record: AnimationRecord;
let restore: () => void = () => undefined;

beforeEach(() => {
    __resetLocal();
    forgetLearnSession();
    record = recordAnimations();
    (globalThis as any).activeWindow = fakeWindow(false);
});

afterEach(() => {
    record.stop();
    restore();
    restore = () => undefined;
    delete (globalThis as any).activeWindow;
});

async function opened(id = "get-started") {
    const mounted = await mountLearn();
    const card = cardOf(mounted.roomEl, id);
    const opening = mounted.room.open(id, { tutorial: id, el: card as any, picture: card.oneByClass("learn-card-thumb") as any });
    await settle(() => ghosts(record).length > 0);
    return { ...mounted, card, opening };
}

describe("the card's picture becomes the stage (#802 AC-10)", () => {
    it("flies one ghost, whole to the end, and the film shows as it lands", async () => {
        const { roomEl, opening } = await opened();
        expect(ghosts(record)).toHaveLength(1);
        const [ghost] = ghosts(record);
        expect(ghost.options.duration).toBe(LEARN_SHOT.open);
        // `land: "become"`: it never fades out — the stage takes its place.
        expect(ghost.keyframes.at(-1)!.opacity).toBe(ghost.keyframes[0].opacity);
        expect(compositorOnly([ghost])).toBe(true);
        const stage = roomEl.oneByClass("learn-stage");
        expect(stage.hasClass("is-waiting")).toBe(true);
        record.finishAll();
        await opening;
        expect(stage.hasClass("is-waiting")).toBe(false);
    });

    it("closes, once it lands, on an Esc pressed mid-flight — the press is never lost", async () => {
        const { room, roomEl, opening } = await opened();
        // The key jumps the shot to its end first (caught on the window), then reaches the room.
        (globalThis as any).activeWindow.fire("keydown");
        expect(room.onEscape()).toBe(true);
        await opening;
        await settle(() => roomEl.byClass("learn-lesson").length === 0);
        expect(roomEl.byClass("learn-lesson")).toEqual([]);
        record.finishAll();
    });

    it("jumps to its end on any press", async () => {
        const { opening } = await opened();
        (globalThis as any).activeWindow.fire("pointerdown");
        expect(ghosts(record)[0].playState).toBe("finished");
        await opening;
    });

    it("never waits on a flight that never ends for longer than its length and a beat", async () => {
        const { roomEl, opening } = await opened();
        const started = Date.now();
        await opening;
        expect(Date.now() - started).toBeLessThan(LEARN_SHOT.open + 1500);
        expect(roomEl.oneByClass("learn-stage").hasClass("is-waiting")).toBe(false);
    }, 10_000);
});

describe("the camera down the film, and the chapter turn (#802 AC-10)", () => {
    it("moves the film by transform alone, and only to another picture", async () => {
        const { roomEl, opening } = await opened();
        record.finishAll();
        await opening;
        const lesson = roomEl.oneByClass("learn-lesson");
        lesson.oneByClass("learn-next-step").click();
        const [move] = on(record, "learn-film-track");
        expect(move.options.duration).toBe(LEARN_SHOT.step);
        expect(move.keyframes.map((frame) => frame.transform)).toEqual(["translateY(0%)", "translateY(-100%)"]);
        expect(compositorOnly([move])).toBe(true);
        // Step 3 keeps step 2's picture: no move at all.
        lesson.oneByClass("learn-next-step").click();
        expect(on(record, "learn-film-track")).toHaveLength(1);
    });

    it("slides the next lesson in from the right as the one you were on leaves", async () => {
        const { roomEl, opening } = await opened();
        record.finishAll();
        await opening;
        const before = roomEl.oneByClass("learn-lesson");
        before.oneByClass("learn-up-next").click();
        await flush();
        const turn = on(record, "learn-lesson");
        expect(turn).toHaveLength(2);
        expect(compositorOnly(turn)).toBe(true);
        expect(turn[0].target).toBe(before);
        expect(turn[0].keyframes.at(-1)).toEqual({ transform: "translateX(-100%)", opacity: 0 });
        expect(turn[1].keyframes[0]).toEqual({ transform: "translateX(100%)" });
        expect(before.hasClass("is-leaving")).toBe(true);
        record.finishAll();
        await settle(() => roomEl.byClass("learn-lesson").length === 1);
        expect(roomEl.oneByClass("learn-lesson").getAttribute("data-tutorial")).toBe("undo");
    });
});

describe("Back flies the picture home (#802 AC-10)", () => {
    it("onto its card, scrolled into view first, which already says Done", async () => {
        const { room, roomEl, card, opening } = await opened();
        record.finishAll();
        await opening;
        roomEl.oneByClass("learn-mark-done").click();
        const closing = room.close();
        await settle(() => ghosts(record).length > 1);
        const home = ghosts(record)[1];
        expect(home.options.duration).toBe(LEARN_SHOT.close);
        expect(card.scrolls.length).toBeGreaterThan(0);
        expect(card.oneByClass("learn-card-thumb").hasClass("is-travelling")).toBe(true);
        // Before it lands, the card, the ring and the bar already say so.
        expect(card.oneByClass("learn-card-done").textContent).toBe("Done");
        expect(roomEl.oneByClass("learn-progress-text").textContent).toBe("1 of 4 tutorials");
        expect(roomEl.byClass("learn-track-count")[0].textContent).toBe("1/2");
        record.finishAll();
        await closing;
        expect(card.oneByClass("learn-card-thumb").hasClass("is-travelling")).toBe(false);
    });
});

describe("under reduced motion, every shot is a cut (#802 AC-10)", () => {
    it("plays nothing, and lands everything at once", async () => {
        restore = reducedMotion(true);
        (globalThis as any).activeWindow = fakeWindow(true);
        const { room, roomEl } = await mountLearn();
        const card = cardOf(roomEl, "get-started");
        await room.open("get-started", { tutorial: "get-started", el: card as any, picture: card.oneByClass("learn-card-thumb") as any });
        expect(roomEl.oneByClass("learn-stage").hasClass("is-waiting")).toBe(false);
        roomEl.oneByClass("learn-next-step").click();
        expect(roomEl.oneByClass("learn-film-track").cssProps["--zf-learn-frame"]).toBe("1");
        roomEl.oneByClass("learn-up-next").click();
        await flush();
        expect(roomEl.byClass("learn-lesson")).toHaveLength(1);
        await room.close();
        expect(record.animations).toHaveLength(0);
    });
});
