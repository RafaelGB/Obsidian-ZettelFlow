import { describe, it, expect, jest } from "@jest/globals";
import { DomNode } from "../support/dashboardDom";

jest.mock("architecture/settings", () => ({ FolderSuggest: class {} }));
jest.mock("architecture/plugin/services/FileService", () => ({ FileService: { moveFile: jest.fn() } }));

import { AssignRoleModal } from "config/modals/AssignRoleModal";

/**
 * **One role per canvas, said before it applies** (#712). The ribbon canvas given *Crystallizes
 * thoughts* stops creating notes — the dialog names the role it gives up, and the same apply clears it.
 */
describe("giving the ribbon canvas the crystallize role", () => {
    function open() {
        const settings: Record<string, unknown> = {
            ribbonCanvas: "Flows/Create.canvas",
            editorCanvas: "",
            crystallizeCanvas: "",
            foldersFlowsPath: "_ZettelFlow/folders",
            eventFlowsPath: "_ZettelFlow/events",
            hooks: { folderFlowPath: "_ZettelFlow/hooks" },
        };
        const plugin = { settings, saveSettings: jest.fn(async () => undefined) };
        const onDone = jest.fn();
        const modal = new AssignRoleModal({} as never, plugin as never, "Flows/Create.canvas", "crystallize", onDone);
        const content = new DomNode();
        (modal as unknown as { contentEl: DomNode }).contentEl = content;
        modal.onOpen();
        return { modal, content, settings, plugin, onDone };
    }

    it("says the canvas stops creating notes, and what it will do instead", () => {
        const { content } = open();
        const lines = content.byClass("assign-role-line").map((line) => line.textContent);
        expect(lines).toContain("This canvas stops being: Creates notes.");
        expect(lines).toContain("Notes you crystallize in Think will be built by it.");
    });

    it("applies both in one save: the new role set, the old one cleared", async () => {
        const { modal, settings, plugin, onDone } = open();
        await (modal as unknown as { apply(): Promise<void> }).apply();
        expect(settings.crystallizeCanvas).toBe("Flows/Create.canvas");
        expect(settings.ribbonCanvas).toBe("");
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        expect(onDone).toHaveBeenCalledTimes(1);
    });
});
