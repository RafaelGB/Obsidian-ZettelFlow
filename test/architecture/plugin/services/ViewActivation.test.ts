import { describe, it, expect, jest } from "@jest/globals";
import { activateSidebarView } from "architecture/plugin/services/ViewActivation";
import type { App } from "obsidian";

function mockApp(existing: unknown[]) {
    const leaf = { setViewState: jest.fn(async () => undefined) };
    const workspace = {
        getLeavesOfType: jest.fn(() => existing),
        getLeaf: jest.fn(() => leaf),
        getRightLeaf: jest.fn(() => leaf),
        revealLeaf: jest.fn(),
    };
    return { app: { workspace } as unknown as App, workspace, leaf };
}

describe("activateSidebarView opens views as main-area tabs (#268 S1)", () => {
    it("opens a new main-area tab when no leaf of the type exists", async () => {
        const { app, workspace, leaf } = mockApp([]);

        await activateSidebarView(app, "zettelflow-home");

        expect(workspace.getLeaf).toHaveBeenCalledWith("tab");
        expect(workspace.getRightLeaf).not.toHaveBeenCalled();
        expect(leaf.setViewState).toHaveBeenCalledWith({ type: "zettelflow-home", active: true });
        expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
    });

    it("reveals the existing leaf and never opens a second", async () => {
        const existing = { id: "x" };
        const { app, workspace } = mockApp([existing]);

        await activateSidebarView(app, "zettelflow-home");

        expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
        expect(workspace.getLeaf).not.toHaveBeenCalled();
    });
});
