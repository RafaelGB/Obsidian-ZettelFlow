import { describe, it, expect } from "@jest/globals";
import { t, tCount } from "architecture/lang";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * **A count has a form** (#546 D2).
 *
 * The 3D graph's status line read *"1 gaps"* right next to *"1 notes"*, in both languages, and the
 * legend agreed with it. A count is the one kind of string that cannot be written once and be
 * right, so the convention is: the plural lives under `key`, and the singular — when it differs —
 * under `key_one`. A key with no `_one` sibling keeps its one form, which is correct for the many
 * strings where the count is never one.
 *
 * Two numbers in one string is the shape this deliberately does **not** support: it needs four
 * forms per language and three of them are always wrong somewhere. A row with two counts composes
 * two phrases instead, which is what the seam rows do.
 */
describe("tCount picks the form the number needs", () => {
    it("uses the singular for exactly one", () => {
        expect(tCount(1, "graph3d_status_gaps", "1")).toBe(en.graph3d_status_gaps_one);
        expect(tCount(1, "graph3d_status_notes_count", "1")).toBe(en.graph3d_status_notes_count_one);
    });

    it("uses the plural for none, for many, and for a number it cannot read as one", () => {
        expect(tCount(0, "graph3d_status_gaps", "0")).toBe("0 gaps");
        expect(tCount(2, "graph3d_status_gaps", "2")).toBe("2 gaps");
        expect(tCount(217, "graph3d_status_gaps", "217")).toBe("217 gaps");
    });

    it("treats minus one as one, because the form follows the word, not the sign", () => {
        expect(tCount(-1, "graph3d_status_gaps", "-1")).toBe(en.graph3d_status_gaps_one);
    });

    it("falls back to the one form a key has, when it has only one", () => {
        // Most strings never take a singular, and adding an empty `_one` for each would be the
        // ceremony this convention exists to avoid.
        expect(tCount(1, "graph3d_status_drawn", "1")).toBe(t("graph3d_status_drawn", "1"));
        expect(tCount(5, "graph3d_status_drawn", "5")).toBe("5 drawn");
    });
});

describe("both languages have both forms", () => {
    /**
     * `_one` means *the singular of* -- with one exception, which is named rather than quietly
     * skipped: `selectable_search_remove_one` is an aria-label for removing **one option**
     * (`Remove {0}`), and its sibling `selectable_search_remove_all` is a different action, not a
     * plural. The suffix predates the convention and renaming it is not worth a diff across the
     * component; declaring it here is.
     */
    const NOT_A_COUNT = ["selectable_search_remove_one"];
    const pairs = Object.keys(en).filter((key) => key.endsWith("_one") && !NOT_A_COUNT.includes(key));

    it("has count pairs at all", () => {
        expect(pairs.length).toBeGreaterThan(2);
    });

    it("gives every singular a plural to fall back to, in both locales", () => {
        const table = { en, es } as unknown as Record<string, Record<string, string>>;
        const broken: string[] = [];
        for (const [locale, strings] of Object.entries(table)) {
            for (const singular of pairs) {
                const base = singular.slice(0, -"_one".length);
                if (!strings[base]) broken.push(`${locale}: ${singular} has no ${base}`);
                if (!strings[singular]) broken.push(`${locale}: missing ${singular}`);
            }
        }
        expect(broken).toEqual([]);
    });

    it("has a singular that is actually different from its plural", () => {
        // A `_one` identical to its base is dead weight: the fallback would render the same text.
        const table = { en, es } as unknown as Record<string, Record<string, string>>;
        const pointless: string[] = [];
        for (const [locale, strings] of Object.entries(table)) {
            for (const singular of pairs) {
                const base = singular.slice(0, -"_one".length);
                if (strings[singular] === strings[base]) pointless.push(`${locale}: ${singular}`);
            }
        }
        expect(pointless).toEqual([]);
    });
});
