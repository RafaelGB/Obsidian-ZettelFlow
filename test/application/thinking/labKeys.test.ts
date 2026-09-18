import { describe, it, expect } from "@jest/globals";
import { keyFor, keyLabel, LAB_KEYS, moveFor } from "application/thinking/labKeys";

describe("one table of keys (#476)", () => {
    it("gives every move exactly one key", () => {
        const moves = LAB_KEYS.map((entry) => entry.move);
        expect(new Set(moves).size).toBe(moves.length);
    });

    it("never gives one keystroke two meanings", () => {
        const strokes = LAB_KEYS.map((entry) => `${entry.shift ? "shift+" : ""}${entry.key}`);
        expect(new Set(strokes).size).toBe(strokes.length);
    });

    it("puts nothing destructive on a bare single key", () => {
        // A stray keystroke in a place you were told is safe must not be able to throw a thread
        // away.
        const bare = LAB_KEYS.filter((entry) => entry.destructive && !entry.shift);
        expect(bare).toEqual([]);
    });

    it("marks the two moves that remove things, and only those", () => {
        expect(LAB_KEYS.filter((entry) => entry.destructive).map((entry) => entry.move).sort()).toEqual([
            "decidedAgainst",
            "discard",
        ]);
    });

    it("names every move with a key the legend can show", () => {
        for (const entry of LAB_KEYS) expect(entry.labelKey.startsWith("lab_")).toBe(true);
    });

    it("reads a keystroke case-insensitively, with shift as part of the identity", () => {
        expect(moveFor("F", false)).toBe("fork");
        expect(moveFor("f", false)).toBe("fork");
        // Shift+D is throwing away; plain d is nothing at all.
        expect(moveFor("d", true)).toBe("discard");
        expect(moveFor("d", false)).toBeUndefined();
    });

    it("means nothing for a key it does not know", () => {
        expect(moveFor("q", false)).toBeUndefined();
        expect(moveFor("", false)).toBeUndefined();
    });

    it("writes a key the way a person reads it", () => {
        expect(keyLabel({ move: "fork", key: "f", labelKey: "lab_fork" })).toBe("F");
        expect(keyLabel({ move: "discard", key: "d", shift: true, labelKey: "lab_discard" })).toBe("Shift+D");
        expect(keyLabel({ move: "leave", key: "escape", labelKey: "lab_key_leave" })).toBe("Esc");
    });

    it("can be asked for a move's key, so a tooltip and the legend agree", () => {
        expect(keyFor("challenge")?.key).toBe("c");
        expect(keyFor("leave")?.key).toBe("escape");
    });

    it("covers moving between thoughts, not only acting on one", () => {
        // A key that acts on "the focused thought" is useless if you cannot change which one that
        // is without the mouse.
        expect(keyFor("next")).toBeDefined();
        expect(keyFor("previous")).toBeDefined();
    });
});
