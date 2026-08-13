import { describe, it, expect } from "@jest/globals";
import {
    MOC_REGION_START,
    MOC_REGION_END,
    MocLink,
    mergeMocRegion,
    renderMocRegion,
} from "application/notes/mocMerge";

const HEADING = "Notes in this map";

const LINKS: MocLink[] = [
    { path: "notes/alpha", title: "Alpha" },
    { path: "notes/beta", title: "Beta" },
];

describe("renderMocRegion", () => {
    it("produces one wikilink per link, in order", () => {
        const region = renderMocRegion(LINKS, HEADING);
        expect(region).toBe(`## ${HEADING}\n\n- [[notes/alpha|Alpha]]\n- [[notes/beta|Beta]]\n`);
    });

    it("renders just the heading for an empty link set", () => {
        expect(renderMocRegion([], HEADING)).toBe(`## ${HEADING}\n\n`);
    });
});

describe("mergeMocRegion", () => {
    it("AC-3: replaces only the managed region, preserving prose before and after", () => {
        const body = [
            "# My map",
            "",
            "Intro prose the user wrote.",
            "",
            MOC_REGION_START,
            "## Old heading",
            "",
            "- [[stale|Stale]]",
            MOC_REGION_END,
            "",
            "Footer prose the user wrote.",
            "",
        ].join("\n");

        const merged = mergeMocRegion(body, LINKS, HEADING);

        // Surrounding prose survives untouched.
        expect(merged).toContain("Intro prose the user wrote.");
        expect(merged).toContain("Footer prose the user wrote.");
        // The stale link is gone and the new links are inside.
        expect(merged).not.toContain("[[stale|Stale]]");
        expect(merged).toContain("- [[notes/alpha|Alpha]]");
        expect(merged).toContain("- [[notes/beta|Beta]]");
        // Exactly one managed region remains.
        expect(merged.split(MOC_REGION_START)).toHaveLength(2);
        expect(merged.split(MOC_REGION_END)).toHaveLength(2);
    });

    it("AC-4: is idempotent", () => {
        const body = [
            "# My map",
            "",
            "Intro prose.",
            "",
            MOC_REGION_START,
            "## Old",
            "",
            "- [[stale|Stale]]",
            MOC_REGION_END,
            "",
            "Footer prose.",
            "",
        ].join("\n");

        const once = mergeMocRegion(body, LINKS, HEADING);
        const twice = mergeMocRegion(once, LINKS, HEADING);
        expect(twice).toBe(once);
    });

    it("AC-4: is idempotent when starting from a body with no region", () => {
        const body = "# My map\n\nSome prose.\n";
        const once = mergeMocRegion(body, LINKS, HEADING);
        const twice = mergeMocRegion(once, LINKS, HEADING);
        expect(twice).toBe(once);
    });

    it("AC-5: appends the region when the body has prose but no markers", () => {
        const body = "# My map\n\nSome prose the user wrote.\n";
        const merged = mergeMocRegion(body, LINKS, HEADING);

        expect(merged).toContain("Some prose the user wrote.");
        expect(merged).toContain(MOC_REGION_START);
        expect(merged).toContain(MOC_REGION_END);
        expect(merged).toContain("- [[notes/alpha|Alpha]]");
        // Exactly one blank line separates the prose from the region.
        expect(merged).toContain("Some prose the user wrote.\n\n" + MOC_REGION_START);
        // File ends with a trailing newline.
        expect(merged.endsWith("\n")).toBe(true);
    });

    it("collapses extra trailing whitespace to a single blank line before the region", () => {
        const body = "Prose.\n\n\n\n";
        const merged = mergeMocRegion(body, LINKS, HEADING);
        expect(merged).toContain("Prose.\n\n" + MOC_REGION_START);
    });

    it("creates a clean region from an empty body", () => {
        const merged = mergeMocRegion("", LINKS, HEADING);
        const expected = `${MOC_REGION_START}\n${renderMocRegion(LINKS, HEADING)}${MOC_REGION_END}\n`;
        expect(merged).toBe(expected);
    });

    it("creates a clean region from a whitespace-only body", () => {
        const merged = mergeMocRegion("   \n\n", LINKS, HEADING);
        const expected = `${MOC_REGION_START}\n${renderMocRegion(LINKS, HEADING)}${MOC_REGION_END}\n`;
        expect(merged).toBe(expected);
    });
});
