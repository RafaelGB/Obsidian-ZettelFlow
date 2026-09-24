import { describe, it, expect, beforeEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { keepDraft, readDraft, clearDraft } from "application/claims";

// test/application/claims → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const MODAL = readFileSync(join(ROOT, "src/architecture/components/core/claims/ClaimReturnModal.ts"), "utf8");
const COMPONENT = readFileSync(join(ROOT, "src/starters/zcomponents/ClaimReturnComponent.ts"), "utf8");

/**
 * Leaving never costs a sentence (#562 FR-7).
 *
 * The Lab's rule: the draft lives **outside the DOM**, so a redraw — or a modal that closes because
 * you went to look at the note — cannot lose what you typed. A refuge that loses your words because
 * you switched tabs is not one.
 */
describe("what you typed survives leaving (#562)", () => {
    beforeEach(() => {
        clearDraft("Notes/a.md");
        clearDraft("Notes/b.md");
    });

    it("round-trips per note", () => {
        keepDraft("Notes/a.md", "half a sentence");
        expect(readDraft("Notes/a.md")).toBe("half a sentence");
        expect(readDraft("Notes/b.md")).toBe("");
    });

    it("keeps the draft across a rebuilt state", () => {
        keepDraft("Notes/a.md", "still here");
        expect(readDraft("Notes/a.md")).toBe("still here");
        expect(readDraft("Notes/a.md")).toBe("still here");
    });

    it("forgets it only when asked", () => {
        keepDraft("Notes/a.md", "gone soon");
        clearDraft("Notes/a.md");
        expect(readDraft("Notes/a.md")).toBe("");
    });
});

/**
 * The surface draws only what the view model gives it (#562 AC-11).
 *
 * `claimReturnView` is what makes the leak structural; a renderer that reached around it for the
 * stored sentence would put the whole promise back in the hands of whoever edits this file next.
 */
describe("the return's surface cannot reach around the view model (#562)", () => {
    it("never reads the stored claim directly", () => {
        expect(MODAL).not.toMatch(/\bstate\.stored\b/);
        expect(MODAL).toContain("claimReturnView");
    });

    it("is built the Obsidian way", () => {
        expect(MODAL).toContain("contentEl.empty()");
        expect(MODAL).not.toContain("innerHTML");
        expect(MODAL).not.toContain("el.style.");
    });

    it("keeps the draft outside the DOM", () => {
        expect(MODAL).toContain("keepDraft(");
        expect(MODAL).toContain("readDraft(");
    });

    it("closing records nothing", () => {
        // The method's own body, not "everything after it": `onClose` is not the last thing in the
        // file, and a slice to the end would assert something about `commit` instead.
        const start = MODAL.indexOf("onClose(): void {");
        const body = MODAL.slice(start, MODAL.indexOf("\n    }", start));
        expect(body).toContain("contentEl.empty()");
        expect(body).not.toContain("answerReturn");
        expect(body).not.toContain("clearDraft");
    });

    it("opens by hand for now, from one command gated on there being a claim", () => {
        expect(COMPONENT).toContain('id: "return-to-this-claim"');
        expect(COMPONENT).toContain("checkCallback");
        expect(COMPONENT).toContain("statedClaims(");
        expect(COMPONENT).toContain("scopeExcludedPaths(this.plugin.settings)");
    });
});
