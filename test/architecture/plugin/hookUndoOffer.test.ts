import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const HOOKS = read("src", "hooks", "VaultHooks.ts");
const NOTICE = read("src", "architecture", "plugin", "writes", "undoNotice.ts");

/**
 * The hook's undo is offered where the change happens (#455).
 *
 * The window and the "is there anything to offer" decision are pure and covered by
 * `undoOffer.test.ts`. What is left to pin down is the wiring, and the two properties that make it
 * an offer rather than an interruption: it is a `Notice`, and it does not fire when the hook wrote
 * nothing.
 */
describe("a hook's change is undoable in the moment (#455)", () => {
    it("offers the undo from the hook's own write path, with the batch it just wrote", () => {
        expect(HOOKS).toContain("currentWriteBatch()");
        expect(HOOKS).toContain("offerUndo(batch, file.path)");
        // Inside the batch, not after it: the id has to be read while the batch is still open.
        expect(HOOKS).toMatch(/withWriteBatch\([\s\S]*?batch = currentWriteBatch\(\)/);
    });

    it("says nothing when the hook changed nothing", () => {
        // `worthOffering` is the gate; an idempotent hook records no write, so there is no offer.
        expect(NOTICE).toContain("if (!worthOffering(writes)) return;");
    });

    it("is a notice, never a modal — ignoring it is the normal case", () => {
        expect(NOTICE).toContain("new Notice(");
        expect(NOTICE).not.toContain("Modal");
        expect(NOTICE).toContain("UNDO_OFFER_MS");
    });

    it("checks the window again when the button is clicked, not only when it was drawn", () => {
        expect(NOTICE).toContain('if (offerState(offeredAt, Date.now()) === "expired") return;');
    });

    it("reuses the one undo, rather than growing a second way to reverse a write", () => {
        expect(NOTICE).toContain("planUndo(");
        expect(NOTICE).toContain("applyUndo(plan, obsidianUndoVault)");
        expect(NOTICE).toContain("rememberUndone(batch");
    });

    it("says what changed, not merely that something did", () => {
        expect(NOTICE).toContain("undo_offer_properties");
        expect(NOTICE).toContain("undo_offer_changed");
    });
});
