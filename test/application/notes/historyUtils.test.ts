import { describe, it, expect } from "@jest/globals";
import { appendHistory, clearHistory, MAX_HISTORY, HistoryEntry } from "application/notes/historyUtils";

const entry = (id: number): HistoryEntry => ({
    notePath: `note${id}.md`,
    canvasPath: `canvas.canvas`,
    createdAt: id,
});

describe("appendHistory", () => {
    it("prepends the new entry (most-recent first)", () => {
        const result = appendHistory([], entry(1));
        expect(result[0].notePath).toBe("note1.md");
    });

    it("keeps older entries after the new one", () => {
        const h = appendHistory([entry(1)], entry(2));
        expect(h[0].notePath).toBe("note2.md");
        expect(h[1].notePath).toBe("note1.md");
    });

    it("caps the list at MAX_HISTORY entries", () => {
        let h: HistoryEntry[] = [];
        for (let i = 0; i < MAX_HISTORY + 5; i++) {
            h = appendHistory(h, entry(i));
        }
        expect(h).toHaveLength(MAX_HISTORY);
        // The most-recent entry (id = MAX_HISTORY+4) is at index 0
        expect(h[0].notePath).toBe(`note${MAX_HISTORY + 4}.md`);
    });

    it("does not mutate the original array", () => {
        const original: HistoryEntry[] = [entry(1)];
        appendHistory(original, entry(2));
        expect(original).toHaveLength(1);
    });
});

describe("clearHistory", () => {
    it("returns an empty array", () => {
        expect(clearHistory()).toHaveLength(0);
    });
});
