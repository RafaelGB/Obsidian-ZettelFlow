import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import * as obsidian from "obsidian";
import { linkNotes } from "architecture/plugin/services/recordedLink";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { bufferedWrites, replaceBufferedWrites } from "architecture/plugin/writes/recordVaultWrite";
import { filterWrites } from "application/writes/vaultWriteLog";
import { wireHarness } from "../../../support/harness";

/**
 * Insert link, written into the right note (#640 amendment 2).
 *
 * The old button called `editor.replaceSelection` on whatever editor had the cursor: unrecorded,
 * not undoable, and — once the companion can be pinned — written into a note you were not
 * looking at. This is the one write the companion's sections and the next-step card share.
 */
describe("linkNotes (#640)", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        // The uuid stub makes every batch id equal; start each case from an empty record.
        replaceBufferedWrites([]);
    });

    it("appends the link to the companion's note, not the active one", async () => {
        const h = wireHarness({
            files: { "a.md": { frontmatter: {}, body: "A." }, "b.md": { frontmatter: {}, body: "B." } },
        });
        const result = await linkNotes(h.app as never, "a.md", "B");
        expect(result.ok).toBe(true);
        expect(h.vault.contentOf("a.md")).toContain("[[B]]");
        expect(h.vault.contentOf("b.md")).not.toContain("[[B]]");
    });

    it("records one append in its own batch, attributed to you", async () => {
        const h = wireHarness({ files: { "a.md": { frontmatter: {}, body: "A." } } });
        const { batch } = await linkNotes(h.app as never, "a.md", "B");
        expect(batch).toBeDefined();
        const writes = filterWrites(bufferedWrites(), { batch });
        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({ kind: "content-appended", path: "a.md", appended: "[[B]]" });
        expect(writes[0].origin.kind).toBe("manual");
    });

    it("raises no toast — the companion says it inline", async () => {
        const notice = jest.spyOn(obsidian.Notice.prototype, "setMessage");
        const constructed = jest.fn();
        const Original = obsidian.Notice;
        const spy = jest.spyOn(obsidian, "Notice").mockImplementation(((message?: string) => {
            constructed(message);
            return new Original(message);
        }) as never);
        const h = wireHarness({ files: { "a.md": { frontmatter: {}, body: "A." } } });
        await linkNotes(h.app as never, "a.md", "B");
        expect(constructed).not.toHaveBeenCalled();
        expect(notice).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("can be taken back exactly", async () => {
        const h = wireHarness({ files: { "a.md": { frontmatter: {}, body: "A." } } });
        const { batch } = await linkNotes(h.app as never, "a.md", "B");
        const outcome = await undoBatch(batch!);
        expect(outcome.done).toBeGreaterThan(0);
        expect(h.vault.contentOf("a.md")).not.toContain("[[B]]");
    });

    it("reports a missing note instead of throwing", async () => {
        const h = wireHarness({});
        await expect(linkNotes(h.app as never, "missing.md", "B")).resolves.toEqual({ ok: false });
    });
});
