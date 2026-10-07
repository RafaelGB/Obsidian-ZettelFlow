import { describe, it, expect } from "@jest/globals";
import { namedRolesFollowRename, namedRolesForgetDelete } from "config/roles/roleFollows";

function settings() {
    return { ribbonCanvas: "Flows/Create.canvas", editorCanvas: "Flows/Edit.canvas", crystallizeCanvas: "Flows/Think.canvas" };
}

describe("crystallize flow follows its canvas (#712)", () => {
    it("moves every named role whose canvas was renamed, and says which changed", () => {
        const s = settings();
        expect(namedRolesFollowRename(s, "Flows/Think.canvas", "Flows/Thinking.canvas")).toEqual(["crystallizeCanvas"]);
        expect(s.crystallizeCanvas).toBe("Flows/Thinking.canvas");
        // The editor canvas did not follow a rename before; the one table covers it too.
        expect(namedRolesFollowRename(s, "Flows/Edit.canvas", "Flows/Editing.canvas")).toEqual(["editorCanvas"]);
        expect(s.editorCanvas).toBe("Flows/Editing.canvas");
        expect(namedRolesFollowRename(s, "Flows/Create.canvas", "New/Create.canvas")).toEqual(["ribbonCanvas"]);
    });

    it("forgets a deleted canvas", () => {
        const s = settings();
        expect(namedRolesForgetDelete(s, "Flows/Think.canvas")).toEqual(["crystallizeCanvas"]);
        expect(s.crystallizeCanvas).toBe("");
    });

    it("leaves every role alone for an unrelated path", () => {
        const s = settings();
        expect(namedRolesFollowRename(s, "Notes/a.md", "Notes/b.md")).toEqual([]);
        expect(namedRolesForgetDelete(s, "Notes/a.md")).toEqual([]);
        expect(s).toEqual(settings());
    });
});
