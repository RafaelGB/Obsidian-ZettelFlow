import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const BUILDER = readFileSync(join(__dirname, "..", "..", "..", "src", "application", "notes", "NoteBuilder.ts"), "utf8");

/**
 * **A build hands the vault back** (found walking #712). Building a note freezes the vault hooks so
 * they do not react to its own write — and the freeze was lifted only when the build *failed*. After
 * the first note a flow built, every hook stayed off for the session: a renamed flow canvas no longer
 * took its role with it, and property hooks went quiet.
 */
describe("building a note thaws the vault hooks, success or failure", () => {
    it("defrosts in the finally of the build that froze them", () => {
        const build = BUILDER.slice(BUILDER.indexOf("private async buildNewNote()")).replace(/\r\n/g, "\n");
        const method = build.slice(0, build.indexOf("\n  }\n") + 4);
        expect(method).toContain("VaultStateManager.INSTANCE.freeze();");
        const finallyBlock = method.slice(method.lastIndexOf("} finally {"));
        expect(finallyBlock).toContain("VaultStateManager.INSTANCE.defrost();");
    });
});
