import { describe, it, expect, jest } from "@jest/globals";
import { openNoteCompanion } from "architecture/components/core/noteCompanion/openNoteCompanion";

function workspace(existing: { setViewState: jest.Mock }[] = []) {
    return {
        getLeavesOfType: jest.fn(() => existing),
        revealLeaf: jest.fn(async () => undefined),
        ensureSideLeaf: jest.fn(async () => ({})),
    };
}

describe("opening This note (#640 FR-1/2/20, AC-1)", () => {
    it("makes it in the right sidebar when there is none", async () => {
        const ws = workspace();
        await openNoteCompanion({ workspace: ws } as never, { path: "a.md", focus: "nearby" });
        expect(ws.ensureSideLeaf).toHaveBeenCalledWith("zettelflow-note", "right", {
            active: true,
            reveal: true,
            state: { path: "a.md", focus: "nearby" },
        });
    });

    it("updates and reveals the one that exists, wherever it is, and never makes a second", async () => {
        const leaf = { setViewState: jest.fn(async () => undefined) };
        const ws = workspace([leaf]);
        await openNoteCompanion({ workspace: ws } as never, { path: "a.md", focus: "next", move: "connect" });
        expect(leaf.setViewState).toHaveBeenCalledWith({
            type: "zettelflow-note",
            state: { path: "a.md", focus: "next", move: "connect" },
            active: true,
        });
        expect(ws.revealLeaf).toHaveBeenCalledWith(leaf);
        expect(ws.ensureSideLeaf).not.toHaveBeenCalled();
    });

    it("opens on whatever it already shows when nothing is named", async () => {
        const ws = workspace();
        await openNoteCompanion({ workspace: ws } as never);
        expect(ws.ensureSideLeaf).toHaveBeenCalledWith("zettelflow-note", "right", { active: true, reveal: true, state: {} });
    });
});
