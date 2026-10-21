import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SETTINGS } from "config/typing";
import { normalizeLoadedSettings } from "config/normalizeLoadedSettings";

/**
 * Loading settings rewrote `data.json` on every launch — a deep clone of the whole settings and a
 * disk write, and on a synced vault a sync event per device per start (#795). It is written now only
 * when the normalization changed what is persisted.
 */
describe("normalizeLoadedSettings (#795)", () => {
    // What a previous load already wrote back: normalized, nothing left to change.
    const clean = () => JSON.parse(JSON.stringify(normalizeLoadedSettings(null, DEFAULT_SETTINGS).settings));

    it("a data.json that is already normalized needs no write (AC-8)", () => {
        expect(normalizeLoadedSettings(clean(), DEFAULT_SETTINGS).dirty).toBe(false);
    });

    it("a first run (no data.json) is written once", () => {
        expect(normalizeLoadedSettings(null, DEFAULT_SETTINGS).dirty).toBe(true);
    });

    it.each([
        ["a clipboard template, which is never persisted", (data: any) => { data.communitySettings = { ...data.communitySettings, clipboardTemplate: "x" }; }],
        ["the retired ai.allowInAutomations", (data: any) => { data.ai = { ...data.ai, allowInAutomations: true }; }],
        ["no installedTemplates", (data: any) => { delete data.installedTemplates; }],
        ["installedTemplates without its steps", (data: any) => { data.installedTemplates = { actions: {} }; }],
    ])("%s is cleaned and written once", (_name, dirty) => {
        const data = clean();
        dirty(data);
        const result = normalizeLoadedSettings(data, DEFAULT_SETTINGS);
        expect(result.dirty).toBe(true);
        expect(result.settings.communitySettings?.clipboardTemplate).toBeUndefined();
        expect("allowInAutomations" in result.settings.ai).toBe(false);
        expect(result.settings.installedTemplates).toEqual({ steps: data.installedTemplates?.steps ?? {}, actions: data.installedTemplates?.actions ?? {} });
    });

    it("a setting a migration rewrites is written once", () => {
        const data = clean();
        // The retired prefix toggle (#439): the pattern alone says it now.
        data.uniquePrefixEnabled = true;
        const result = normalizeLoadedSettings(data, DEFAULT_SETTINGS);
        expect(result.dirty).toBe(true);
    });

    it("keeps what was loaded over the defaults", () => {
        const data = { ...clean(), ribbonCanvas: "flows/mine.canvas" };
        expect(normalizeLoadedSettings(data, DEFAULT_SETTINGS).settings.ribbonCanvas).toBe("flows/mine.canvas");
    });
});

describe("the Library's archive at load (#865 AC-20)", () => {
    it("is on for a vault that never set it, and stays off once emptied", () => {
        const upgrading = JSON.parse(JSON.stringify(normalizeLoadedSettings(null, DEFAULT_SETTINGS).settings));
        delete upgrading.libraryArchiveFolder;
        expect(normalizeLoadedSettings(upgrading, DEFAULT_SETTINGS).settings.libraryArchiveFolder).toBe("Library archive");
        const emptied = { ...upgrading, libraryArchiveFolder: "" };
        expect(normalizeLoadedSettings(emptied, DEFAULT_SETTINGS).settings.libraryArchiveFolder).toBe("");
    });
});
