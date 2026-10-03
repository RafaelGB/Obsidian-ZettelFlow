import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import * as obsidian from "obsidian";
import {
    addSourceTo,
    advanceTo,
    markExample,
    withdrawPromotion,
} from "architecture/plugin/services/noteNextStepWrites";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { bufferedWrites, replaceBufferedWrites, withWriteBatch } from "architecture/plugin/writes/recordVaultWrite";
import { filterWrites } from "application/writes/vaultWriteLog";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import type { Judgement } from "architecture/knowledge/judgement";
import { wireHarness } from "../../../support/harness";

function judgements(): { log: Judgement[] } {
    const state = { judgements: { enabled: true, log: [] as Judgement[] }, excludedPaths: [] };
    JudgementLog.getInstance().init({ settings: state as never, saveSettings: () => undefined });
    return { get log() { return state.judgements.log; } } as { log: Judgement[] };
}

function noToasts(): { constructed: jest.Mock; restore: () => void } {
    const constructed = jest.fn();
    const Original = obsidian.Notice;
    const spy = jest.spyOn(obsidian, "Notice").mockImplementation(((message?: string) => {
        constructed(message);
        return new Original(message);
    }) as never);
    return { constructed, restore: () => spy.mockRestore() };
}

/**
 * The writes behind the next-step card (#641 FR-10..20, AC-6..13). Each is one click, into the
 * companion's note, in a batch of its own, silent, and taken back exactly by its undo.
 */
describe("the next-step writes (#641)", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        replaceBufferedWrites([]);
    });

    it("adds a source beside the ones the note lists, in one manual batch, with no toast (AC-6, AC-11)", async () => {
        const toasts = noToasts();
        const h = wireHarness({
            files: {
                "a.md": { frontmatter: { claim: "Debt grows", sources: ["[[Missing]]"] }, body: "A." },
                "b.md": { frontmatter: {}, body: "B." },
            },
        });
        const result = await addSourceTo(h.app as never, "a.md", "Cunningham 1992");
        expect(result.ok).toBe(true);
        expect(h.vault.frontmatterOf("a.md").sources).toEqual(["[[Missing]]", "Cunningham 1992"]);
        expect(h.vault.frontmatterOf("b.md")).toEqual({});
        const writes = filterWrites(bufferedWrites(), { batch: result.batch });
        expect(writes).toHaveLength(1);
        expect(writes[0].origin.kind).toBe("manual");
        expect(toasts.constructed).not.toHaveBeenCalled();
        toasts.restore();
    });

    it("writes nothing for a blank source", async () => {
        const h = wireHarness({ files: { "a.md": { frontmatter: {}, body: "A." } } });
        await expect(addSourceTo(h.app as never, "a.md", "  ")).resolves.toEqual({ ok: false });
        expect(h.vault.frontmatterOf("a.md")).toEqual({});
    });

    it("can take a source back exactly (AC-12)", async () => {
        const h = wireHarness({ files: { "a.md": { frontmatter: { source: "Ahrens 2017" }, body: "A." } } });
        const { batch } = await addSourceTo(h.app as never, "a.md", "Luhmann 1981");
        await undoBatch(batch!);
        expect(h.vault.frontmatterOf("a.md").source).toBe("Ahrens 2017");
    });

    it("marks an example in the properties (AC-8)", async () => {
        const h = wireHarness({
            files: { "a.md": { frontmatter: {}, body: "A." }, "Ledger.md": { frontmatter: {}, body: "L." } },
        });
        const result = await markExample(h.app as never, "a.md", "Ledger.md");
        expect(result.ok).toBe(true);
        expect(h.vault.frontmatterOf("a.md").example).toBe("[[Ledger]]");
        await undoBatch(result.batch!);
        expect(h.vault.frontmatterOf("a.md").example).toBeUndefined();
    });

    it("leaves a plain-text example untouched and writes an inline field instead (AC-8)", async () => {
        const h = wireHarness({
            files: { "a.md": { frontmatter: { example: "some word" }, body: "A." }, "Ledger.md": { frontmatter: {}, body: "L." } },
        });
        const result = await markExample(h.app as never, "a.md", "Ledger.md");
        expect(result.ok).toBe(true);
        expect(h.vault.frontmatterOf("a.md").example).toBe("some word");
        expect(h.vault.contentOf("a.md")).toContain("example:: [[Ledger]]");
        await undoBatch(result.batch!);
        expect(h.vault.contentOf("a.md")).not.toContain("example::");
    });

    it("moves the note to Cultivate's proposed state and records one derived verdict (AC-9)", async () => {
        const record = judgements();
        const toasts = noToasts();
        const h = wireHarness({
            files: { "a.md": { frontmatter: { state: "fleeting" }, body: "A." } },
            settings: { lifecycle: { stateProperty: "state" } },
        });
        const result = await advanceTo(h.app as never, h.plugin as never, "a.md");
        expect(result.ok).toBe(true);
        expect(result.to).toBe("literature");
        expect(h.vault.frontmatterOf("a.md").state).toBe("literature");
        expect(record.log).toHaveLength(1);
        expect(record.log[0]).toMatchObject({ path: "a.md", subject: "state:literature", origin: "derived", verdict: "accepted" });
        expect(result.judgement).toEqual(record.log[0]);
        expect(toasts.constructed).not.toHaveBeenCalled();
        toasts.restore();
    });

    it("undoing a promotion restores the state and withdraws its verdict (Q1, AC-12)", async () => {
        const record = judgements();
        const h = wireHarness({
            files: { "a.md": { frontmatter: { state: "fleeting" }, body: "A." } },
            settings: { lifecycle: { stateProperty: "state" } },
        });
        const result = await advanceTo(h.app as never, h.plugin as never, "a.md");
        await undoBatch(result.batch!);
        withdrawPromotion(result.judgement!);
        expect(h.vault.frontmatterOf("a.md").state).toBe("fleeting");
        expect(record.log).toEqual([]);
    });

    it("writes nothing and says nothing when the note is gone (FR-19, AC-13)", async () => {
        const toasts = noToasts();
        const h = wireHarness({});
        await expect(addSourceTo(h.app as never, "gone.md", "x")).resolves.toEqual({ ok: false });
        await expect(markExample(h.app as never, "gone.md", "b.md")).resolves.toEqual({ ok: false });
        await expect(advanceTo(h.app as never, h.plugin as never, "gone.md")).resolves.toEqual({ ok: false });
        expect(toasts.constructed).not.toHaveBeenCalled();
        expect(h.vault.entries.size).toBe(0);
        toasts.restore();
    });

    it("offers no batch to undo when another write's batch is already open", async () => {
        const h = wireHarness({ files: { "a.md": { frontmatter: {}, body: "A." } } });
        const result = await withWriteBatch({ kind: "hook", ref: "hook:x" }, () => addSourceTo(h.app as never, "a.md", "Ref"));
        expect(result).toEqual({ ok: true });
    });
});
