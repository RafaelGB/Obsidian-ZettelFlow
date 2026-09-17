import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
    flowRole,
    isFlowCanvas,
    isUnderFolder,
    validateFlowFolders,
    type FlowFolders,
} from "architecture/plugin/canvas/flowRole";

const folders: FlowFolders = {
    ribbonCanvas: "Flows/Create.canvas",
    editorCanvas: "Flows/Edit.canvas",
    foldersFlowsPath: "_ZettelFlow/folders",
    eventFlowsPath: "_ZettelFlow/events",
    hooksFolderPath: "_ZettelFlow/hooks",
};

describe("a canvas has a role (#435)", () => {
    it("names each one", () => {
        expect(flowRole("Flows/Create.canvas", folders)).toBe("create");
        expect(flowRole("Flows/Edit.canvas", folders)).toBe("edit");
        expect(flowRole("_ZettelFlow/folders/Sources.canvas", folders)).toBe("folder");
        expect(flowRole("_ZettelFlow/events/On create.canvas", folders)).toBe("event");
        expect(flowRole("_ZettelFlow/hooks/State.canvas", folders)).toBe("hook");
        expect(flowRole("Somewhere/Else.canvas", folders)).toBe("none");
    });

    it("states its precedence rather than leaving it to chance", () => {
        // The canvas you named by hand wins over the folder it also happens to sit in.
        const overlapping: FlowFolders = { ...folders, ribbonCanvas: "_ZettelFlow/events/Create.canvas" };
        expect(flowRole("_ZettelFlow/events/Create.canvas", overlapping)).toBe("create");
    });

    it("matches on a folder boundary, not on a prefix", () => {
        // `startsWith` alone — what the four old checks used — called this a folder flow.
        expect(flowRole("_ZettelFlow/folders2/Sources.canvas", folders)).toBe("none");
        expect(isUnderFolder("_ZettelFlow/events", "_ZettelFlow/events")).toBe(true);
        expect(isUnderFolder("_ZettelFlow/events/", "_ZettelFlow/events/a.canvas")).toBe(true);
    });

    it("treats an unset folder as no folder, instead of as the whole vault", () => {
        expect(isUnderFolder("", "anything.canvas")).toBe(false);
        expect(isUnderFolder(undefined, "anything.canvas")).toBe(false);
        expect(flowRole("anything.canvas", {})).toBe("none");
        expect(flowRole(undefined, folders)).toBe("none");
    });

    it("answers the question the four scattered checks were asking", () => {
        expect(isFlowCanvas("_ZettelFlow/hooks/State.canvas", folders)).toBe(true);
        expect(isFlowCanvas("Notes/Idea.canvas", folders)).toBe(false);
    });
});

describe("the homes are distinct places (#435, AC-2)", () => {
    it("accepts folders that merely share a parent", () => {
        expect(validateFlowFolders(folders)).toBeUndefined();
    });

    it("refuses two homes that are the same folder", () => {
        const conflict = validateFlowFolders({ ...folders, eventFlowsPath: "_ZettelFlow/folders" });
        expect(conflict).toEqual({ folder: "_ZettelFlow/folders", against: "_ZettelFlow/folders" });
    });

    it("refuses nesting in either direction", () => {
        expect(
            validateFlowFolders({ ...folders, eventFlowsPath: "_ZettelFlow/folders/events" })
        ).toEqual({ folder: "_ZettelFlow/folders/events", against: "_ZettelFlow/folders" });
        expect(validateFlowFolders({ ...folders, foldersFlowsPath: "_ZettelFlow/events/folders" }))
            .toEqual({ folder: "_ZettelFlow/events", against: "_ZettelFlow/events/folders" });
    });

    it("is not fooled by a sibling that only looks nested", () => {
        expect(
            validateFlowFolders({ ...folders, eventFlowsPath: "_ZettelFlow/folders-archive" })
        ).toBeUndefined();
    });

    it("ignores the homes that are not configured", () => {
        expect(validateFlowFolders({ foldersFlowsPath: "", eventFlowsPath: "" })).toBeUndefined();
    });
});

describe("one question, one answer (#435, AC-3)", () => {
    const ROOT = join(__dirname, "..", "..", "..", "..", "src");

    function sources(dir: string): string[] {
        return readdirSync(dir).flatMap((entry) => {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) return sources(full);
            return /\.tsx?$/.test(entry) ? [full] : [];
        });
    }

    it("leaves the membership question to the resolver alone", () => {
        // Four call sites each deciding "is this one of ours?" is how they drifted apart: one
        // forgot the hooks folder, another the editor canvas, and all of them used a prefix match.
        const offenders: string[] = [];
        for (const file of sources(ROOT)) {
            if (file.endsWith("flowRole.ts")) continue;
            const source = readFileSync(file, "utf8");
            if (/startsWith\(\s*(?:this\.plugin\.settings\.|settings\.|plugin\.settings\.)?(?:foldersFlowsPath|eventFlowsPath)/.test(source)) {
                offenders.push(file);
            }
            if (/startsWith\(\s*hooks\.folderFlowPath/.test(source)) offenders.push(file);
        }
        expect(offenders).toEqual([]);
    });
});
