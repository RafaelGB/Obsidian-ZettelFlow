/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { __resetLocal } from "architecture";
import { DomNode, flush } from "../../support/dashboardDom";
import { learnCatalog } from "../../support/learnFixtures";
import { parseLearnCatalog, type LearnCatalog } from "application/community/learn/learnCatalog";
import { forgetLearnSession, type LearnLoad } from "application/community/learn/learnSource";
import { LearnImages, type LearnImageDeps } from "application/community/learn/learnImages";
import { LearnRoom } from "application/community/view/learnRoom";

/**
 * **The catalog is untrusted data** (#801 FR-10, AC-6). It comes from the network, so nothing in it
 * can become markup, a link off the docs site, a request off `docs/resources/`, or a button for a
 * capability this plugin does not have.
 */
const VERSION = "3.7.0";
const HOSTILE = "<img src=x onerror=alert(1)>";

function hostile(): any {
    const raw = learnCatalog();
    raw.tutorials.undo.steps[0].body = { en: HOSTILE, es: HOSTILE };
    raw.tutorials.undo.title = { en: `<b>${HOSTILE}</b>`, es: HOSTILE };
    raw.tutorials.undo.doc = "https://evil";
    raw.tutorials.undo.steps[1].image = "../x.svg";
    raw.tutorials.undo.steps[2].image = "https://x/y.svg";
    raw.tutorials.undo.tryIt = { capability: "launch-rockets", label: { en: "Launch", es: "Lanzar" } };
    raw.tutorials.think.steps[0].image = "docs/resources/undo/undo.svg";
    return raw;
}

function parsed(raw: unknown): LearnCatalog {
    const result = parseLearnCatalog(raw, { pluginVersion: VERSION });
    if (result.status !== "ok") throw new Error(result.status);
    return result.catalog;
}

function imageDeps() {
    const fetched: string[] = [];
    const revoked: string[] = [];
    const deps: LearnImageDeps = {
        fetch: async (url) => {
            fetched.push(url);
            return { bytes: new ArrayBuffer(4), contentType: "text/plain" };
        },
        toUrl: () => `blob:${fetched.length}`,
        revoke: (url) => revoked.push(url),
    };
    return { deps, fetched, revoked };
}

async function mountRoom(raw: unknown, images: LearnImageDeps) {
    const roomEl = new DomNode();
    const load: LearnLoad = { catalog: parsed(raw), freshness: { state: "fresh" } };
    const host = { plugin: { manifest: { version: VERSION } } } as any;
    const room = new LearnRoom(roomEl as any, host, { lang: () => "en", refresh: async () => load, images: () => new LearnImages(images) });
    room.shown();
    await flush();
    return { room, roomEl };
}

const head = (roomEl: DomNode, id: string) => roomEl.find((el) => el.getAttribute("data-tutorial") === id) as DomNode;

beforeEach(() => {
    __resetLocal();
    forgetLearnSession();
});

describe("the catalog is read as untrusted (#801 AC-6)", () => {
    it("drops a try-it for a capability that does not resolve here, and keeps the tutorial", () => {
        const catalog = parsed(hostile());
        expect(catalog.tutorials.undo).toBeDefined();
        expect(catalog.tutorials.undo.tryIt).toBeUndefined();
        expect(catalog.tutorials["get-started"].tryIt?.capability).toBe("home");
    });

    it("keeps no doc that is not a docs page, and no image off docs/resources/", () => {
        const { undo } = parsed(hostile()).tutorials;
        expect(undo.doc).toBeUndefined();
        expect(undo.steps.map((step) => step.image)).toEqual([undefined, undefined, undefined]);
    });

    it("shows markup as literal text, never as elements", async () => {
        const { deps } = imageDeps();
        const { roomEl } = await mountRoom(hostile(), deps);
        head(roomEl, "undo").click();
        expect(roomEl.byClass("learn-step-body")[0].textContent).toBe(HOSTILE);
        expect(head(roomEl, "undo").byClass("learn-tutorial-title")[0].textContent).toBe(`<b>${HOSTILE}</b>`);
        expect(roomEl.find((el) => el.tag === "img" || el.tag === "b")).toBeUndefined();
    });

    it("draws no Read the full page link for a doc off the docs site", async () => {
        const { deps } = imageDeps();
        const { roomEl } = await mountRoom(hostile(), deps);
        head(roomEl, "undo").click();
        head(roomEl, "get-started").click();
        const links = roomEl.byClass("learn-docs-link").map((el: any) => el.href);
        expect(links).toEqual(["https://rafaelgb.github.io/Obsidian-ZettelFlow/architecture/reversibility/"]);
    });

    it("never requests an image off docs/resources/, and draws one that is on it from a blob", async () => {
        const { deps, fetched, revoked } = imageDeps();
        const { room, roomEl } = await mountRoom(hostile(), deps);
        head(roomEl, "undo").click();
        await flush();
        expect(fetched).toEqual([]);
        head(roomEl, "think").click();
        await flush();
        expect(fetched).toEqual(["https://raw.githubusercontent.com/RafaelGB/Obsidian-ZettelFlow/refs/heads/main/docs/resources/undo/undo.svg"]);
        const img = roomEl.find((el) => el.tag === "img") as DomNode;
        expect(img.getAttribute("src")).toBe("blob:1");
        room.dispose();
        await flush();
        expect(revoked).toEqual(["blob:1"]);
    });

    it("types a fetched SVG as an image, whatever GitHub raw calls it", async () => {
        const blobs: Blob[] = [];
        const images = new LearnImages({
            fetch: async () => ({ bytes: new ArrayBuffer(1), contentType: "text/plain; charset=utf-8" }),
            toUrl: (blob) => {
                blobs.push(blob);
                return "blob:x";
            },
            revoke: jest.fn(),
        });
        expect(await images.url("docs/resources/undo/undo.svg")).toBe("blob:x");
        expect(blobs[0].type).toBe("image/svg+xml");
        expect(await images.url("../x.svg")).toBeNull();
    });

    it("leaves a quiet empty frame when an image cannot load", async () => {
        const images = new LearnImages({
            fetch: async () => {
                throw new Error("404");
            },
            toUrl: () => "blob:never",
            revoke: jest.fn(),
        });
        const parent = new DomNode();
        const frame = images.frame(parent as any, "docs/resources/undo/undo.svg", "Undo") as any;
        await flush();
        expect(frame.hasClass("is-empty")).toBe(true);
        expect(frame.find((el: DomNode) => el.tag === "img")).toBeUndefined();
    });
});
