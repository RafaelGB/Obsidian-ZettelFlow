import { describe, it, expect } from "@jest/globals";
import { LOG_LEVEL_OFF, migrateSettings } from "config/settingsMigration";

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
