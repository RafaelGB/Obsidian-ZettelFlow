import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

/**
 * Global i18n guard (#246 C3). The per-feature parity tests each cover their own keys; this catches
 * ANY drift across the whole locale — a missing translation is a real Obsidian-score / reliability
 * cost, and it's the kind of thing that slips in on a large refactor. en and es must define exactly the
 * same keys, all non-empty.
 */
describe("locale parity — en / es (#246 C3)", () => {
    const enKeys = Object.keys(en);
    const esKeys = Object.keys(es);

    it("define exactly the same keys", () => {
        const missingInEs = enKeys.filter((key) => !(key in es));
        const missingInEn = esKeys.filter((key) => !(key in en));
        expect({ missingInEs, missingInEn }).toEqual({ missingInEs: [], missingInEn: [] });
    });

    it("have no empty values in either locale", () => {
        const enMap = en as Record<string, string>;
        const esMap = es as Record<string, string>;
        const emptyEn = enKeys.filter((key) => typeof enMap[key] !== "string" || enMap[key].length === 0);
        const emptyEs = esKeys.filter((key) => typeof esMap[key] !== "string" || esMap[key].length === 0);
        expect({ emptyEn, emptyEs }).toEqual({ emptyEn: [], emptyEs: [] });
    });
});
