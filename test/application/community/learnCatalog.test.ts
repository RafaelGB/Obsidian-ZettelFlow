/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// The other rooms are not what these tests are about: each is an empty stand-in. Learn is real.
jest.mock("application/community/view/legacyRooms", () => {
    const room = { mount: () => ({ dispose: () => undefined }) };
    return { LEGACY_ROOMS: { contribute: room, installed: room } };
});
jest.mock("application/community/view/systemsRoom", () => ({ SYSTEMS_ROOM: { mount: () => ({ dispose: () => undefined }) } }));

import { readFileSync } from "fs";
import { join } from "path";
import { WorkspaceLeaf, __setLanguage, __setRequest } from "obsidian";
import { __resetLocal, ObsidianApi } from "architecture";
import { DomNode, flush } from "../../support/dashboardDom";
import { learnCatalog, trackIds, tutorial } from "../../support/learnFixtures";
import { parseLearnCatalog, tutorialsInTracks, type LearnCatalog } from "application/community/learn/learnCatalog";
import {
    LEARN_STORAGE_KEY,
    forgetLearnSession,
    markSeen,
    newIds,
    readSaved,
    refresh,
    seenIds,
} from "application/community/learn/learnSource";
import { CommunityView } from "application/community/view/CommunityView";

const VERSION = "3.7.0";
const CATALOG_URL = "https://raw.githubusercontent.com/RafaelGB/Obsidian-ZettelFlow/refs/heads/main/docs/learn/catalog.json";

function ok(raw: unknown): LearnCatalog {
    const parsed = parseLearnCatalog(raw, { pluginVersion: VERSION });
    if (parsed.status !== "ok") throw new Error(`not ok: ${parsed.status}`);
    return parsed.catalog;
}

/** The network: every URL asked for, answered by `answer` (a catalog, an error, nonsense). */
function network(answer: () => unknown) {
    const asked: string[] = [];
    __setRequest(async (opts: any) => {
        asked.push(opts.url);
        const value = answer();
        if (value instanceof Error) throw value;
        return typeof value === "string" ? value : JSON.stringify(value);
    });
    return { asked, catalogCalls: () => asked.filter((url) => url === CATALOG_URL).length };
}

/** A visit that already happened: what local storage holds after it. */
function savedVisit(catalog: unknown, fetchedAt = 1_700_000_000_000, seen: string[] = trackIds(catalog as any)) {
    ObsidianApi.saveLocal(LEARN_STORAGE_KEY, { catalog, fetchedAt, seen });
}

beforeEach(() => {
    __resetLocal();
    forgetLearnSession();
    __setLanguage("en");
});

afterEach(() => {
    __setRequest(null);
    __setLanguage("en");
});

describe("reading the fetched catalog leniently (#801 FR-10, FR-11)", () => {
    it("keeps what is valid and drops only what is not", () => {
        const raw = learnCatalog();
        delete raw.tutorials.think.title;
        raw.reference.push({ name: { en: "Broken" } });
        raw.faq.push({ q: { en: "No answer" } });
        const catalog = ok(raw);
        expect(trackIds(catalog)).toEqual(["get-started", "undo"]);
        expect(catalog.tracks.map((track) => track.id)).toEqual(["start"]);
        expect(Object.keys(catalog.tutorials)).toEqual(["get-started", "undo"]);
        expect(catalog.reference).toHaveLength(1);
        expect(catalog.faq).toHaveLength(1);
        // A related id that is not there is dropped; the rest is kept.
        expect(catalog.tutorials.undo.related).toEqual(["get-started"]);
    });

    it("hides a tutorial newer than the plugin from tracks and from the count (AC-7)", () => {
        const raw = learnCatalog();
        raw.tutorials.undo.since = "9.0.0";
        const catalog = ok(raw);
        expect(trackIds(catalog)).toEqual(["get-started", "think"]);
        expect(catalog.tutorials.undo).toBeUndefined();
        expect(tutorialsInTracks(catalog)).toHaveLength(2);
    });

    it("does not read a newer major schema, nor something that is not a catalog", () => {
        const raw = learnCatalog();
        raw.schema.major = 2;
        expect(parseLearnCatalog(raw, { pluginVersion: VERSION })).toEqual({ status: "newer-major" });
        expect(parseLearnCatalog("nonsense", { pluginVersion: VERSION })).toEqual({ status: "invalid" });
        expect(parseLearnCatalog({ tracks: [] }, { pluginVersion: VERSION })).toEqual({ status: "invalid" });
    });

    it("lets one language stand in for a missing other", () => {
        const raw = learnCatalog();
        raw.tutorials.undo.summary = { en: "Only English" };
        expect(ok(raw).tutorials.undo.summary).toEqual({ en: "Only English", es: "Only English" });
    });
});

describe("the catalog's source: once a session, a saved copy otherwise (#801 FR-6–FR-9, FR-12)", () => {
    it("asks the network once a session", async () => {
        const net = network(() => learnCatalog());
        const first = await refresh(VERSION);
        await refresh(VERSION);
        expect(net.catalogCalls()).toBe(1);
        expect(first.freshness).toEqual({ state: "fresh" });
        expect(trackIds(first.catalog as LearnCatalog)).toEqual(["get-started", "undo", "think"]);
    });

    it("saves the copy, when it was fetched and what was seen — in local storage only", async () => {
        network(() => learnCatalog());
        await refresh(VERSION, { fetch: async () => learnCatalog(), now: () => 42 });
        const stored = ObsidianApi.loadLocal(LEARN_STORAGE_KEY) as any;
        expect(stored.fetchedAt).toBe(42);
        expect(stored.catalog.schema).toEqual({ major: 1, minor: 0 });
        expect(readSaved(VERSION)?.fetchedAt).toBe(42);
    });

    it("on a first visit, nothing is New (AC-8)", async () => {
        network(() => learnCatalog());
        const { catalog } = await refresh(VERSION);
        expect([...newIds(catalog as LearnCatalog, seenIds())]).toEqual([]);
    });

    it("on a later visit, exactly the tutorial added since is New, until it is opened (AC-8)", async () => {
        savedVisit(learnCatalog());
        const later = learnCatalog();
        later.tutorials.collision = tutorial("Two things far apart");
        later.tracks[1].tutorials.push("collision");
        network(() => later);
        const { catalog } = await refresh(VERSION);
        expect([...newIds(catalog as LearnCatalog, seenIds())]).toEqual(["collision"]);
        markSeen("collision");
        expect([...newIds(catalog as LearnCatalog, seenIds())]).toEqual([]);
    });

    it("offline, keeps the saved copy and says when it was saved (AC-5)", async () => {
        savedVisit(learnCatalog(), 1234);
        network(() => new Error("net::ERR_INTERNET_DISCONNECTED"));
        const load = await refresh(VERSION);
        expect(load.freshness).toEqual({ state: "offline", savedAt: 1234 });
        expect(trackIds(load.catalog as LearnCatalog)).toEqual(["get-started", "undo", "think"]);
    });

    it("treats nonsense from the network as offline", async () => {
        savedVisit(learnCatalog(), 1234);
        network(() => "<html>rate limited</html>");
        expect((await refresh(VERSION)).freshness).toEqual({ state: "offline", savedAt: 1234 });
    });

    it("with no copy and no network, has nothing — and says so (AC-5)", async () => {
        network(() => new Error("offline"));
        expect(await refresh(VERSION)).toEqual({ catalog: null, freshness: { state: "empty" } });
    });

    it("keeps the saved copy when the catalog is for a newer plugin (AC-5)", async () => {
        savedVisit(learnCatalog(), 1234);
        const newer = learnCatalog();
        newer.schema.major = 2;
        network(() => newer);
        const load = await refresh(VERSION);
        expect(load.freshness).toEqual({ state: "update-needed" });
        expect(trackIds(load.catalog as LearnCatalog)).toEqual(["get-started", "undo", "think"]);
        expect((ObsidianApi.loadLocal(LEARN_STORAGE_KEY) as any).fetchedAt).toBe(1234);
    });

    it("still answers when the copy cannot be saved", async () => {
        const save = jest.spyOn(ObsidianApi, "saveLocal").mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });
        try {
            network(() => learnCatalog());
            expect((await refresh(VERSION)).freshness).toEqual({ state: "fresh" });
        } finally {
            save.mockRestore();
        }
    });

    it("never raises a toast: the room says it inline", () => {
        for (const file of ["learn/learnSource.ts", "view/learnRoom.ts", "learn/learnImages.ts"]) {
            const text = readFileSync(join(__dirname, "..", "..", "..", "src", "application", "community", file), "utf8");
            expect(text).not.toMatch(/\bNotice\b/);
        }
    });
});

// ── the room, inside the view ───────────────────────────────────────────────

async function openView(state: Record<string, unknown>) {
    const content = new DomNode();
    const app = { workspace: { requestSaveLayout: jest.fn(), on: () => ({}) } };
    const leaf = new WorkspaceLeaf(app, content);
    const settings: Record<string, unknown> = { communitySettings: {} };
    const plugin = { settings, saveSettings: jest.fn(async () => undefined), manifest: { version: VERSION } };
    const view = new CommunityView(leaf as any, plugin as any);
    await view.setState(state, {} as never);
    await view.onOpen();
    await flush();
    return { view, content, plugin, settings };
}

const learnEl = (content: DomNode) => content.byClass("community-room").find((room) => room.getAttribute("data-room") === "learn") as DomNode;
const titles = (content: DomNode) => learnEl(content).byClass("learn-tutorial-title").map((el) => el.textContent);
const line = (content: DomNode) => learnEl(content).oneByClass("learn-line");

describe("the Learn room fetches only when shown (#801 AC-4, FR-6, FR-7)", () => {
    it("opening Community on Systems asks for no catalog, and Learn asks once", async () => {
        const net = network(() => learnCatalog());
        const { view, content, plugin, settings } = await openView({ room: "systems" });
        expect(net.catalogCalls()).toBe(0);
        expect(titles(content)).toEqual([]);
        await view.setState({ room: "learn" }, {} as never);
        await flush();
        expect(net.catalogCalls()).toBe(1);
        expect(titles(content)).toEqual(["Get started", "Undo what a flow wrote", "Think before it is knowledge"]);
        await view.setState({ room: "systems" }, {} as never);
        await view.setState({ room: "learn" }, {} as never);
        await flush();
        expect(net.catalogCalls()).toBe(1);
        // Nothing reaches data.json: no save, no new key.
        expect(plugin.saveSettings).not.toHaveBeenCalled();
        expect(Object.keys(settings)).toEqual(["communitySettings"]);
        await view.onClose();
    });

    it("renders the saved copy offline, and names the day it was saved (AC-5)", async () => {
        savedVisit(learnCatalog());
        network(() => new Error("offline"));
        const { content } = await openView({ room: "learn" });
        expect(titles(content)).toHaveLength(3);
        expect(line(content).textContent).toMatch(/^Offline: you are seeing the copy saved on .+\.$/);
    });

    it("with no copy and no network, shows the empty state and the docs site (AC-5)", async () => {
        network(() => new Error("offline"));
        const { content } = await openView({ room: "learn" });
        expect(titles(content)).toEqual([]);
        expect(line(content).byText("Learn needs a connection the first time.")).toBeDefined();
        const link = line(content).byClass("learn-docs-link")[0] as any;
        expect(link.text).toBe("Open the docs site");
        expect(link.href).toBe("https://rafaelgb.github.io/Obsidian-ZettelFlow/");
    });

    it("keeps the copy and asks for an update when the catalog is for a newer plugin (AC-5)", async () => {
        savedVisit(learnCatalog());
        const newer = learnCatalog();
        newer.schema.major = 2;
        network(() => newer);
        const { content } = await openView({ room: "learn" });
        expect(titles(content)).toHaveLength(3);
        expect(line(content).textContent).toBe("Update ZettelFlow to see the latest tutorials.");
    });

    it("leaves out a tutorial about a newer plugin (AC-7)", async () => {
        const raw = learnCatalog();
        raw.tutorials.undo.since = "9.0.0";
        network(() => raw);
        const { content } = await openView({ room: "learn" });
        expect(titles(content)).toEqual(["Get started", "Think before it is knowledge"]);
    });

    it("badges the one tutorial added since the last visit, until it is opened (AC-8)", async () => {
        savedVisit(learnCatalog());
        const later = learnCatalog();
        later.tutorials.collision = tutorial("Two things far apart");
        later.tracks[1].tutorials.push("collision");
        network(() => later);
        const { content } = await openView({ room: "learn" });
        const badges = () => learnEl(content).byClass("learn-new");
        expect(badges()).toHaveLength(1);
        expect(badges()[0].parent?.getAttribute("data-tutorial")).toBe("collision");
        badges()[0].parent?.click();
        expect(badges()).toHaveLength(0);
        expect(seenIds()).toContain("collision");
    });

    it("speaks Spanish when Obsidian does, and English otherwise (AC-9)", async () => {
        network(() => learnCatalog());
        __setLanguage("es");
        const es = await openView({ room: "learn" });
        expect(learnEl(es.content).byClass("learn-track-title")[0].textContent).toBe("Empieza aquí");
        expect(titles(es.content)[0]).toBe("Empieza");
        __setLanguage("fr");
        const fr = await openView({ room: "learn" });
        expect(learnEl(fr.content).byClass("learn-track-title")[0].textContent).toBe("Start here");
    });
});
