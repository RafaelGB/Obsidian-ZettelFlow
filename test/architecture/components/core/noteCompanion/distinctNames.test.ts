import { describe, it, expect } from "@jest/globals";
import { distinctNames } from "architecture/components/core/noteCompanion/blocks/CompanionBlock";

describe("distinctNames — a list where two notes share a name", () => {
    it("adds the folder that tells them apart, and only to those that need it", () => {
        // *Near and forgotten* read `readme` five times, with nothing to choose between them.
        const names = distinctNames(["Projects/Alpha/readme.md", "Projects/Beta/readme.md", "Ideas/Event sourcing.md"]);
        expect(names.get("Projects/Alpha/readme.md")).toBe("readme · Alpha");
        expect(names.get("Projects/Beta/readme.md")).toBe("readme · Beta");
        expect(names.get("Ideas/Event sourcing.md")).toBe("Event sourcing");
    });

    it("leaves a name alone at the vault root, where there is no folder to add", () => {
        const names = distinctNames(["readme.md", "Docs/readme.md"]);
        expect(names.get("readme.md")).toBe("readme");
        expect(names.get("Docs/readme.md")).toBe("readme · Docs");
    });
});
