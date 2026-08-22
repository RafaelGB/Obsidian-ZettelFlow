import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/application/patterns → 3 ups → repo root
const CORE = join(__dirname, "..", "..", "..", "src", "application", "patterns", "postIndexRerunCore.ts");

/**
 * #275 (S6) — the headless post-index re-run no longer fabricates a `NoteDTO` via `as unknown as
 * NoteDTO`; it builds a real `NotePersistence` from the note path, so the pattern call site is off
 * the wizard-shaped domain object entirely.
 */
describe("postIndexRerunCore builds a NotePersistence, not a fabricated NoteDTO (#275)", () => {
    const src = readFileSync(CORE, "utf8");

    it("contains no `as unknown as NoteDTO` cast", () => {
        expect(src).not.toMatch(/as\s+unknown\s+as\s+NoteDTO/);
    });

    it("constructs the note stand-in via notePersistenceForPath", () => {
        expect(src).toMatch(/notePersistenceForPath\s*\(/);
    });
});
