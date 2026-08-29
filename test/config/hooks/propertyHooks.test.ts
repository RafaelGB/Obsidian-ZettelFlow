import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

// test/config/hooks → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

const MANAGER = read("src", "config", "modals", "handlers", "hooks", "components", "PropertyHooksManager.tsx");
const ACCORDION = read("src", "config", "modals", "handlers", "hooks", "components", "PropertyHookAccordion.tsx");
const RUNTIME = read("src", "hooks", "VaultHooks.ts");
const TYPING = read("src", "config", "typing.ts");

/**
 * Property-hooks manager invariants (#327). These lock the fixes so they can't regress: a single ordered
 * source of truth (the add-hook bug came from a desynced `hooks`/`hookOrder` pair), atomic persistence,
 * a guarded render, and the new capabilities honored by the runtime.
 */
describe("property hooks manager (#327 S1)", () => {
    it("uses one ordered source of truth — no split hookOrder state", () => {
        expect(MANAGER).not.toContain("setHookOrder");
        expect(MANAGER).not.toMatch(/useState<string\[\]>/); // the old order array is gone
        expect(MANAGER).toContain("HookItem[]");
    });

    it("persists atomically (state + settings + save in one path) and guards missing entries", () => {
        expect(MANAGER).toContain("const persist = (next: HookItem[])");
        expect(MANAGER).toContain("plugin.settings.hooks.properties = record");
        expect(MANAGER).toContain("plugin.saveSettings()");
        expect(MANAGER).toMatch(/settings: settings \?\? \{ script: "" \}/); // guarded mapping
    });

    it("appends and auto-opens a newly added hook", () => {
        expect(MANAGER).toContain("setNewlyAdded");
        expect(MANAGER).toContain("defaultOpen={item.property === newlyAdded}");
    });
});

describe("property hook settings shape (#327 S3/S4)", () => {
    it("carries enabled, description and condition", () => {
        for (const field of ["enabled?: boolean", "description?: string", "condition?: string"]) {
            expect(TYPING).toContain(field);
        }
    });

    it("the accordion surfaces enable toggle, description, condition and a dry-run", () => {
        expect(ACCORDION).toContain("property_hooks_enabled_label");
        expect(ACCORDION).toContain("property_hooks_description_label");
        expect(ACCORDION).toContain("property_hooks_condition_label");
        expect(ACCORDION).toContain("onTest(");
        expect(ACCORDION).toContain("sanityCheckCondition"); // condition validation
    });
});

describe("hook runtime honors the new fields (#327 S3/S4/S5)", () => {
    it("skips a disabled hook and gates on the condition", () => {
        expect(RUNTIME).toContain("hookSettings.enabled === false");
        expect(RUNTIME).toContain("evaluateHookCondition");
        expect(RUNTIME).toContain("evaluateBindingCondition");
    });

    it("exposes a read-only dry-run that never writes the vault", () => {
        const dryRun = RUNTIME.slice(RUNTIME.indexOf("static async dryRun"), RUNTIME.indexOf("private onRename"));
        expect(dryRun.length).toBeGreaterThan(0);
        expect(dryRun).not.toMatch(/setProperties|\.modify\(|processFrontMatter/);
        expect(dryRun).toContain("status: \"skipped\"");
    });
});
