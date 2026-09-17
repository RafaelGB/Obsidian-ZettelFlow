import { describe, it, expect } from "@jest/globals";
import { planRoleChange, planRoleRemoval } from "config/roles/assignRole";
import type { FlowFolders } from "architecture/plugin/canvas/flowRole";

const folders: FlowFolders = {
    ribbonCanvas: "Flows/Create.canvas",
    editorCanvas: "",
    foldersFlowsPath: "_ZettelFlow/folders",
    eventFlowsPath: "_ZettelFlow/events",
};

describe("giving a canvas a role says what it would do first (#435)", () => {
    it("writes one setting and names who loses the role", () => {
        expect(planRoleChange({ path: "Flows/Other.canvas", role: "create", folders })).toEqual({
            role: "create",
            settings: { key: "ribbonCanvas", value: "Flows/Other.canvas" },
            displaces: "Flows/Create.canvas",
        });
    });

    it("displaces nobody when the role is free", () => {
        const plan = planRoleChange({ path: "Flows/Other.canvas", role: "edit", folders });
        expect(plan).toEqual({ role: "edit", settings: { key: "editorCanvas", value: "Flows/Other.canvas" } });
    });

    it("moves the file for a place-based role", () => {
        expect(planRoleChange({ path: "Flows/Other.canvas", role: "event", folders })).toEqual({
            role: "event",
            move: { from: "Flows/Other.canvas", to: "_ZettelFlow/events/Other.canvas" },
        });
    });

    it("names a folder flow by the folder it automates, not by its own name", () => {
        const plan = planRoleChange({
            path: "Flows/Other.canvas",
            role: "folder",
            folders,
            folder: "0. Inbox/Tasks",
        });
        expect(plan.move?.to).toBe("_ZettelFlow/folders/0. Inbox_Tasks.canvas");
    });

    it("asks which folder rather than guessing one", () => {
        expect(planRoleChange({ path: "Flows/Other.canvas", role: "folder", folders }).problem).toBe(
            "folder-required"
        );
    });

    it("refuses a place-based role with no home configured", () => {
        expect(
            planRoleChange({
                path: "Flows/Other.canvas",
                role: "event",
                folders: { ...folders, eventFlowsPath: "" },
            }).problem
        ).toBe("no-home");
    });

    it("says nothing to do when the canvas already holds the role", () => {
        expect(planRoleChange({ path: "Flows/Create.canvas", role: "create", folders }).problem).toBe(
            "already"
        );
    });
});

describe("taking a role away (#435)", () => {
    it("clears the setting of an exclusive role", () => {
        expect(planRoleRemoval("Flows/Create.canvas", folders)).toEqual({
            role: "none",
            settings: { key: "ribbonCanvas", value: "" },
        });
    });

    it("says nothing for a place-based role — that one is a move, not a switch", () => {
        expect(planRoleRemoval("_ZettelFlow/events/A.canvas", folders)).toBeUndefined();
    });
});
