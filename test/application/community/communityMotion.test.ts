/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, it, expect, jest } from "@jest/globals";

jest.mock("architecture/settings/suggesters/FolderSuggest", () => ({ FolderSuggest: class { } }));
jest.mock("application/community/CommunityStepModal", () => ({ CommunityStepModal: class { } }));
jest.mock("application/community/CommunityActionModal", () => ({ CommunityActionModal: class { } }));
jest.mock("application/community/CommunityMarkdownModal", () => ({ CommunityMarkdownModal: class { } }));
// Learn is native since #801, and fetches when shown: here it is a stand-in, the shell is what is tested.
jest.mock("application/community/view/learnRoom", () => ({ LEARN_ROOM: { mount: () => ({ dispose: () => undefined }) } }));

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { WorkspaceLeaf } from "obsidian";
import { __resetLocal } from "architecture";
import { replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { CommunityView } from "application/community/view/CommunityView";
import { systemsRoom } from "application/community/view/systemsRoom";
import { SHOT, collapseRow } from "application/community/view/systemShots";
import { INSTALLED_ROOM, type InstalledRoom } from "application/community/view/installedRoom";
import { installSystem } from "application/community/installSystem";
import type { InstalledSystem } from "application/community/installRecord";
import { branching } from "../../support/systemsFixtures";
import { DomNode, flush, settle } from "../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord, type FakeAnimation } from "../../support/motionDom";
import { wireHarness } from "../../support/harness";
import { REFS, cardOf, fixtureCatalog, fixtureTemplates, mountRoom } from "../../support/systemsRoomHarness";
import { parseYamlForTests } from "../../support/systemsFixtures";

const ROOT = join(__dirname, "..", "..", "..");
const VIEW = join(ROOT, "src", "application", "community", "view");
// #802: the Learn room's sheet too — its shots are scripted, so it may not transition or keyframe anything else.
// #803: the Contribute and Installed rooms' sheet too.
const SHEETS = ["communitySystems.scss", "communityView.scss", "communityLearn.scss", "communityRooms.scss"].map((name) => join(ROOT, "src", "styles", "components", name));
const COMPOSITOR = new Set(["transform", "opacity", "offset", "easing", "composite", "visibility"]);

function fakeWindow(reduce: boolean): any {
    const win = new DomNode() as any;
    win.matchMedia = () => ({ matches: reduce });
    // Unref'd: a ghost's patience must not keep the test worker alive after the test is done.
    win.setTimeout = (fn: () => void, ms: number) => {
        const timer = setTimeout(fn, ms);
        (timer as { unref?: () => void }).unref?.();
        return timer;
    };
    win.clearTimeout = (id: any) => clearTimeout(id);
    return win;
}

const ghostsOf = (record: AnimationRecord): FakeAnimation[] =>
    record.animations.filter((animation) => animation.target?.hasClass?.("zettelkasten-flow__system-ghost"));

describe("the shots move only what the compositor moves (#799 AC-12, static)", () => {
    it("names only transform and opacity in every scripted keyframe of the view", () => {
        const offenders: string[] = [];
        for (const file of readdirSync(VIEW).filter((name) => name.endsWith(".ts"))) {
            const source = readFileSync(join(VIEW, file), "utf8");
            for (const match of source.matchAll(/\.animate\(\s*\[/g)) {
                // The literal keyframe list that follows, bracket-matched.
                let depth = 0;
                let end = match.index! + match[0].length - 1;
                for (; end < source.length; end++) {
                    if (source[end] === "[") depth++;
                    if (source[end] === "]" && --depth === 0) break;
                }
                const frames = source.slice(match.index! + match[0].length, end).replace(/`[^`]*`/g, "''");
                for (const [, key] of frames.matchAll(/([A-Za-z]+)\s*:/g)) if (!COMPOSITOR.has(key)) offenders.push(`${file}: ${key}`);
            }
        }
        expect(offenders).toEqual([]);
        // The dot's keyframes are built, not written out: they are translates and nothing else.
        expect(readFileSync(join(VIEW, "systemDrawingView.ts"), "utf8")).toMatch(/\(\{ transform: `translate\(/);
    });

    it("names only compositor properties in the stylesheets' keyframes and transitions", () => {
        const offenders: string[] = [];
        for (const sheet of SHEETS) {
            const css = readFileSync(sheet, "utf8");
            for (const match of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
                for (const [, prop] of match[2].matchAll(/^\s*([a-z-]+)\s*:/gm)) if (!COMPOSITOR.has(prop)) offenders.push(`${sheet} @keyframes ${match[1]}: ${prop}`);
            }
            for (const match of css.matchAll(/transition:\s*([^;]+);/g)) {
                if (match[1].trim() === "none") continue;
                for (const part of match[1].split(",")) {
                    const prop = part.trim().split(/\s+/)[0];
                    if (!COMPOSITOR.has(prop)) offenders.push(`${sheet}: transition ${prop}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe("the shots, played (#799 AC-12, FR-7, FR-13)", () => {
    let record: AnimationRecord;
    let restore: () => void = () => undefined;

    beforeEach(() => {
        record = recordAnimations();
        (globalThis as any).activeWindow = fakeWindow(false);
        (globalThis as any).createFragment = () => new DomNode("#fragment");
        replaceBufferedWrites([]);
        __resetLocal();
    });

    afterEach(() => {
        record.stop();
        restore();
        restore = () => undefined;
        delete (globalThis as any).activeWindow;
    });

    it("grows the card's drawing into the stage: one ghost, whole to the end, the stage shown as it lands", async () => {
        const mounted = await mountRoom();
        const thumb = cardOf(mounted.roomEl, "Zettelkasten v2").oneByClass("system-card-thumb");
        const opening = mounted.room.open(REFS.zettelkasten);
        await settle(() => ghostsOf(record).length > 0);
        const [ghost] = ghostsOf(record);
        expect(ghostsOf(record)).toHaveLength(1);
        // `land: "become"`: it never fades out — the real drawing takes its place.
        expect(ghost.keyframes.at(-1)!.opacity).toBe(ghost.keyframes[0].opacity);
        expect(ghost.options.duration).toBe(SHOT.open);
        expect(thumb.hasClass("is-travelling")).toBe(true);
        const stage = mounted.roomEl.oneByClass("system-stage");
        expect(stage.hasClass("is-waiting")).toBe(true);
        record.finishAll();
        await opening;
        expect(stage.hasClass("is-waiting")).toBe(false);
        expect(thumb.hasClass("is-travelling")).toBe(false);
    });

    it("walks with a dot along the edge and the camera onto the step, by transform alone", async () => {
        const mounted = await mountRoom();
        const opening = mounted.room.open(REFS.zettelkasten);
        await settle(() => ghostsOf(record).length > 0);
        record.finishAll();
        await opening;
        const before = record.animations.length;
        mounted.roomEl.byClass("system-exit")[0].click();
        await flush();
        const walk = record.animations.slice(before);
        expect(walk.some((animation) => animation.target.hasClass("zettelkasten-flow__system-dot"))).toBe(true);
        expect(walk.some((animation) => animation.target.hasClass("zettelkasten-flow__system-drawing-camera"))).toBe(true);
        for (const animation of walk) for (const frame of animation.keyframes) for (const key of Object.keys(frame)) expect(COMPOSITOR.has(key)).toBe(true);
        record.finishAll();
    });

    it("cuts under reduced motion: no animation, and the stage is there at once", async () => {
        restore = reducedMotion(true);
        (globalThis as any).activeWindow = fakeWindow(true);
        const mounted = await mountRoom();
        await mounted.room.open(REFS.zettelkasten);
        expect(record.animations).toHaveLength(0);
        expect(mounted.roomEl.oneByClass("system-stage").hasClass("is-waiting")).toBe(false);
        mounted.roomEl.byClass("system-exit")[0].click();
        await flush();
        expect(record.animations).toHaveLength(0);
    });

    it("jumps a flight to its end on any press", async () => {
        const mounted = await mountRoom();
        const opening = mounted.room.open(REFS.zettelkasten);
        await settle(() => ghostsOf(record).length > 0);
        (globalThis as any).activeWindow.fire("pointerdown");
        expect(ghostsOf(record)[0].playState).toBe("finished");
        await opening;
    });

    it("never waits on a flight that never ends for longer than its length and a beat", async () => {
        const mounted = await mountRoom();
        const started = Date.now();
        await mounted.room.open(REFS.zettelkasten);
        const took = Date.now() - started;
        expect(took).toBeGreaterThanOrEqual(SHOT.open);
        expect(took).toBeLessThan(SHOT.open + 1500);
        expect(mounted.roomEl.oneByClass("system-stage").hasClass("is-waiting")).toBe(false);
    }, 10_000);

    it("fills the tab with the drawing before the tab becomes the canvas", async () => {
        const mounted = await mountRoom();
        const opening = mounted.room.open(REFS.zettelkasten);
        await settle(() => ghostsOf(record).length > 0);
        record.finishAll();
        await opening;
        mounted.roomEl.oneByClass("system-install").click();
        await settle(() => ghostsOf(record).length > 1);
        const landing = ghostsOf(record)[1];
        expect(landing.options.duration).toBe(SHOT.land);
        expect(mounted.leaf.openFile).not.toHaveBeenCalled();
        record.finishAll();
        await settle(() => mounted.leaf.openFile.mock.calls.length > 0);
        expect(mounted.leaf.openFile).toHaveBeenCalledTimes(1);
    });

    it("flies home onto the card when Back restores Systems, and forgets the flight once flown", async () => {
        const harness = wireHarness({ settings: {} });
        const content = new DomNode();
        const app = { ...harness.app, workspace: { requestSaveLayout: () => undefined, on: () => ({}) } };
        const templates = fixtureTemplates();
        const renderers = {
            learn: { mount: () => ({ dispose: () => undefined }) },
            contribute: { mount: () => ({ dispose: () => undefined }) },
            installed: { mount: () => ({ dispose: () => undefined }) },
            systems: systemsRoom({ fetchCatalog: async () => fixtureCatalog(), fetchTemplate: async (ref) => templates[ref], parseYaml: parseYamlForTests, lang: () => "en" }),
        };
        const view = new CommunityView(new WorkspaceLeaf(app, content) as never, harness.plugin as never, renderers as never);
        await view.setState({ room: "systems", flyHome: REFS.zettelkasten }, {} as never);
        await view.onOpen();
        await settle(() => ghostsOf(record).length > 0);
        const home = ghostsOf(record)[0];
        expect(home.options.duration).toBe(SHOT.home);
        const card = cardOf(content, "Zettelkasten v2");
        expect(card.scrolls.length).toBeGreaterThan(0);
        expect(card.oneByClass("system-card-thumb").hasClass("is-travelling")).toBe(true);
        record.finishAll();
        await settle(() => !card.oneByClass("system-card-thumb").hasClass("is-travelling"));
        expect(view.getState()).not.toHaveProperty("flyHome");
        expect(view.getState()).toMatchObject({ room: "systems" });
        await view.onClose();
    });
});

describe("a room out of view holds its animations still (#803, found in #802)", () => {
    it("pauses every CSS animation inside a room that is away — Obsidian's loading bar included", () => {
        const css = readFileSync(join(ROOT, "src", "styles", "components", "communityView.scss"), "utf8");
        // On the room's own rule — the nav indicator is `is-away` too, and pausing inside it holds nothing.
        const room = /\n\.zettelkasten-flow__community-room \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
        const block = /&\.is-away \*,\s*&\.is-away \*::before,\s*&\.is-away \*::after \{([^}]*)\}/.exec(room);
        expect(block?.[1]).toMatch(/animation-play-state:\s*paused/);
    });
});

describe("the Installed room's shots (#803 AC-10)", () => {
    let record: AnimationRecord;
    let restore: () => void = () => undefined;

    beforeEach(() => {
        record = recordAnimations();
        (globalThis as any).activeWindow = fakeWindow(false);
        (globalThis as any).createDiv = (options: unknown) => new DomNode().createDiv(options);
        replaceBufferedWrites([]);
        __resetLocal();
    });

    afterEach(() => {
        record.stop();
        restore();
        restore = () => undefined;
        delete (globalThis as any).activeWindow;
    });

    async function installedRoom(harness = wireHarness({ settings: { installedTemplates: { steps: {}, actions: {} }, communitySettings: {} } })) {
        const outcome = await installSystem(harness.plugin as never, branching("Zettelkasten v2"), "/docs/systems/zk.zftemplate", { role: "none", targetFolder: "Flows/ZK" });
        if (outcome.kind !== "installed") throw new Error(outcome.kind);
        (harness.plugin as any).saveSettings = async () => undefined;
        const leaf = { openFile: jest.fn(async (_file: unknown) => undefined) };
        const community = new DomNode("div");
        community.addClass("zettelkasten-flow__community");
        const roomEl = community.createEl("section", { cls: "zettelkasten-flow__community-room" }) as DomNode;
        const room = INSTALLED_ROOM.mount(roomEl as never, { app: harness.app, plugin: harness.plugin, leaf, openRoom: () => undefined } as never) as InstalledRoom;
        await settle(() => roomEl.byClass("system-drawing").length > 0);
        return { room, roomEl, leaf, harness, id: (harness.settings.installedSystems as InstalledSystem[])[0].id };
    }

    it("grows the row's drawing to fill the tab, whole to the end, before the tab becomes the canvas", async () => {
        const { roomEl, leaf } = await installedRoom();
        roomEl.find((el) => el.tag === "button" && el.text === "Open canvas")!.click();
        await settle(() => ghostsOf(record).length > 0);
        const [ghost] = ghostsOf(record);
        expect(ghost.options.duration).toBe(SHOT.land);
        expect(ghost.keyframes.at(-1)!.opacity).toBe(ghost.keyframes[0].opacity);
        expect(roomEl.oneByClass("installed-thumb").hasClass("is-travelling")).toBe(true);
        expect(leaf.openFile).not.toHaveBeenCalled();
        record.finishAll();
        await settle(() => leaf.openFile.mock.calls.length > 0);
        expect(leaf.openFile).toHaveBeenCalledTimes(1);
    });

    it("flies the drawing home onto its row when Back restores Installed", async () => {
        const { room, roomEl, id } = await installedRoom();
        room.applyState({ installedHome: id });
        await settle(() => ghostsOf(record).length > 0);
        expect(ghostsOf(record)[0].options.duration).toBe(SHOT.home);
        expect(roomEl.oneByClass("installed-row").scrolls.length).toBeGreaterThan(0);
        record.finishAll();
        await settle(() => !roomEl.oneByClass("installed-thumb").hasClass("is-travelling"));
    });

    it("lets a removed row go and closes the gap by transform and opacity alone", async () => {
        const list = new DomNode("div");
        const gone = list.createDiv({ cls: "row" }) as DomNode;
        const below = list.createDiv({ cls: "row" }) as DomNode;
        const line = new DomNode("div");
        const leaving = collapseRow(gone as never, line as never);
        await flush();
        expect(record.animations.map((animation) => animation.target)).toEqual([gone]);
        record.finishAll();
        await settle(() => record.animations.length > 1);
        expect(list.children).toEqual([line, below]);
        expect(record.animations.map((animation) => animation.target)).toEqual([gone, below, line]);
        for (const animation of record.animations) for (const frame of animation.keyframes) for (const key of Object.keys(frame)) expect(COMPOSITOR.has(key)).toBe(true);
        record.finishAll();
        await leaving;
    });

    it("cuts under reduced motion: no animation, the row simply replaced", async () => {
        restore = reducedMotion(true);
        (globalThis as any).activeWindow = fakeWindow(true);
        const { roomEl, leaf } = await installedRoom();
        roomEl.find((el) => el.tag === "button" && el.text === "Open canvas")!.click();
        await settle(() => leaf.openFile.mock.calls.length > 0);
        const list = new DomNode("div");
        const gone = list.createDiv() as DomNode;
        const line = new DomNode("div");
        await collapseRow(gone as never, line as never);
        expect(list.children).toEqual([line]);
        expect(record.animations).toHaveLength(0);
    });

    it("never waits on a collapse that never ends for longer than its length and a beat", async () => {
        const list = new DomNode("div");
        const gone = list.createDiv() as DomNode;
        const started = Date.now();
        await collapseRow(gone as never, new DomNode("div") as never);
        const took = Date.now() - started;
        expect(took).toBeLessThan(SHOT.collapse + SHOT.gap + 1500);
        expect(list.children).toHaveLength(1);
    }, 10_000);
});
