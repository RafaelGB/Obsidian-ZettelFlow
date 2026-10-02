import { describe, it, expect } from "@jest/globals";
import {
    INITIAL_SUBJECT,
    reduceSubject,
    type SubjectState,
} from "architecture/components/core/noteCompanion/companionSubject";

const following = (shown: string): SubjectState => ({ shown, pinned: false, last: shown });

describe("which note the companion shows (#640 FR-3/4/6, AC-2/AC-3)", () => {
    it("starts empty, with no last note in a fresh session", () => {
        expect(INITIAL_SUBJECT).toEqual({ shown: null, pinned: false, last: null });
    });

    it("follows the active markdown note", () => {
        const next = reduceSubject(INITIAL_SUBJECT, { kind: "active", path: "a.md", markdown: true });
        expect(next).toEqual({ shown: "a.md", pinned: false, last: "a.md" });
    });

    it("shows nothing for a canvas or no file, and keeps the last note for the empty state", () => {
        expect(reduceSubject(following("a.md"), { kind: "active", path: "flow.canvas", markdown: false })).toEqual({
            shown: null,
            pinned: false,
            last: "a.md",
        });
        expect(reduceSubject(following("a.md"), { kind: "active", path: null, markdown: false }).last).toBe("a.md");
    });

    it("ignores the active note while pinned", () => {
        const pinned = reduceSubject(following("a.md"), { kind: "pin" });
        expect(pinned.pinned).toBe(true);
        expect(reduceSubject(pinned, { kind: "active", path: "b.md", markdown: true }).shown).toBe("a.md");
    });

    it("cannot pin an empty companion", () => {
        expect(reduceSubject(INITIAL_SUBJECT, { kind: "pin" }).pinned).toBe(false);
    });

    it("moves the shown note and the last note along a rename", () => {
        const pinned: SubjectState = { shown: "a.md", pinned: true, last: "a.md" };
        expect(reduceSubject(pinned, { kind: "rename", from: "a.md", to: "z/a2.md" })).toEqual({
            shown: "z/a2.md",
            pinned: true,
            last: "z/a2.md",
        });
        expect(reduceSubject(pinned, { kind: "rename", from: "other.md", to: "x.md" })).toBe(pinned);
    });

    it("unpins and follows the active note when the pinned note is deleted", () => {
        const pinned: SubjectState = { shown: "a.md", pinned: true, last: "a.md" };
        expect(reduceSubject(pinned, { kind: "delete", path: "a.md", active: "b.md" })).toEqual({
            shown: "b.md",
            pinned: false,
            last: "b.md",
        });
    });

    it("forgets a deleted last note", () => {
        const empty: SubjectState = { shown: null, pinned: false, last: "a.md" };
        expect(reduceSubject(empty, { kind: "delete", path: "a.md", active: null })).toEqual({
            shown: null,
            pinned: false,
            last: null,
        });
    });

    it("follow unpins and goes back to the active note", () => {
        const pinned: SubjectState = { shown: "a.md", pinned: true, last: "a.md" };
        expect(reduceSubject(pinned, { kind: "follow", active: "b.md" })).toEqual(following("b.md"));
    });

    it("open shows the named note, moving the pin when pinned", () => {
        expect(reduceSubject(following("a.md"), { kind: "open", path: "b.md" })).toEqual(following("b.md"));
        const pinned: SubjectState = { shown: "a.md", pinned: true, last: "a.md" };
        expect(reduceSubject(pinned, { kind: "open", path: "b.md" })).toEqual({ shown: "b.md", pinned: true, last: "b.md" });
    });
});
