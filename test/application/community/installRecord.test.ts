import { beforeEach, describe, it, expect } from "@jest/globals";
import { replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { installSystem } from "application/community/installSystem";
import { undoInstall } from "application/community/undoInstall";
import { COMMUNITY_VIEW } from "application/community/view/communityRooms";
import { wireHarness } from "../../support/harness";
import { FakeLeaf } from "../../support/communityWorkspace";
import { branching, scripted } from "../../support/systemsFixtures";
import {
    addInstall,
    canonicalHash,
    dropInstall,
    installsOf,
    nextFreeFolder,
    type InstalledSystem,
} from "application/community/installRecord";

function record(over: Partial<InstalledSystem> = {}): InstalledSystem {
    return {
        id: "i-1",
        ref: "/docs/systems/zettelkasten-v2.zftemplate",
        name: "Zettelkasten v2",
        at: 1,
        folder: "Flows/Zettelkasten v2",
        canvas: "Flows/Zettelkasten v2/Zettelkasten v2.canvas",
        role: "create",
        files: [],
        folders: [],
        ...over,
    };
}

describe("the install record, pure (#799 FR-12, FR-14)", () => {
    it("hashes a canvas by what it says, not how it is laid out", () => {
        const tight = JSON.stringify({ nodes: [{ id: "a", x: 1 }], edges: [] });
        const loose = JSON.stringify({ edges: [], nodes: [{ x: 1, id: "a" }] }, null, "\t");
        expect(canonicalHash("F/x.canvas", tight)).toBe(canonicalHash("F/x.canvas", loose));
        expect(canonicalHash("F/x.canvas", JSON.stringify({ nodes: [{ id: "a", x: 2 }], edges: [] }))).not.toBe(
            canonicalHash("F/x.canvas", tight)
        );
    });

    it("hashes a note by its text, and a canvas that is not JSON by its text too", () => {
        expect(canonicalHash("F/a.md", "Body")).toBe(canonicalHash("F/b.md", "Body"));
        expect(canonicalHash("F/a.md", "Body")).not.toBe(canonicalHash("F/a.md", "Body!"));
        expect(canonicalHash("F/x.canvas", "{not json")).toBe(canonicalHash("F/y.md", "{not json"));
    });

    it("adds, finds and drops installs, never touching the list it was given", () => {
        const before: InstalledSystem[] = [record()];
        const after = addInstall(before, record({ id: "i-2", ref: "/docs/systems/gtd.zftemplate" }));
        expect(before).toHaveLength(1);
        expect(after.map((r) => r.id)).toEqual(["i-1", "i-2"]);
        expect(installsOf(after, "/docs/systems/gtd.zftemplate").map((r) => r.id)).toEqual(["i-2"]);
        expect(installsOf(undefined, "/docs/systems/gtd.zftemplate")).toEqual([]);
        expect(dropInstall(after, "i-1").map((r) => r.id)).toEqual(["i-2"]);
        expect(addInstall(undefined, record()).map((r) => r.id)).toEqual(["i-1"]);
    });

    it("finds the next folder that collides with nothing, for another copy", () => {
        const taken = new Set(["F/Zettelkasten v2", "F/Zettelkasten v2 2"]);
        expect(nextFreeFolder("F/Zettelkasten v2", (path) => taken.has(path))).toBe("F/Zettelkasten v2 3");
        expect(nextFreeFolder("F/Fresh", (path) => taken.has(path))).toBe("F/Fresh");
    });
});

describe("Undo takes the install back exactly (#799 AC-10, FR-15)", () => {
    beforeEach(() => replaceBufferedWrites([]));

    async function installed(template = branching(), role: "create" | "none" = "create") {
        const harness = wireHarness({ settings: { ribbonCanvas: "Old/flow.canvas" } });
        const outcome = await installSystem(harness.plugin as never, template, "/docs/systems/x.zftemplate", { role, targetFolder: "Flows/X" });
        if (outcome.kind !== "installed") throw new Error(outcome.kind);
        const leaf = new FakeLeaf();
        leaf.view = { file: { path: outcome.canvasPath } } as never;
        return { ...harness, outcome, leaf };
    }

    it("trashes the files, restores the creation flow, drops the record and goes back to Systems", async () => {
        const { plugin, vault, settings, outcome, leaf } = await installed();
        expect(settings.ribbonCanvas).toBe(outcome.canvasPath);
        const result = await undoInstall(plugin as never, outcome.record, leaf as never);
        expect(vault.entries.size).toBe(0);
        expect(settings.ribbonCanvas).toBe("Old/flow.canvas");
        expect(settings.installedSystems).toEqual([]);
        expect(leaf.calls.at(-1)).toMatchObject({ type: COMMUNITY_VIEW, state: { room: "systems" } });
        expect(result).toEqual({ removed: [outcome.canvasPath], kept: [], failed: [], settingRestored: true });
    });

    it("gives the displaced flow its role back even when trashing the canvas clears the role (#712)", async () => {
        const { plugin, settings, outcome, app } = await installed();
        // The vault follows a deleted canvas: a role that pointed at it is emptied, as Obsidian's delete hook does.
        const fileManager = (app as unknown as { fileManager: { trashFile: (file: { path: string }) => Promise<void> } }).fileManager;
        const trash = fileManager.trashFile;
        fileManager.trashFile = async (file) => {
            if (settings.ribbonCanvas === file.path) settings.ribbonCanvas = "";
            await trash(file);
        };
        const result = await undoInstall(plugin as never, outcome.record);
        expect(settings.ribbonCanvas).toBe("Old/flow.canvas");
        expect(result.settingRestored).toBe(true);
    });

    it("still trashes a file Obsidian touched after the write, when its content is what was installed", async () => {
        const { plugin, vault, outcome } = await installed(scripted(), "none");
        // Obsidian re-saving the canvas on open moves its mtime past the undo's grace (#455).
        for (const entry of vault.entries.values()) (entry.file as unknown as { stat: { mtime: number } }).stat.mtime = Date.now() + 60_000;
        const result = await undoInstall(plugin as never, outcome.record);
        expect(vault.entries.size).toBe(0);
        expect(result.removed.sort()).toEqual(outcome.record.files.map((file) => file.path).sort());
    });

    it("keeps a file you changed since, and names it", async () => {
        const { plugin, vault, outcome } = await installed(scripted(), "none");
        const note = "Flows/X/Weekly focus.md";
        const entry = vault.entries.get(note)!;
        entry.content = `${entry.content}\nMy own line`;
        (entry.file as unknown as { stat: { mtime: number } }).stat.mtime = Date.now() + 60_000;
        const result = await undoInstall(plugin as never, outcome.record);
        expect(vault.entries.has(note)).toBe(true);
        expect(result.kept).toEqual([note]);
        expect(result.removed).toEqual(["Flows/X/Weekly focus.canvas"]);
    });

    it("leaves the leaf alone when it no longer shows that canvas, and a setting you changed since", async () => {
        const { plugin, settings, outcome, leaf } = await installed();
        leaf.view = { file: { path: "Somewhere/else.md" } } as never;
        settings.ribbonCanvas = "Mine/now.canvas";
        const result = await undoInstall(plugin as never, outcome.record, leaf as never);
        expect(leaf.calls).toEqual([]);
        expect(settings.ribbonCanvas).toBe("Mine/now.canvas");
        expect(result.settingRestored).toBe(false);
    });
});
