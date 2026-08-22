import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { SURFACES } from "architecture/components/core/surface/surfaceRegistry";

/** Every surface title + mode label the registry references must exist, non-empty, in both locales (#272, AC-7). */
const KEYS = SURFACES.flatMap((s) => [s.titleKey, ...s.modes.map((m) => m.labelKey)]);

describe("surface i18n keys (#272)", () => {
    const enMap = en as Record<string, string>;
    const esMap = es as Record<string, string>;

    it("references 4 titles + 13 mode labels (Graph gained the net-new 3D mode, #280)", () => {
        expect(KEYS).toHaveLength(17);
    });

    it("defines every surface/mode key in both en and es, non-empty", () => {
        for (const key of KEYS) {
            expect(typeof enMap[key]).toBe("string");
            expect(enMap[key].length).toBeGreaterThan(0);
            expect(typeof esMap[key]).toBe("string");
            expect(esMap[key].length).toBeGreaterThan(0);
        }
    });

    it("uses sentence case (no ALL-CAPS labels)", () => {
        for (const key of KEYS) {
            expect(enMap[key]).not.toMatch(/^[A-Z]{2,}/);
            expect(esMap[key]).not.toMatch(/^[A-Z]{2,}/);
        }
    });
});
