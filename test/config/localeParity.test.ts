import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * The whole-locale drift guard (#316 S5): `en.ts` and `es.ts` must have the **exact same key set**,
 * and no empty value in either — so a Spanish string can never silently fall back to English (gap #11).
 * The per-feature locale tests check subsets; this one is the superset check in both directions.
 */
describe("locale parity (en ↔ es)", () => {
    const enKeys = Object.keys(en);
    const esKeys = Object.keys(es);

    it("every en key exists in es and every es key exists in en (no drift)", () => {
        const enSet = new Set(enKeys);
        const esSet = new Set(esKeys);
        const missingInEs = enKeys.filter((k) => !esSet.has(k));
        const missingInEn = esKeys.filter((k) => !enSet.has(k));
        expect({ missingInEs, missingInEn }).toEqual({ missingInEs: [], missingInEn: [] });
    });

    it("no locale value is empty", () => {
        const emptyEn = Object.entries(en).filter(([, v]) => String(v).length === 0).map(([k]) => k);
        const emptyEs = Object.entries(es).filter(([, v]) => String(v).length === 0).map(([k]) => k);
        expect({ emptyEn, emptyEs }).toEqual({ emptyEn: [], emptyEs: [] });
    });
});
