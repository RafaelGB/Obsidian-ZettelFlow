/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from "@jest/globals";
import { Scope, WorkspaceLeaf } from "obsidian";
import { DomNode, flush } from "./dashboardDom";
import { learnRoomCatalog } from "./learnFixtures";
import { parseLearnCatalog, type LearnCatalog } from "application/community/learn/learnCatalog";
import type { LearnLoad } from "application/community/learn/learnSource";
import { LearnImages, type LearnImageDeps } from "application/community/learn/learnImages";
import { LearnRoom, learnRoom, type LearnRoomDeps } from "application/community/view/learnRoom";
import { CommunityView } from "application/community/view/CommunityView";

/**
 * The Learn room under test (#802): mounted on its own with a keymap scope of its own, or inside a
 * whole Community view. The catalog is handed over, the pictures are fake blobs, and *Do it now* and
 * *Read the full page* are recorded, never run.
 */
export const VERSION = "3.7.0";

export function parsed(raw: unknown = learnRoomCatalog()): LearnCatalog {
    const result = parseLearnCatalog(raw, { pluginVersion: VERSION });
    if (result.status !== "ok") throw new Error(result.status);
    return result.catalog;
}

export function fakeImages(): { deps: LearnImageDeps; fetched: string[] } {
    const fetched: string[] = [];
    return {
        fetched,
        deps: {
            fetch: async (url) => {
                fetched.push(url);
                return { bytes: new ArrayBuffer(4), contentType: "image/svg+xml" };
            },
            toUrl: () => `blob:${fetched.length}`,
            revoke: () => undefined,
        },
    };
}

export interface LearnOptions {
    raw?: unknown;
    /** What the network answers; by default the catalog, fresh. */
    load?: () => Promise<LearnLoad>;
    settings?: Record<string, any>;
    lang?: string;
}

function depsFor(options: LearnOptions) {
    const runDoor = jest.fn();
    const openUrl = jest.fn();
    const catalog = parsed(options.raw ?? learnRoomCatalog());
    const deps: LearnRoomDeps = {
        lang: () => options.lang ?? "en",
        refresh: options.load ?? (async () => ({ catalog, freshness: { state: "fresh" } })),
        images: () => new LearnImages(fakeImages().deps),
        runDoor,
        openUrl,
    };
    return { deps, runDoor, openUrl };
}

/** The room on its own: shown, with its catalog drawn. */
export async function mountLearn(options: LearnOptions = {}) {
    const roomEl = new DomNode();
    const scope = new Scope();
    const settings = options.settings ?? {};
    const plugin = { settings, saveSettings: jest.fn(async () => undefined), manifest: { version: VERSION } };
    const host = { app: { id: "app" }, plugin, leaf: {}, openRoom: jest.fn(), refreshCounts: jest.fn(), scope } as any;
    const { deps, runDoor, openUrl } = depsFor(options);
    const room = new LearnRoom(roomEl as any, host, deps);
    room.shown();
    await flush();
    return { room, roomEl, scope, host, plugin, settings, runDoor, openUrl };
}

const stand = { mount: () => ({ dispose: () => undefined }) };

/** The room inside a whole Community view, on Learn. */
export async function openLearnView(options: LearnOptions = {}) {
    const content = new DomNode();
    const app = { workspace: { requestSaveLayout: jest.fn(), on: () => ({}) } };
    const leaf = new WorkspaceLeaf(app, content);
    const settings = options.settings ?? {};
    const plugin = { settings, saveSettings: jest.fn(async () => undefined), manifest: { version: VERSION } };
    const { deps, runDoor, openUrl } = depsFor(options);
    const view = new CommunityView(leaf as any, plugin as any, { learn: learnRoom(deps), systems: stand, contribute: stand, installed: stand } as any);
    await view.setState({ room: "learn" }, {} as never);
    await view.onOpen();
    await flush();
    return { view, content, plugin, settings, runDoor, openUrl };
}

export const cardOf = (root: DomNode, id: string): DomNode =>
    root.find((el) => el.hasClass("zettelkasten-flow__learn-card") && el.getAttribute("data-tutorial") === id) as DomNode;

/** What the nav shows beside Learn. */
export const learnCount = (content: DomNode): string =>
    (content.find((el) => el.hasClass("zettelkasten-flow__community-nav-tab") && el.getAttribute("data-room") === "learn") as DomNode).oneByClass("community-nav-count").textContent;

/** Focus somewhere: the body, or a text field. */
export function focusOn(el: unknown): void {
    (globalThis as any).activeDocument = { activeElement: el };
}
