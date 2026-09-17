import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
const VIEW = readFileSync(
    join(ROOT, "src", "architecture", "components", "core", "workbench", "WorkbenchView.ts"),
    "utf8"
);
const PURE = readFileSync(
    join(ROOT, "src", "application", "scripts", "workbenchRun.ts"),
    "utf8"
);
const LOG_SECTION = readFileSync(
    join(ROOT, "src", "architecture", "components", "core", "workbench", "runLogSection.ts"),
    "utf8"
);

/**
 * The workbench runs your script and writes nothing (#446, AC-2) — the same guarantee the flow
 * rehearsal makes (#430), asserted the same way: by what the module is allowed to reach.
 */
describe("the workbench writes nothing (#446)", () => {
    it("reaches no writer", () => {
        for (const forbidden of [
            "FileService.createFile",
            "FileService.writeFile",
            "FileService.modify",
            "FrontmatterService",
            "saveSettings",
            "processFrontMatter",
            "vault().modify",
            "vault().create",
        ]) {
            expect(VIEW).not.toContain(forbidden);
        }
    });

    it("reads the context note, and only reads it", () => {
        expect(VIEW).toContain("cachedRead");
        expect(VIEW).not.toContain("vault().delete");
    });

    it("keeps the reading half pure", () => {
        // The diff and the surface vocabulary must stay testable without Obsidian.
        expect(/^import /m.test(PURE.replace(/^import type .*$/m, ""))).toBe(false);
    });

    it("injects each surface's real bindings rather than a copy", () => {
        for (const constant of [
            "SCRIPT_ACTION_BINDINGS",
            "DYNAMIC_SELECTOR_BINDINGS",
            "HOOK_BINDINGS",
            "CONDITION_BINDINGS",
        ]) {
            expect(VIEW).toContain(constant);
        }
    });

    it("records what it ran, marked as a bench run", () => {
        expect(VIEW).toContain('surface: "workbench"');
    });
});

/**
 * The log lives beside the bench rather than inside it (#447): reading a record and setting how
 * long records are kept is a settings write, and the bench itself must reach no writer at all.
 * Neither of them touches the vault.
 */
describe("the run log writes a setting, and nothing else (#447)", () => {
    it("never writes to the vault", () => {
        for (const forbidden of ["vault().modify", "vault().create", "vault().delete", "processFrontMatter"]) {
            expect(LOG_SECTION).not.toContain(forbidden);
        }
    });

    it("keeps its one write to the log's own settings", () => {
        expect(LOG_SECTION).toContain("plugin.settings.scriptLog");
        expect(LOG_SECTION).toContain("saveSettings");
    });

    it("says so when the note a run used is gone, instead of opening a blank run", () => {
        expect(LOG_SECTION).toContain("run_log_note_gone");
    });
});
