import { describe, it, expect, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { commitDraft } from "application/thinking/commit";

const ROOT = join(__dirname, "..", "..", "..");
const CODE = readFileSync(join(ROOT, "src/architecture/components/core/lab/LabRenderer.ts"), "utf8");

/**
 * **A thought you wrote is the one thing this surface must not lose** (#544).
 *
 * `commit()` used to clear the box *before* awaiting the write, and `ThoughtStore.write` answers
 * `undefined` whenever `folder()` cannot read the setting — it swallows a failed `getOwnPlugin()`
 * and returns `""` (#374). So a failed save took the sentence with it: text gone, nothing written,
 * nothing said.
 */
describe("the composer clears after the write, never before (#544)", () => {
    const commit = CODE.slice(CODE.indexOf("private async commit"), CODE.indexOf("private renderNode"));

    it("awaits the write before it touches the draft", () => {
        const write = commit.indexOf("ThoughtStore.getInstance().write");
        const clear = commit.indexOf('this.draft = ""');
        expect(write).toBeGreaterThan(-1);
        expect(clear).toBeGreaterThan(write);
    });

    it("says so when nothing was written, rather than returning in silence", () => {
        expect(commit).toContain("if (!made)");
        expect(commit).toContain("log.error(");
        expect(commit).toContain("this.sayCommitFailed()");
    });

    it("says it in the composer, not in a corner of the screen", () => {
        // The Lab never counts at you (#469): a message about your sentence belongs beside your
        // sentence. `noDebt.test.ts` forbids `Notice(` here and this is why it still holds.
        expect(CODE).not.toContain("new Notice(");
        expect(CODE).toContain('this.hintEl.addClass(c("lab-hint--failed"))');
    });
});

describe("Ctrl+Enter means the same thing in every box (#544)", () => {
    it("is honoured by an existing thought, not only by the composer", () => {
        const card = CODE.slice(CODE.indexOf("private renderThought"), CODE.indexOf("private renderLinks"));
        expect(card).toContain('event.key === "Enter" && (event.metaKey || event.ctrlKey)');
    });

    it("is what the hint under the composer promises", () => {
        const composer = CODE.slice(CODE.indexOf("private renderComposer"), CODE.indexOf("private async commit"));
        expect(composer).toContain('event.key === "Enter" && (event.metaKey || event.ctrlKey)');
        expect(composer).toContain('t("lab_commit_hint")');
    });

    it("commits the live textarea value, not a possibly-stale draft (#596)", () => {
        // The bug: Ctrl/Cmd+Enter did nothing (no newline, no card, text kept) — the commit ran
        // against an unsynced draft. The handler now passes `area.value` and catches like blur does.
        const composer = CODE.slice(CODE.indexOf("private renderComposer"), CODE.indexOf("private async commit"));
        expect(composer).toContain("this.commit(area.value)");
        expect(composer).toContain(".catch(");
    });
});

/**
 * The commit decision, tested without a DOM (#596).
 *
 * The renderer's `commit()` delegates the empty-guard and the clear-after-write ordering to
 * `commitDraft`, so the behaviour the bug report is about is provable here even though a real
 * keydown on a `<textarea>` cannot be dispatched in the node test environment.
 */
describe("commitDraft writes once and clears only after (#596)", () => {
    it("writes nothing for an empty or whitespace draft", async () => {
        const write = jest.fn<(t: string) => Promise<boolean>>(async () => true);
        const clear = jest.fn();
        expect(await commitDraft("   ", write, clear)).toBe("empty");
        expect(write).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
    });

    it("writes the trimmed text once, then clears — never before the write", async () => {
        const order: string[] = [];
        const write = jest.fn<(t: string) => Promise<boolean>>(async (t) => {
            order.push(`write:${t}`);
            return true;
        });
        const clear = jest.fn(() => {
            order.push("clear");
        });
        expect(await commitDraft("  hello  ", write, clear)).toBe("written");
        expect(write).toHaveBeenCalledTimes(1);
        expect(order).toEqual(["write:hello", "clear"]);
    });

    it("keeps the draft when the write returns nothing (a failed save never eats the sentence)", async () => {
        const write = jest.fn<(t: string) => Promise<boolean>>(async () => false);
        const clear = jest.fn();
        expect(await commitDraft("hello", write, clear)).toBe("failed");
        expect(clear).not.toHaveBeenCalled();
    });
});
