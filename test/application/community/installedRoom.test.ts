/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, it, expect, jest } from "@jest/globals";

// The loose pieces' editors bring the whole step editor with them: here they only say they opened.
const editors: { kind: string; id: string; done: (value: unknown, removed: boolean) => void }[] = [];
jest.mock("zettelkasten/modals/InstalledStepEditorModal", () => ({
    InstalledStepEditorModal: class {
        constructor(_plugin: unknown, step: { id: string }, done: (value: unknown, removed: boolean) => void) {
            editors.push({ kind: "step", id: step.id, done });
        }
        open(): void { }
    },
}));
jest.mock("zettelkasten/modals/InstalledActionEditorModal", () => ({
    InstalledActionEditorModal: class {
        constructor(_plugin: unknown, action: { id: string }, done: (value: unknown, removed: boolean) => void) {
            editors.push({ kind: "action", id: action.id, done });
        }
        open(): void { }
    },
}));

import { __setRequest, __setRequestUrl } from "obsidian";
import { replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { installSystem } from "application/community/installSystem";
import type { InstalledSystem } from "application/community/installRecord";
import { INSTALLED_ROOM, removedLine, type InstalledRoom } from "application/community/view/installedRoom";
import { DomNode, flush, settle } from "../../support/dashboardDom";
import { wireHarness } from "../../support/harness";
import { branching, scripted } from "../../support/systemsFixtures";

/** Obsidian's global `createDiv`: a detached element, as the result line is built. */
(globalThis as any).createDiv = (options: unknown) => new DomNode().createDiv(options);

const step = (id: string, title: string) => ({ id, title, description: `${title} described`, author: "ZettelFlow", template_type: "step", label: title });
const action = (id: string, title: string) => ({ id, title, description: `${title} described`, author: "ZettelFlow", template_type: "action", type: "prompt" });

interface Mounted {
    room: InstalledRoom;
    roomEl: DomNode;
    harness: ReturnType<typeof wireHarness>;
    openRoom: jest.Mock<(room: string) => void>;
    saves: jest.Mock<() => Promise<void>>;
    leaf: { openFile: jest.Mock<(file: unknown) => Promise<void>> };
    vaultCalls: string[];
    network: number;
}

async function mount(options: { systems?: boolean; pieces?: boolean; clipboard?: unknown } = {}): Promise<Mounted> {
    const harness = wireHarness({
        settings: {
            ribbonCanvas: "Old/flow.canvas",
            installedTemplates: {
                steps: options.pieces === false ? {} : { "new-task": step("new-task", "New task") },
                actions: options.pieces === false ? {} : { "add-contact": action("add-contact", "Add contact") },
            },
            communitySettings: options.clipboard ? { clipboardTemplate: options.clipboard } : {},
        },
    });
    if (options.systems !== false) {
        for (const [template, folder, role, at] of [
            [scripted("Concept note"), "Flows/Concept note", "none", 1_000],
            [branching("Zettelkasten v2"), "Flows/Zettelkasten v2", "create", 2_000],
        ] as const) {
            const outcome = await installSystem(harness.plugin as never, template, `/docs/systems/${template.name}.zftemplate`, { role, targetFolder: folder });
            if (outcome.kind !== "installed") throw new Error(outcome.kind);
            const list = harness.settings.installedSystems as InstalledSystem[];
            // The uuid stub hands every install the same id; a vault never would.
            Object.assign(list[list.length - 1], { at, id: `install-${at}` });
        }
    }
    const saves = jest.fn(async () => undefined);
    (harness.plugin as any).saveSettings = saves;
    // The canvases are canvases, as Obsidian names them.
    for (const entry of harness.vault.entries.values()) {
        if (!entry.file.path.endsWith(".canvas")) continue;
        entry.file.extension = "canvas";
        entry.file.basename = entry.file.name.replace(/\.canvas$/, "");
    }
    const vaultCalls: string[] = [];
    const vault = harness.vault as any;
    for (const name of ["read", "cachedRead", "create", "modify", "createFolder", "process"]) {
        const original = vault[name].bind(vault);
        vault[name] = (...args: any[]) => {
            vaultCalls.push(`${name}:${typeof args[0] === "string" ? args[0] : args[0]?.path}`);
            return original(...args);
        };
    }
    let network = 0;
    __setRequest(async () => {
        network++;
        return "";
    });
    __setRequestUrl(async () => {
        network++;
        return { status: 200, text: "", json: {}, arrayBuffer: new ArrayBuffer(0), headers: {} } as never;
    });
    const openRoom = jest.fn((_room: string) => undefined);
    const leaf = { openFile: jest.fn(async (_file: unknown) => undefined) };
    const community = new DomNode("div");
    community.addClass("zettelkasten-flow__community");
    const roomEl = community.createEl("section", { cls: "zettelkasten-flow__community-room" }) as DomNode;
    const host = { app: harness.app, plugin: harness.plugin, leaf, openRoom, refreshCounts: () => undefined };
    const room = INSTALLED_ROOM.mount(roomEl as never, host as never) as InstalledRoom;
    await settle(() => roomEl.byClass("installed-row").every((row) => row.hasClass("is-missing") || row.byClass("system-drawing").length > 0), 50);
    return { room, roomEl, harness, openRoom, saves, leaf, vaultCalls, network: 0, get networkCalls() { return network; } } as Mounted & { networkCalls: number };
}

const rows = (roomEl: DomNode) => roomEl.byClass("installed-row");
const buttonIn = (el: DomNode, text: string) => el.find((node) => node.tag === "button" && node.text === text);
const snapshot = (harness: ReturnType<typeof wireHarness>) => JSON.stringify([...harness.vault.entries.entries()].map(([path, entry]) => [path, entry.content]));

describe("the Installed room's systems (#803 AC-5, FR-9)", () => {
    beforeEach(() => {
        replaceBufferedWrites([]);
        editors.length = 0;
    });

    it("lists every recorded install, newest first, with date, folder and role", async () => {
        const { roomEl } = await mount();
        expect(rows(roomEl).map((row) => row.oneByClass("installed-name").text)).toEqual(["Zettelkasten v2", "Concept note"]);
        // moment is a stub under jest: the date reads "Sep".
        expect(rows(roomEl).map((row) => row.oneByClass("installed-meta").text)).toEqual([
            "Installed Sep · Flows/Zettelkasten v2 · Creates notes",
            "Installed Sep · Flows/Concept note · Just the files",
        ]);
    });

    it("draws each canvas as it is in the vault, read locally, with no network", async () => {
        const mounted = (await mount()) as Mounted & { networkCalls: number };
        expect(rows(mounted.roomEl).map((row) => row.byClass("system-drawing").length)).toEqual([1, 1]);
        expect(mounted.vaultCalls.filter((call) => call.startsWith("cachedRead:")).sort()).toEqual([
            "cachedRead:Flows/Concept note/Concept note.canvas",
            "cachedRead:Flows/Zettelkasten v2/Zettelkasten v2.canvas",
        ]);
        expect(mounted.vaultCalls.filter((call) => !call.startsWith("cachedRead:"))).toEqual([]);
        expect(mounted.networkCalls).toBe(0);
    });

    it("shows *Canvas not found* and *Forget it* for a canvas you deleted, and forgetting writes nothing (AC-8)", async () => {
        const mounted = await mount();
        mounted.harness.vault.entries.delete("Flows/Concept note/Concept note.canvas");
        mounted.room.render();
        await flush();
        const row = rows(mounted.roomEl).find((one) => one.oneByClass("installed-name").text === "Concept note")!;
        expect(row.hasClass("is-missing")).toBe(true);
        expect(row.oneByClass("installed-thumb").text.length + row.oneByClass("installed-thumb-missing").text.length).toBeGreaterThan(0);
        expect(row.oneByClass("installed-thumb-missing").text).toBe("Canvas not found");
        expect(buttonIn(row, "Open canvas")).toBeUndefined();
        expect(buttonIn(row, "Remove")).toBeUndefined();
        const before = snapshot(mounted.harness);
        mounted.vaultCalls.length = 0;
        buttonIn(row, "Forget it")!.click();
        await settle(() => rows(mounted.roomEl).length === 1);
        expect(snapshot(mounted.harness)).toBe(before);
        expect(mounted.vaultCalls.filter((call) => !call.startsWith("cachedRead:"))).toEqual([]);
        expect((mounted.harness.settings.installedSystems as InstalledSystem[]).map((r) => r.name)).toEqual(["Zettelkasten v2"]);
        expect(mounted.saves).toHaveBeenCalledTimes(1);
    });

    it("asks once before removing: one press writes nothing, panning away disarms it (FR-11)", async () => {
        const mounted = await mount();
        const row = rows(mounted.roomEl)[1];
        const remove = buttonIn(row, "Remove")!;
        const before = snapshot(mounted.harness);
        remove.click();
        await settle(() => remove.text !== "Remove", 20);
        expect(remove.text).toBe("Remove 2 files");
        expect(remove.hasClass("mod-warning")).toBe(true);
        expect(snapshot(mounted.harness)).toBe(before);
        expect(mounted.saves).not.toHaveBeenCalled();
        mounted.room.hidden();
        expect(remove.text).toBe("Remove");
        expect(snapshot(mounted.harness)).toBe(before);
    });

    it("removes on the second press, and says what it did where the row was", async () => {
        const mounted = await mount();
        const note = "Flows/Concept note/Weekly focus.md";
        mounted.harness.vault.entries.get(note)!.content += "\nMine";
        const row = rows(mounted.roomEl)[1];
        const remove = buttonIn(row, "Remove")!;
        remove.click();
        await settle(() => remove.text !== "Remove", 20);
        expect(remove.text).toBe("Remove 1 file");
        remove.click();
        await settle(() => mounted.roomEl.byClass("installed-result").length > 0, 50);
        expect(mounted.roomEl.oneByClass("installed-result").text).toBe("Removed 1 file. Kept 1 you changed: Weekly focus.md.");
        expect(rows(mounted.roomEl)).toHaveLength(1);
        expect(mounted.harness.vault.entries.has(note)).toBe(true);
        expect(mounted.harness.vault.entries.has("Flows/Concept note/Concept note.canvas")).toBe(false);
        expect((mounted.harness.settings.installedSystems as InstalledSystem[]).map((r) => r.name)).toEqual(["Zettelkasten v2"]);
        expect(mounted.room.count()).toBe(3);
    });

    it("takes back a second install confirmed while the first is still trashing (found in the live walk)", async () => {
        const mounted = await mount();
        // The system trash can take a second on Windows.
        const fileManager = (mounted.harness.app as any).fileManager;
        const trash = fileManager.trashFile;
        fileManager.trashFile = async (file: unknown) => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            await trash(file);
        };
        for (const row of rows(mounted.roomEl)) {
            const remove = buttonIn(row, "Remove")!;
            remove.click();
            await settle(() => remove.text !== "Remove", 20);
            remove.click();
        }
        await settle(() => (mounted.harness.settings.installedSystems as InstalledSystem[]).length === 0, 200, 3000);
        expect(mounted.harness.settings.installedSystems).toEqual([]);
        await settle(() => mounted.roomEl.byClass("installed-result").length === 2, 200, 3000);
        expect(mounted.roomEl.byClass("installed-result")).toHaveLength(2);
    });

    it("composes the result from two phrases, each counted", () => {
        expect(removedLine({ removed: ["a/x.md", "a/y.md", "a/z.canvas", "a/w.md"], kept: ["a/Permanent.md"], failed: [] })).toBe("Removed 4 files. Kept 1 you changed: Permanent.md.");
        expect(removedLine({ removed: ["a/x.md"], kept: [], failed: [] })).toBe("Removed 1 file.");
        expect(removedLine({ removed: [], kept: ["a/x.md", "b/y.md"], failed: ["c/z.md"] })).toBe("Removed 0 files. Kept 2 you changed: x.md, y.md. Could not take back: z.md.");
    });

    it("opens the canvas in this tab", async () => {
        const mounted = await mount();
        buttonIn(rows(mounted.roomEl)[0], "Open canvas")!.click();
        await settle(() => mounted.leaf.openFile.mock.calls.length > 0, 50);
        expect((mounted.leaf.openFile.mock.calls[0][0] as { path: string }).path).toBe("Flows/Zettelkasten v2/Zettelkasten v2.canvas");
        expect(mounted.room.viewState()).toEqual({ installedHome: (mounted.harness.settings.installedSystems as InstalledSystem[])[1].id });
    });
});

describe("the Installed room's loose pieces (#803 FR-13)", () => {
    beforeEach(() => {
        editors.length = 0;
    });

    it("lists the installed steps and actions, with Edit opening their own editor", async () => {
        const mounted = await mount({ systems: false });
        const pieces = mounted.roomEl.byClass("installed-piece");
        expect(pieces.map((piece) => `${piece.oneByClass("installed-piece-kind").text} ${piece.oneByClass("installed-piece-name").text}`)).toEqual(["Step New task", "Action Add contact"]);
        buttonIn(pieces[0], "Edit")!.click();
        buttonIn(pieces[1], "Edit")!.click();
        await settle(() => editors.length === 2, 50);
        expect(editors.map((editor) => `${editor.kind}:${editor.id}`)).toEqual(["step:new-task", "action:add-contact"]);
        // The editor's own Remove deletes the entry; the room follows.
        delete (mounted.harness.settings.installedTemplates as any).steps["new-task"];
        editors[0].done({}, true);
        expect(mounted.roomEl.byClass("installed-piece")).toHaveLength(1);
    });

    it("removes a piece on the second press, and saves", async () => {
        const mounted = await mount({ systems: false });
        const remove = buttonIn(mounted.roomEl.byClass("installed-piece")[0], "Remove")!;
        remove.click();
        await flush();
        expect(remove.text).toBe("Remove it");
        expect(mounted.saves).not.toHaveBeenCalled();
        remove.click();
        await settle(() => mounted.saves.mock.calls.length > 0, 20);
        expect((mounted.harness.settings.installedTemplates as any).steps).toEqual({});
        expect(mounted.roomEl.byClass("installed-piece").map((piece) => piece.oneByClass("installed-piece-name").text)).toEqual(["Add contact"]);
    });

    it("adds the template from the clipboard, localized", async () => {
        const mounted = await mount({ systems: false, pieces: false, clipboard: step("from-clip", "From the clipboard") });
        const add = mounted.roomEl.find((el) => el.tag === "button" && el.textContent === "Add the template from the clipboard")!;
        add.click();
        expect(Object.keys((mounted.harness.settings.installedTemplates as any).steps)).toEqual(["from-clip"]);
        expect((mounted.harness.settings.communitySettings as any).clipboardTemplate).toBeUndefined();
        expect(mounted.roomEl.byClass("installed-piece")).toHaveLength(1);
    });
});

describe("the Installed room, empty (#803 AC-9, FR-14, FR-15)", () => {
    it("says nothing is installed, offers the gallery, and counts nothing", async () => {
        const mounted = await mount({ systems: false, pieces: false });
        expect(mounted.roomEl.byText("Nothing installed yet.")).toBeDefined();
        expect(mounted.roomEl.byText("No loose pieces installed.")).toBeDefined();
        buttonIn(mounted.roomEl, "Browse systems")!.click();
        expect(mounted.openRoom).toHaveBeenCalledWith("systems");
        expect(mounted.room.count()).toBe(0);
    });

    it("counts systems and loose pieces together", async () => {
        const mounted = await mount();
        expect(mounted.room.count()).toBe(4);
    });

    it("redraws when you come back after installing something, and not otherwise", async () => {
        const mounted = await mount({ systems: false, pieces: false });
        const lede = mounted.roomEl.oneByClass("installed-lede");
        mounted.room.shown();
        expect(mounted.roomEl.oneByClass("installed-lede")).toBe(lede);
        (mounted.harness.settings.installedTemplates as any).steps["x"] = step("x", "X");
        mounted.room.shown();
        expect(mounted.roomEl.oneByClass("installed-lede")).not.toBe(lede);
        expect(mounted.roomEl.byClass("installed-piece")).toHaveLength(1);
    });
});
