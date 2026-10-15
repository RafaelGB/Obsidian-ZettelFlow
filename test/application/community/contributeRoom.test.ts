/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import * as obsidian from "obsidian";
import type { TFile } from "obsidian";
import { bugReportFields, DISCUSSIONS_URL, newIssueUrl, MAX_PREFILL_URL } from "application/community/githubContribute";
import { CONTRIBUTE_TUTORIAL, contributeRoom, type ContributeRoom } from "application/community/view/contributeRoom";
import { shareFlow } from "application/community/shareSystem";
import { DomNode, settle } from "../../support/dashboardDom";
import { wireHarness, type FakeVault } from "../../support/harness";
import { branching } from "../../support/systemsFixtures";

const noticeSpy = jest.spyOn(obsidian, "Notice");

function addCanvas(vault: FakeVault, path: string, content: string): TFile {
    const file = vault.add(path, { body: content });
    file.extension = "canvas";
    file.name = path.split("/").pop() ?? path;
    file.basename = file.name.replace(/\.canvas$/, "");
    return file;
}

interface Mounted {
    room: ContributeRoom;
    roomEl: DomNode;
    opened: string[];
    downloads: { name: string; json: string }[];
    openRoom: jest.Mock<(room: string, then?: () => void, state?: Record<string, unknown>) => void>;
    focus(path: string | null): void;
    plugin: any;
}

async function mount(options: { focused?: string | null; ribbon?: string; files?: (vault: FakeVault) => void; catalog?: () => Promise<unknown> } = {}): Promise<Mounted> {
    const harness = wireHarness({ settings: { ribbonCanvas: options.ribbon } });
    options.files?.(harness.vault);
    let focused = options.focused ?? null;
    const opened: string[] = [];
    const downloads: { name: string; json: string }[] = [];
    const openRoom = jest.fn((_room: string, _then?: () => void, _state?: Record<string, unknown>) => undefined);
    const host = { app: harness.app, plugin: harness.plugin, leaf: {}, openRoom, lastCanvas: () => focused };
    const roomEl = new DomNode("section");
    const room = contributeRoom({
        open: (url) => opened.push(url),
        download: (name, json) => downloads.push({ name, json }),
        learnCatalog: (options.catalog ?? (async () => ({ tutorials: { [CONTRIBUTE_TUTORIAL]: { id: CONTRIBUTE_TUTORIAL } } }))) as never,
    }).mount(roomEl as never, host as never) as ContributeRoom;
    await settle(() => roomEl.byClass("contribute-preview-steps").length > 0 || roomEl.byClass("contribute-status")[0]?.text !== "", 20);
    return { room, roomEl, opened, downloads, openRoom, focus: (path) => (focused = path), plugin: harness.plugin };
}

const ZK = branching().canvas.content;
const withZettelkasten = (vault: FakeVault) => addCanvas(vault, "Flows/Zettelkasten v2.canvas", ZK);
const button = (roomEl: DomNode, text: string) => roomEl.find((el) => el.tag === "button" && el.text === text)!;

describe("the Contribute room (#803)", () => {
    beforeEach(() => noticeSpy.mockClear());

    it("says everything goes through GitHub (FR-1)", async () => {
        const { roomEl } = await mount();
        expect(roomEl.oneByClass("contribute-lede").text).toBe("Everything goes through GitHub. Nothing leaves your vault until you publish it yourself.");
    });

    it("previews the focused canvas: its drawing, its name, 4 steps · 1 branch point (AC-1, FR-2)", async () => {
        const { roomEl, room } = await mount({ focused: "Flows/Zettelkasten v2.canvas", ribbon: "Old/flow.canvas", files: withZettelkasten });
        expect(room.sharing).toBe("Flows/Zettelkasten v2.canvas");
        const lead = roomEl.byClass("contribute-card").find((card) => card.hasClass("is-lead"))!;
        expect(lead.oneByClass("contribute-preview-name").text).toBe("Zettelkasten v2.canvas");
        expect(lead.oneByClass("contribute-preview-steps").text).toBe("4 steps · 1 branch point");
        expect(lead.byClass("system-drawing")).toHaveLength(1);
        expect(lead.oneByClass("contribute-fine").text).toBe("Steps, exits and inline boxes travel with it. Your notes don't.");
        expect(lead.oneByClass("contribute-share").disabled).toBe(false);
    });

    it("falls back to the creation flow, and follows a newly focused canvas", async () => {
        const mounted = await mount({
            ribbon: "Flows/Zettelkasten v2.canvas",
            files: (vault) => {
                withZettelkasten(vault);
                addCanvas(vault, "Mine/Other.canvas", JSON.stringify({ nodes: [], edges: [] }));
            },
        });
        expect(mounted.room.sharing).toBe("Flows/Zettelkasten v2.canvas");
        mounted.focus("Mine/Other.canvas");
        mounted.room.canvasChanged();
        await settle(() => mounted.roomEl.byClass("contribute-preview-name")[0]?.text === "Other.canvas", 20);
        expect(mounted.room.sharing).toBe("Mine/Other.canvas");
    });

    it("with no canvas, says so and disables the button — and no toast (AC-1, FR-3)", async () => {
        const { roomEl } = await mount();
        const share = roomEl.oneByClass("contribute-share");
        expect(share.disabled).toBe(true);
        expect(roomEl.oneByClass("contribute-status").text).toBe("Open a canvas to share it.");
        expect(roomEl.oneByClass("contribute-preview").hasClass("is-hidden")).toBe(true);
        share.click();
        expect(noticeSpy).not.toHaveBeenCalled();
    });

    it("*Prepare the system* runs today's share flow (AC-2)", async () => {
        const { roomEl, opened, downloads } = await mount({ focused: "Flows/Zettelkasten v2.canvas", files: withZettelkasten });
        button(roomEl, "Prepare the system").click();
        await settle(() => opened.length > 0, 20);
        expect(downloads).toEqual([]);
        expect(opened).toHaveLength(1);
        const url = new URL(opened[0]);
        expect(url.searchParams.get("template")).toBe("ADD_TEMPLATE.yaml");
        expect(JSON.parse(url.searchParams.get("json-template")!).canvas).toEqual({ filename: "Zettelkasten v2.canvas", content: ZK });
    });

    it("downloads a system too large to prefill, says so inline, and opens the form", async () => {
        const huge = JSON.stringify({ nodes: [{ id: "a", type: "text", text: "x".repeat(MAX_PREFILL_URL), x: 0, y: 0 }], edges: [] });
        const { roomEl, opened, downloads } = await mount({ focused: "Flows/Huge.canvas", files: (vault) => addCanvas(vault, "Flows/Huge.canvas", huge) });
        button(roomEl, "Prepare the system").click();
        await settle(() => opened.length > 0, 20);
        expect(downloads.map((d) => d.name)).toEqual(["Huge"]);
        expect(opened).toEqual([(shareFlow({ name: "Huge", json: downloads[0].json }) as { open: string }).open]);
        expect(roomEl.oneByClass("contribute-status").text).toBe("Your system was downloaded as a .zftemplate file — paste its contents into the form.");
        expect(noticeSpy).not.toHaveBeenCalled();
    });

    it("shows the bug report's environment before you press it, and opens it with exactly that (AC-3, FR-5)", async () => {
        const { roomEl, opened, plugin } = await mount();
        const fields = bugReportFields(plugin);
        const shown = Object.fromEntries(roomEl.byClass("contribute-env-list")[0].findAll((el) => el.tag === "dd").map((dd) => [dd.getAttribute("data-field"), dd.text]));
        expect(shown).toEqual(fields);
        button(roomEl, "Report it").click();
        expect(opened).toEqual([newIssueUrl("bug_report.yaml", fields)]);
    });

    it("opens the idea form and Discussions (FR-4, FR-6)", async () => {
        const { roomEl, opened } = await mount();
        button(roomEl, "Open the form").click();
        button(roomEl, "Open Discussions").click();
        expect(opened).toEqual([newIssueUrl("feature_request.yaml"), DISCUSSIONS_URL]);
    });

    it("*How to contribute well* pans to Learn and hands it the tutorial (AC-4, FR-7)", async () => {
        const { roomEl, openRoom, opened } = await mount();
        button(roomEl, "Open the tutorial").click();
        await settle(() => openRoom.mock.calls.length > 0, 20);
        expect(openRoom).toHaveBeenCalledWith("learn", undefined, { tutorial: "contribute-a-system" });
        expect(opened).toEqual([]);
    });

    it("opens the contributing docs when the catalog has no such tutorial, or none at all (AC-4)", async () => {
        for (const catalog of [async () => ({ tutorials: {} }), async () => null, async () => Promise.reject(new Error("offline"))]) {
            const { roomEl, openRoom, opened } = await mount({ catalog });
            button(roomEl, "Open the tutorial").click();
            await settle(() => opened.length > 0, 20);
            expect(openRoom).not.toHaveBeenCalled();
            expect(opened).toEqual(["https://rafaelgb.github.io/Obsidian-ZettelFlow/how-to-contribute/systems-gallery/"]);
        }
    });

    it("gives every card a Lucide icon and no emoji (FR-8, AC-11)", async () => {
        const { roomEl } = await mount();
        expect(roomEl.byClass("contribute-icon").map((icon) => icon.getAttribute("data-icon"))).toEqual(["share-2", "lightbulb", "bug", "messages-square", "graduation-cap"]);
        expect(/\p{Extended_Pictographic}/u.test(roomEl.textContent)).toBe(false);
        const source = readFileSync(join(__dirname, "..", "..", "..", "src", "application", "community", "view", "contributeRoom.ts"), "utf8");
        expect(/\p{Extended_Pictographic}/u.test(source)).toBe(false);
    });
});
