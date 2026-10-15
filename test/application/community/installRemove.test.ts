import { beforeEach, describe, it, expect, jest } from "@jest/globals";
import { replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import type { VaultWrite } from "application/writes/vaultWriteLog";
import { installSystem } from "application/community/installSystem";
import type { InstalledSystem } from "application/community/installRecord";
import { batchIsLive, forgetInstall, planRemove, removeFacts, takeBackInstall, type RemoveFacts } from "application/community/removeInstall";
import { wireHarness } from "../../support/harness";
import { scripted } from "../../support/systemsFixtures";

function record(over: Partial<InstalledSystem> = {}): InstalledSystem {
    return {
        id: "i-1",
        ref: "/docs/systems/x.zftemplate",
        name: "X",
        at: 1,
        folder: "Flows/X",
        canvas: "Flows/X/X.canvas",
        role: "create",
        setting: { key: "ribbonCanvas", previous: "Old/flow.canvas", value: "Flows/X/X.canvas" },
        files: [
            { path: "Flows/X/X.canvas", hash: "c", size: 1 },
            { path: "Flows/X/Capture.md", hash: "a", size: 1 },
            { path: "Flows/X/Permanent.md", hash: "b", size: 1 },
        ],
        folders: ["Flows", "Flows/X"],
        batch: "batch-1",
        ...over,
    };
}

function facts(over: Partial<RemoveFacts> = {}): RemoveFacts {
    return {
        batchLive: false,
        files: {
            "Flows/X/X.canvas": { exists: true, hash: "c" },
            "Flows/X/Capture.md": { exists: true, hash: "a" },
            "Flows/X/Permanent.md": { exists: true, hash: "b" },
        },
        setting: "Flows/X/X.canvas",
        ...over,
    };
}

describe("planning a take-back, pure (#803 FR-11)", () => {
    it("is exact while the batch is live, safe otherwise", () => {
        expect(planRemove(record(), facts({ batchLive: true })).mode).toBe("exact");
        expect(planRemove(record(), facts()).mode).toBe("safe");
        expect(planRemove(record({ batch: undefined }), facts({ batchLive: true })).mode).toBe("safe");
        // A file you changed is never handed to the write record, which decides by mtime alone.
        expect(planRemove(record(), facts({ batchLive: true, files: { ...facts().files, "Flows/X/Capture.md": { exists: true, hash: "edited" } } })).mode).toBe("safe");
    });

    it("trashes what is unchanged, keeps what you changed and skips what is gone", () => {
        const plan = planRemove(
            record(),
            facts({ files: { "Flows/X/X.canvas": { exists: true, hash: "c" }, "Flows/X/Capture.md": { exists: true, hash: "edited" }, "Flows/X/Permanent.md": { exists: false } } })
        );
        expect(plan).toMatchObject({ trash: ["Flows/X/X.canvas"], kept: ["Flows/X/Capture.md"], missing: ["Flows/X/Permanent.md"] });
    });

    it("keeps a file it could not read", () => {
        expect(planRemove(record(), facts({ files: { ...facts().files, "Flows/X/Capture.md": { exists: true } } })).kept).toEqual(["Flows/X/Capture.md"]);
    });

    it("restores the setting only while it still points at this canvas", () => {
        expect(planRemove(record(), facts()).restoreSetting).toBe(true);
        expect(planRemove(record(), facts({ setting: "Mine/now.canvas" })).restoreSetting).toBe(false);
        expect(planRemove(record({ setting: undefined }), facts()).restoreSetting).toBe(false);
    });

    it("takes the folders it made deepest first", () => {
        expect(planRemove(record(), facts()).folders).toEqual(["Flows/X", "Flows"]);
    });

    it("calls a batch live only on the record, not undone, and inside the window", () => {
        const write = (over: Partial<VaultWrite>): VaultWrite => ({ id: "w", batch: "batch-1", at: 1_000_000, kind: "note-created", path: "p", origin: "flow" as never, ...over }) as VaultWrite;
        const now = 1_000_000 + 60_000;
        expect(batchIsLive("batch-1", [write({})], now)).toBe(true);
        expect(batchIsLive("batch-1", [write({ undone: now })], now)).toBe(false);
        expect(batchIsLive("batch-1", [write({ at: now - 3 * 60_000 })], now)).toBe(false);
        expect(batchIsLive("batch-2", [write({})], now)).toBe(false);
        expect(batchIsLive(undefined, [write({})], now)).toBe(false);
    });
});

describe("taking an install back, on the vault (#803 AC-6, AC-7)", () => {
    beforeEach(() => replaceBufferedWrites([]));

    async function installed() {
        const harness = wireHarness({ settings: { ribbonCanvas: "Old/flow.canvas" } });
        const outcome = await installSystem(harness.plugin as never, scripted(), "/docs/systems/x.zftemplate", { role: "create", targetFolder: "Flows/X" });
        if (outcome.kind !== "installed") throw new Error(outcome.kind);
        return { ...harness, outcome };
    }

    it("undoes the batch exactly while it is live, restores the role and drops the entry", async () => {
        const { plugin, vault, settings, outcome } = await installed();
        expect((await removeFacts(plugin as never, outcome.record)).batchLive).toBe(true);
        const result = await takeBackInstall(plugin as never, outcome.record);
        expect(result.mode).toBe("exact");
        expect(vault.entries.size).toBe(0);
        expect(settings.ribbonCanvas).toBe("Old/flow.canvas");
        expect(settings.installedSystems).toEqual([]);
        expect(result.removed.sort()).toEqual(outcome.record.files.map((file) => file.path).sort());
    });

    it("past the record, trashes the unchanged files through the seam and keeps the one you edited", async () => {
        const { plugin, vault, settings, outcome, app } = await installed();
        replaceBufferedWrites([]);
        const note = "Flows/X/Weekly focus.md";
        vault.entries.get(note)!.content += "\nMy own line";
        const trash = jest.spyOn((app as unknown as { fileManager: { trashFile: (f: unknown) => Promise<void> } }).fileManager, "trashFile");
        const result = await takeBackInstall(plugin as never, outcome.record);
        expect(result.mode).toBe("safe");
        expect(result.kept).toEqual([note]);
        expect(result.removed).toEqual(["Flows/X/Weekly focus.canvas"]);
        expect(trash.mock.calls.map(([file]) => (file as { path: string }).path)).toContain("Flows/X/Weekly focus.canvas");
        expect(vault.entries.has(note)).toBe(true);
        expect(vault.entries.has("Flows/X/Weekly focus.canvas")).toBe(false);
        expect(settings.ribbonCanvas).toBe("Old/flow.canvas");
        expect(settings.installedSystems).toEqual([]);
    });

    it("leaves the role alone when it was changed since", async () => {
        const { plugin, settings, outcome } = await installed();
        replaceBufferedWrites([]);
        settings.ribbonCanvas = "Mine/now.canvas";
        const result = await takeBackInstall(plugin as never, outcome.record);
        expect(result.settingRestored).toBe(false);
        expect(settings.ribbonCanvas).toBe("Mine/now.canvas");
    });

    it("reads facts without writing anything", async () => {
        const { plugin, vault, outcome } = await installed();
        const before = JSON.stringify([...vault.entries.entries()].map(([path, entry]) => [path, entry.content]));
        await removeFacts(plugin as never, outcome.record);
        expect(JSON.stringify([...vault.entries.entries()].map(([path, entry]) => [path, entry.content]))).toBe(before);
    });

    it("forgets a record and writes nothing to the vault", async () => {
        const { plugin, vault, settings, outcome } = await installed();
        const before = JSON.stringify([...vault.entries.keys()]);
        const saves = jest.spyOn(plugin, "saveSettings");
        await forgetInstall(plugin as never, outcome.record.id);
        expect(settings.installedSystems).toEqual([]);
        expect(saves).toHaveBeenCalledTimes(1);
        expect(JSON.stringify([...vault.entries.keys()])).toBe(before);
    });
});
