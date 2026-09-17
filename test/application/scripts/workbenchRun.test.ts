import { describe, it, expect } from "@jest/globals";
import {
    emptyContext,
    needsContextNote,
    summariseWrites,
    SURFACE_LABEL_KEY,
    TRYABLE_SURFACES,
    type NoteState,
} from "application/scripts/workbenchRun";

const before: NoteState = {
    title: "Atomicity",
    body: "# Atomicity\n",
    frontmatter: { state: "fleeting", tags: ["idea"] },
};

describe("what a script would write, instead of writing it (#446)", () => {
    it("says nothing changed when nothing did", () => {
        expect(summariseWrites(before, { ...before })).toEqual({ frontmatter: [], touched: false });
    });

    it("names the text it appended", () => {
        const after = { ...before, body: `${before.body}A note about atoms.\n` };
        const writes = summariseWrites(before, after);
        expect(writes.bodyAdded).toBe("A note about atoms.\n");
        expect(writes.touched).toBe(true);
    });

    it("names each frontmatter key it set, changed or removed", () => {
        const after: NoteState = {
            ...before,
            frontmatter: { state: "permanent", reviewed: "2026-09-17" },
        };
        expect(summariseWrites(before, after).frontmatter).toEqual([
            { key: "state", from: "fleeting", to: "permanent" },
            { key: "tags", from: ["idea"], to: undefined },
            { key: "reviewed", from: undefined, to: "2026-09-17" },
        ]);
    });

    it("notices a title it rewrote", () => {
        const writes = summariseWrites(before, { ...before, title: "Atomic notes" });
        expect(writes.title).toEqual({ from: "Atomicity", to: "Atomic notes" });
    });

    it("shows the whole body when the script replaced it rather than appended", () => {
        const writes = summariseWrites(before, { ...before, body: "Something else\n" });
        expect(writes.bodyAdded).toBe("Something else\n");
    });
});

describe("what the workbench can try (#446)", () => {
    it("offers the four surfaces a script is written for", () => {
        expect([...TRYABLE_SURFACES]).toEqual(["action", "selector", "hook", "condition"]);
    });

    it("knows which of them are handed a note", () => {
        expect(needsContextNote("hook")).toBe(true);
        expect(needsContextNote("condition")).toBe(true);
        expect(needsContextNote("action")).toBe(false);
        expect(needsContextNote("selector")).toBe(false);
    });

    it("states an empty context rather than inventing one", () => {
        expect(emptyContext()).toEqual({ title: "", body: "", frontmatter: {} });
    });

    it("names every surface for the picker", () => {
        for (const surface of TRYABLE_SURFACES) {
            expect(SURFACE_LABEL_KEY[surface]).toMatch(/^workbench_surface_/);
        }
    });
});
