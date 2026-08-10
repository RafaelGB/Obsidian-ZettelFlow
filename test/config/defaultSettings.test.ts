import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SETTINGS } from "config/typing";

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
});
