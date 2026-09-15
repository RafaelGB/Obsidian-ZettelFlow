import { describe, it, expect } from "@jest/globals";
import {
    composeDestination,
    composeFilename,
    describeDestination,
} from "application/notes/destination";

describe("the wizard can show where the note will land (#408)", () => {
    it("names the file after the title when no prefix is configured", () => {
        expect(composeFilename("Atomicity", undefined)).toBe("Atomicity");
        expect(composeFilename("Atomicity", "")).toBe("Atomicity");
        expect(composeFilename("Atomicity", "   ")).toBe("Atomicity");
    });

    it("keeps the builder's prefix separator", () => {
        expect(composeFilename("Atomicity", "20260915")).toBe("20260915 - Atomicity");
    });

    it("composes the full path the note is written to", () => {
        expect(composeDestination("zettel/ideas", "20260915 - Atomicity")).toBe(
            "zettel/ideas/20260915 - Atomicity.md"
        );
    });

    it("says nothing about the path until there is a title", () => {
        const view = describeDestination({ folder: "zettel", title: "  " });
        expect(view.path).toBeUndefined();
        expect(view.folder).toBe("zettel");
    });

    it("describes folder, name and path together once the title exists", () => {
        const view = describeDestination({
            folder: "zettel/ideas",
            title: "Atomicity",
            renderedPrefix: "20260915",
        });
        expect(view).toEqual({
            folder: "zettel/ideas",
            filename: "20260915 - Atomicity",
            path: "zettel/ideas/20260915 - Atomicity.md",
            locked: false,
        });
    });

    it("reports a pinned folder as locked", () => {
        expect(describeDestination({ folder: "inbox", title: "x", locked: true }).locked).toBe(true);
    });

    it("handles the vault root, where the folder is empty", () => {
        expect(describeDestination({ folder: "", title: "Atomicity" }).path).toBe("/Atomicity.md");
    });
});
