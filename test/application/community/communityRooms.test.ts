/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// Today's React panels stand in for themselves: each room records being mounted and let go.
const mounted: { room: string; el: unknown; disposed: boolean }[] = [];
const counts: Record<string, unknown> = {};
jest.mock("application/community/view/legacyRooms", () => {
    const room = (id: string) => ({
        mount: (el: any) => {
            const record = { room: id, el, disposed: false };
            mounted.push(record);
            el.createDiv({ cls: `legacy-${id}`, text: id });
            return { count: () => counts[id] ?? null, dispose: () => (record.disposed = true) };
        },
    });
    return { LEGACY_ROOMS: { learn: room("learn"), contribute: room("contribute"), installed: room("installed") } };
});
// Learn is native since #801; a recorder like the others.
jest.mock("application/community/view/learnRoom", () => ({
    LEARN_ROOM: {
        mount: (el: any) => {
            const record = { room: "learn", el, disposed: false };
            mounted.push(record);
            el.createDiv({ cls: "legacy-learn", text: "learn" });
            return { count: () => counts.learn ?? null, dispose: () => (record.disposed = true) };
        },
    },
}));
// Systems is native since #799; here it is a stand-in like the others — the shell is what is tested.
jest.mock("application/community/view/systemsRoom", () => ({
    SYSTEMS_ROOM: {
        mount: (el: any) => {
            const record = { room: "systems", el, disposed: false };
            mounted.push(record);
            el.createDiv({ cls: "legacy-systems", text: "systems" });
            return { count: () => counts.systems ?? null, dispose: () => (record.disposed = true) };
        },
    },
}));

import { WorkspaceLeaf } from "obsidian";
import { __resetLocal } from "architecture";
import { DomNode, flush } from "../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord } from "../../support/motionDom";
import { CommunityView } from "application/community/view/CommunityView";
import { MOTION } from "architecture/components/core/reader/readerMotion";

const P = "zettelkasten-flow__";

/** A window the view's elements live in: one that answers the motion query, and hears input. */
function fakeWindow(reduce: boolean): any {
    const win = new DomNode() as any;
    win.matchMedia = () => ({ matches: reduce });
    win.setTimeout = (fn: () => void, ms: number) => setTimeout(fn, ms);
    win.clearTimeout = (id: any) => clearTimeout(id);
    return win;
}

async function mount(state?: Record<string, unknown>) {
    const content = new DomNode();
    const app = { workspace: { requestSaveLayout: jest.fn(), on: () => ({}) } };
    const leaf = new WorkspaceLeaf(app, content);
    const plugin = { settings: {}, saveSettings: jest.fn(async () => undefined) };
    const view = new CommunityView(leaf as any, plugin as any);
    if (state) await view.setState(state, {} as never);
    await view.onOpen();
    return { view, content, app };
}

const tabs = (content: DomNode) => content.byClass("community-nav-tab");
const roomsOf = (content: DomNode) => content.byClass("community-room");
const selected = (content: DomNode) => tabs(content).filter((tab) => tab.getAttribute("aria-selected") === "true").map((tab) => tab.getAttribute("data-room"));

let restoreMotion: () => void = () => undefined;
let record: AnimationRecord | null = null;

beforeEach(() => {
    mounted.length = 0;
    for (const key of Object.keys(counts)) delete counts[key];
    __resetLocal();
});

afterEach(() => {
    record?.stop();
    record = null;
    restoreMotion();
    delete (globalThis as any).activeWindow;
    jest.useRealTimers();
});

describe("the room nav (#798 AC-6, FR-2, FR-11)", () => {
    it("is a tablist of the four rooms, in order, one selected and the others out of reach", async () => {
        const { content } = await mount();
        const list = content.byClass("community-nav")[0];
        expect(list.getAttribute("role")).toBe("tablist");
        expect(list.getAttribute("aria-label")).toBe("Community rooms");
        expect(tabs(content).map((tab) => tab.getAttribute("role"))).toEqual(["tab", "tab", "tab", "tab"]);
        expect(tabs(content).map((tab) => tab.getAttribute("aria-label"))).toEqual(["Learn", "Systems", "Contribute", "Installed"]);
        expect(tabs(content).map((tab) => tab.byClass("community-nav-icon")[0].getAttribute("data-icon"))).toEqual(["graduation-cap", "layout-grid", "git-pull-request", "package-check"]);
        expect(selected(content)).toEqual(["learn"]);
        // Roving tabindex: one tab in the Tab order.
        expect(tabs(content).map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
        const rooms = roomsOf(content);
        expect(rooms.map((room) => room.getAttribute("inert"))).toEqual([null, "", "", ""]);
        expect(rooms.map((room) => room.getAttribute("aria-hidden"))).toEqual([null, "true", "true", "true"]);
        // Each tab controls its room, and each room is labelled by its tab.
        expect(tabs(content)[2].getAttribute("aria-controls")).toBe(rooms[2].getAttribute("id"));
        expect(rooms[2].getAttribute("aria-labelledby")).toBe(tabs(content)[2].getAttribute("id"));
    });

    it("moves the selection with Left and Right, wraps, and selects with Enter", async () => {
        const { view, content } = await mount({ room: "installed" });
        tabs(content)[3].fire("keydown", { key: "ArrowLeft" });
        await view.whenSettled();
        expect(selected(content)).toEqual(["contribute"]);
        tabs(content)[2].fire("keydown", { key: "ArrowLeft" });
        await view.whenSettled();
        expect(selected(content)).toEqual(["systems"]);
        tabs(content)[1].fire("keydown", { key: "ArrowRight" });
        await view.whenSettled();
        expect(selected(content)).toEqual(["contribute"]);
        tabs(content)[2].fire("keydown", { key: "End" });
        tabs(content)[3].fire("keydown", { key: "ArrowRight" });
        await view.whenSettled();
        expect(selected(content)).toEqual(["learn"]);
        const enter = tabs(content)[1].fire("keydown", { key: "Enter" });
        await view.whenSettled();
        expect(enter.defaultPrevented).toBe(true);
        expect(selected(content)).toEqual(["systems"]);
        expect(view.getState()).toMatchObject({ room: "systems" });
        expect(roomsOf(content).map((room) => room.getAttribute("inert"))).toEqual(["", null, "", ""]);
    });

    it("draws a count only where there is one: never a zero, never a null", async () => {
        counts.installed = 3;
        counts.systems = 0;
        counts.learn = { done: 2, total: 9 };
        const { content } = await mount();
        const badge = (i: number) => tabs(content)[i].byClass("community-nav-count")[0];
        expect(badge(0).textContent).toBe("2/9");
        expect(badge(0).hasClass(`${P}is-hidden`)).toBe(false);
        expect(badge(1).hasClass(`${P}is-hidden`)).toBe(true);
        expect(badge(2).hasClass(`${P}is-hidden`)).toBe(true);
        expect(badge(3).textContent).toBe("3");
    });
});

describe("the pan (#798 AC-7)", () => {
    it("is a cut under reduced motion: nothing animates, the room is there at once", async () => {
        record = recordAnimations();
        restoreMotion = reducedMotion(true);
        (globalThis as any).activeWindow = fakeWindow(true);
        const { view, content } = await mount();
        tabs(content)[3].click();
        await view.whenSettled();
        expect(record.animations).toHaveLength(0);
        expect(selected(content)).toEqual(["installed"]);
        expect(content.byClass("community-strip")[0].cssProps["--zf-community-room"]).toBe("3");
        expect(roomsOf(content).map((room) => room.hasClass("is-away"))).toEqual([true, true, true, false]);
    });

    it("moves the strip by transform alone, with the indicator in the same gesture, on the shared tokens", async () => {
        record = recordAnimations();
        (globalThis as any).activeWindow = fakeWindow(false);
        const { view, content } = await mount();
        // The tabs have a layout, so the indicator has somewhere to go.
        tabs(content).forEach((tab, i) => Object.assign(tab, { offsetLeft: i * 100, offsetWidth: 80 }));
        tabs(content)[2].click();
        await flush();
        const strip = content.byClass("community-strip")[0];
        const indicator = content.byClass("community-nav-indicator")[0];
        const onStrip = record.animations.filter((a) => a.target === strip);
        const onIndicator = record.animations.filter((a) => a.target === indicator);
        expect(onStrip).toHaveLength(1);
        expect(onIndicator).toHaveLength(1);
        expect(record.keys()).toEqual(new Set(["transform"]));
        expect(onStrip[0].keyframes).toEqual([{ transform: "translateX(0%)" }, { transform: "translateX(-200%)" }]);
        expect(onStrip[0].options).toMatchObject({ duration: MOTION.turn, easing: MOTION.ease });
        expect(onIndicator[0].keyframes[1]).toEqual({ transform: "translateX(200px) scaleX(1)" });
        // Only what the camera passes is painted while it moves.
        expect(roomsOf(content).map((room) => room.hasClass("is-away"))).toEqual([false, false, false, true]);
        record.finishAll();
        await view.whenSettled();
        expect(roomsOf(content).map((room) => room.hasClass("is-away"))).toEqual([true, true, false, true]);
        expect(indicator.cssProps["--zf-community-ind-x"]).toBe("200px");
    });

    it("jumps to its end on any press", async () => {
        record = recordAnimations();
        const win = fakeWindow(false);
        (globalThis as any).activeWindow = win;
        const { view, content } = await mount();
        tabs(content)[1].click();
        await flush();
        const [strip] = record.animations;
        expect(strip.playState).toBe("running");
        win.fire("pointerdown");
        expect(strip.playState).toBe("finished");
        await view.whenSettled();
        expect(selected(content)).toEqual(["systems"]);
    });

    it("settles even when the animation never says it finished", async () => {
        jest.useFakeTimers();
        record = recordAnimations();
        (globalThis as any).activeWindow = fakeWindow(false);
        const { view, content } = await mount();
        tabs(content)[3].click();
        let settled = false;
        void view.whenSettled().then(() => (settled = true));
        await Promise.resolve();
        jest.advanceTimersByTime(MOTION.turn + 299);
        await Promise.resolve();
        expect(settled).toBe(false);
        jest.advanceTimersByTime(1);
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(settled).toBe(true);
        expect(roomsOf(content).map((room) => room.hasClass("is-away"))).toEqual([true, true, true, false]);
    });
});

describe("today's panels, re-hosted (#798 FR-8)", () => {
    it("mounts each room once, in its own room, and lets each go when the view closes", async () => {
        const { view, content } = await mount();
        expect(mounted.map((m) => m.room)).toEqual(["learn", "systems", "contribute", "installed"]);
        expect(roomsOf(content).map((room) => room.children[0]?.className)).toEqual(["legacy-learn", "legacy-systems", "legacy-contribute", "legacy-installed"]);
        tabs(content)[1].click();
        await view.whenSettled();
        expect(mounted).toHaveLength(4);
        await view.onClose();
        expect(mounted.every((m) => m.disposed)).toBe(true);
    });
});
