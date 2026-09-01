import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import {
    typeDeclarationPath,
    dynamicNamespaces,
    TYPES_FILENAME,
} from "architecture/api/types/typeDeclarationFile";
import type { ZettelFlowApp } from "architecture/api/lib/typing";

// test/architecture/api/types → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");

describe("the declarations are written inside the configured folder, or nowhere (#352, AC-3)", () => {
    it("writes beside the user's library scripts", () => {
        expect(typeDeclarationPath("scripts")).toBe(`scripts/${TYPES_FILENAME}`);
        expect(typeDeclarationPath("00 Meta/js")).toBe(`00 Meta/js/${TYPES_FILENAME}`);
    });

    it("refuses to guess when no folder is configured", () => {
        expect(typeDeclarationPath("")).toBeNull();
        expect(typeDeclarationPath("   ")).toBeNull();
    });

    it("normalises a folder written with stray slashes", () => {
        expect(typeDeclarationPath("/scripts/")).toBe(`scripts/${TYPES_FILENAME}`);
    });

    /**
     * The folder is the user's own setting rather than untrusted input, but a path that escaped it
     * would still write somewhere they never asked for — so the result always ends inside it.
     */
    it("always lands on the declarations file, never on something else", () => {
        for (const folder of ["scripts", "a/b/c", "/leading", "trailing/"]) {
            expect(typeDeclarationPath(folder)?.endsWith(`/${TYPES_FILENAME}`)).toBe(true);
        }
    });
});

describe("what only this vault knows is read from the live API (#352, FR-2)", () => {
    it("names the user's own scripts", () => {
        const zf = {
            internal: { user: { formatDate: () => 0, slugify: () => "" }, vault: {} },
            external: {},
        } as unknown as ZettelFlowApp;

        expect(dynamicNamespaces(zf).userScripts).toEqual(["formatDate", "slugify"]);
    });

    it("reports the integrations that are actually installed", () => {
        const withBoth = {
            internal: { user: {}, vault: {} },
            external: { dv: {}, tp: { user: {} } },
        } as unknown as ZettelFlowApp;
        const withNeither = { internal: { user: {}, vault: {} }, external: {} } as unknown as ZettelFlowApp;

        expect(dynamicNamespaces(withBoth)).toMatchObject({ dataview: true, templater: true });
        expect(dynamicNamespaces(withNeither)).toMatchObject({ dataview: false, templater: false });
    });

    it("survives a half-built API rather than throwing at the user", () => {
        expect(dynamicNamespaces({} as ZettelFlowApp)).toEqual({
            userScripts: [],
            dataview: false,
            templater: false,
        });
    });
});

describe("the generator is reachable and explains itself (#352, AC-3)", () => {
    const locales: [string, Record<string, string>][] = [
        ["en", en as unknown as Record<string, string>],
        ["es", es as unknown as Record<string, string>],
    ];
    const KEYS = [
        "generate_types_name",
        "generate_types_description",
        "generate_types_button",
        "generate_types_written",
        "generate_types_no_folder",
        "generate_types_failed",
    ];

    it.each(locales)("%s has every string the button needs", (_name, locale) => {
        for (const key of KEYS) {
            expect(`${key}=${locale[key] ?? ""}`).not.toMatch(/=$/);
        }
    });

    it("sits in the settings tab beside the scripts folder, adding no new command", () => {
        const tab = readFileSync(join(ROOT, "src", "config", "modals", "ZettelFlowSettingsTab.tsx"), "utf8");

        expect(tab).toContain("writeTypeDeclarations()");
        expect(tab.indexOf("scripts_folder_selector_title")).toBeLessThan(tab.indexOf("generate_types_name"));
    });

    it("says what went wrong instead of failing silently", () => {
        const en2 = en as unknown as Record<string, string>;
        expect(en2.generate_types_failed).toContain("{0}");
        expect(en2.generate_types_written).toContain("{0}");
    });
});
