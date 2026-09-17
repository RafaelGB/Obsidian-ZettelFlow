import { describe, it, expect } from "@jest/globals";
import { installDestination } from "application/community/installDestination";
import type { FlowFolders } from "architecture/plugin/canvas/flowRole";

const folders: FlowFolders = {
    ribbonCanvas: "Flows/Old create.canvas",
    editorCanvas: "",
    foldersFlowsPath: "_ZettelFlow/folders",
    eventFlowsPath: "_ZettelFlow/events",
};

const base = {
    targetFolder: "_ZettelFlow/folders/Weekly focus",
    canvasFilename: "Weekly focus.canvas",
    folders,
};

describe("a system is installed into a role (#437)", () => {
    it("writes the create setting and names what it displaces", () => {
        expect(installDestination({ ...base, role: "create" })).toEqual({
            targetFolder: "_ZettelFlow/folders/Weekly focus",
            settings: {
                key: "ribbonCanvas",
                value: "_ZettelFlow/folders/Weekly focus/Weekly focus.canvas",
            },
            displaces: "Flows/Old create.canvas",
        });
    });

    it("displaces nobody when the role is free", () => {
        const destination = installDestination({ ...base, role: "edit" });
        expect(destination.settings?.key).toBe("editorCanvas");
        expect(destination.displaces).toBeUndefined();
    });

    it("lands an event flow in the events folder", () => {
        expect(installDestination({ ...base, role: "event" })).toEqual({
            targetFolder: "_ZettelFlow/events",
        });
    });

    it("names a folder flow after the folder it automates", () => {
        const destination = installDestination({ ...base, role: "folder", folder: "0. Inbox/Tasks" });
        expect(destination.targetFolder).toBe("_ZettelFlow/folders");
        expect(destination.canvasName).toBe("0. Inbox_Tasks.canvas");
    });

    it("asks which folder rather than guessing", () => {
        expect(installDestination({ ...base, role: "folder" }).problem).toBe("folder-required");
    });

    it("refuses a role whose home is not configured", () => {
        expect(
            installDestination({ ...base, role: "event", folders: { ...folders, eventFlowsPath: "" } })
                .problem
        ).toBe("no-home");
    });

    it("leaves 'just the files' exactly as it was before roles existed", () => {
        expect(installDestination({ ...base, role: "none" })).toEqual({
            targetFolder: "_ZettelFlow/folders/Weekly focus",
        });
    });
});
