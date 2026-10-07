import { describe, it, expect } from "@jest/globals";
import { LOG_LEVEL_OFF, migrateSettings } from "config/settingsMigration";
import { scopeRulesOf } from "architecture/knowledge/scope/scopeRules";

describe("two rows become one decision, losing nothing (#439)", () => {
    it("keeps a prefix that was switched on", () => {
        const { settings, changed } = migrateSettings({
            uniquePrefixEnabled: true,
            uniquePrefix: "YYYYMMDDHHmmss",
        });
        expect(settings.uniquePrefix).toBe("YYYYMMDDHHmmss");
        expect("uniquePrefixEnabled" in settings).toBe(false);
        expect(changed).toBe(true);
    });

    it("turns a prefix that was switched off into no prefix", () => {
        const { settings } = migrateSettings({
            uniquePrefixEnabled: false,
            uniquePrefix: "YYYYMMDD",
        });
        expect(settings.uniquePrefix).toBe("");
    });

    it("keeps the level someone was logging at", () => {
        const { settings } = migrateSettings({ loggerEnabled: true, logLevel: "debug" });
        expect(settings.logLevel).toBe("debug");
        expect("loggerEnabled" in settings).toBe(false);
    });

    it("turns logging off into a level that says so", () => {
        const { settings } = migrateSettings({ loggerEnabled: false, logLevel: "debug" });
        expect(settings.logLevel).toBe(LOG_LEVEL_OFF);
    });

    it("gives an enabled logger with no level the default one", () => {
        expect(migrateSettings({ loggerEnabled: true }).settings.logLevel).toBe("info");
    });

    it("is idempotent, and quiet when there is nothing to migrate", () => {
        const once = migrateSettings({ uniquePrefixEnabled: true, uniquePrefix: "X", loggerEnabled: true, logLevel: "warn" });
        const twice = migrateSettings(once.settings);
        expect(twice.settings).toEqual(once.settings);
        expect(twice.changed).toBe(false);
    });

    it("drops the wizard's own list of built notes, now the write record holds it (#454)", () => {
        const { settings, changed } = migrateSettings({
            history: [{ notePath: "Notes/one.md", canvasPath: "a.canvas", createdAt: 1 }],
        });
        expect("history" in settings).toBe(false);
        expect(changed).toBe(true);
    });

    it("leaves everything else exactly as it was", () => {
        const { settings } = migrateSettings({
            loggerEnabled: true,
            logLevel: "info",
            ribbonCanvas: "Flows/Create.canvas",
            excludedPaths: ["_ZettelFlow"],
        });
        expect(settings.ribbonCanvas).toBe("Flows/Create.canvas");
        expect(settings.excludedPaths).toEqual(["_ZettelFlow"]);
    });
});

describe("excluded folders become folder rules, losing nothing (#713, AC-6)", () => {
    it("turns each saved excluded folder into a folder rule, in the same order", () => {
        const { settings, changed } = migrateSettings({ excludedPaths: ["Templates", "Archive/Old"] });
        expect(settings.knowledgeScope).toEqual({
            leaveOut: [
                { kind: "folder", op: "in", folder: "Templates", subfolders: true },
                { kind: "folder", op: "in", folder: "Archive/Old", subfolders: true },
            ],
            keep: [],
        });
        expect(changed).toBe(true);
        // The old list stays: it is what the previous version reads, for one release.
        expect(settings.excludedPaths).toEqual(["Templates", "Archive/Old"]);
    });

    it("is a no-op the second time", () => {
        const once = migrateSettings({ excludedPaths: ["Templates", "Archive/Old"] }).settings;
        const twice = migrateSettings(once);
        expect(twice.changed).toBe(false);
        expect(twice.settings).toEqual(once);
    });

    it("adds exactly the folder an older version added, after the rules already there", () => {
        const { settings, changed } = migrateSettings({
            excludedPaths: ["Templates", "Old"],
            knowledgeScope: {
                leaveOut: [
                    { kind: "tag", op: "any", tags: ["draft"], nested: true },
                    { kind: "folder", op: "in", folder: "Templates", subfolders: true },
                ],
                keep: [{ kind: "tag", op: "any", tags: ["evergreen"], nested: false }],
            },
        });
        expect(changed).toBe(true);
        expect(settings.knowledgeScope).toEqual({
            leaveOut: [
                { kind: "tag", op: "any", tags: ["draft"], nested: true },
                { kind: "folder", op: "in", folder: "Templates", subfolders: true },
                { kind: "folder", op: "in", folder: "Old", subfolders: true },
            ],
            keep: [{ kind: "tag", op: "any", tags: ["evergreen"], nested: false }],
        });
    });

    it("loads settings with neither field to no rules, and leaves them untouched", () => {
        const { settings, changed } = migrateSettings({ logLevel: "info" });
        expect(changed).toBe(false);
        expect(scopeRulesOf(settings)).toEqual({ leaveOut: [], keep: [] });
    });

    it("normalises a malformed rule set instead of throwing", () => {
        const { settings, changed } = migrateSettings({
            excludedPaths: [],
            knowledgeScope: { leaveOut: [{ kind: "formula" }, { kind: "folder", op: "in", folder: "A", subfolders: true }], keep: "x" },
        });
        expect(changed).toBe(true);
        expect(settings.knowledgeScope).toEqual({ leaveOut: [{ kind: "folder", op: "in", folder: "A", subfolders: true }], keep: [] });
    });
});
