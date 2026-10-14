/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, it, expect, jest } from "@jest/globals";

jest.mock("architecture/settings/suggesters/FolderSuggest", () => ({ FolderSuggest: class { } }));
jest.mock("application/community/CommunityStepModal", () => ({ CommunityStepModal: class { } }));
jest.mock("application/community/CommunityActionModal", () => ({ CommunityActionModal: class { } }));
jest.mock("application/community/CommunityMarkdownModal", () => ({ CommunityMarkdownModal: class { } }));
jest.mock("application/community/view/legacyRooms", () => {
    const room = { mount: () => ({ dispose: () => undefined }) };
    return { LEGACY_ROOMS: { learn: room, contribute: room, installed: room } };
});

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { WorkspaceLeaf } from "obsidian";
import { __resetLocal } from "architecture";
import { replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { CommunityView } from "application/community/view/CommunityView";
import { systemsRoom } from "application/community/view/systemsRoom";
import { SHOT } from "application/community/view/systemShots";
import { DomNode, flush, settle } from "../../support/dashboardDom";
import { recordAnimations, reducedMotion, type AnimationRecord, type FakeAnimation } from "../../support/motionDom";
import { wireHarness } from "../../support/harness";
import { REFS, cardOf, fixtureCatalog, fixtureTemplates, mountRoom } from "../../support/systemsRoomHarness";
import { parseYamlForTests } from "../../support/systemsFixtures";

const ROOT = join(__dirname, "..", "..", "..");
const VIEW = join(ROOT, "src", "application", "community", "view");
const SHEETS = ["communitySystems.scss", "communityView.scss"].map((name) => join(ROOT, "src", "styles", "components", name));
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
