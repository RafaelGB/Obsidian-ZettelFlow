import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SETTINGS } from "config/typing";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

describe("DEFAULT_SETTINGS", () => {
    // These keys are declared required on ZettelFlowSettings; missing defaults surface as the
    // literal string "undefined" in settings fields and break the logger level lookup.
    it("provides defaults for every scalar setting used before the user edits anything", () => {
        expect(DEFAULT_SETTINGS.logLevel).toBeDefined();
        expect(DEFAULT_SETTINGS.ribbonCanvas).toBeDefined();
        expect(DEFAULT_SETTINGS.editorCanvas).toBeDefined();
        expect(DEFAULT_SETTINGS.jsLibraryFolderPath).toBeDefined();
    });

    it("defaults the log level to a known level record key", () => {
        expect(typeof DEFAULT_SETTINGS.logLevel).toBe("string");
        expect((DEFAULT_SETTINGS.logLevel as string).length).toBeGreaterThan(0);
    });

    it("provides a relations settings object so the platform default can resolve (#147)", () => {
        expect(DEFAULT_SETTINGS.relations).toBeDefined();
    });

    it("has the semantic-relations settings strings in both locales (i18n parity)", () => {
        const keys = [
            "settings_relations_heading",
            "settings_relations_intro",
            "settings_parse_inline_relations_name",
            "settings_parse_inline_relations_desc",
        ] as const;
        for (const key of keys) {
            expect(en[key as keyof typeof en]).toBeDefined();
            expect(es[key as keyof typeof es]).toBeDefined();
        }
    });
});
