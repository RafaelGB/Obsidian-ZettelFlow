import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "starter_flows_literature_to_permanent_name",
    "starter_flows_literature_to_permanent_description",
];

describe("literature-to-permanent starter flow i18n parity (#157, AC-6)", () => {
    it("defines the new flow's modal keys in both en and es, non-empty", () => {
        const enMap = en as Record<string, string>;
        const esMap = es as Record<string, string>;
        for (const key of KEYS) {
            expect(typeof enMap[key]).toBe("string");
            expect(enMap[key].length).toBeGreaterThan(0);
            expect(typeof esMap[key]).toBe("string");
            expect(esMap[key].length).toBeGreaterThan(0);
        }
    });
});
