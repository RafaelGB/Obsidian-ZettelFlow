import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/application/community → 3 ups → repo root
const SYSTEM_INSTALL = join(__dirname, "..", "..", "..", "src", "application", "community", "systemInstall.ts");

describe("systemInstall stays Obsidian-free (#214, AC-3)", () => {
    it("does not import from 'obsidian'", () => {
        expect(readFileSync(SYSTEM_INSTALL, "utf8")).not.toMatch(/from\s+["']obsidian["']/);
    });
});
