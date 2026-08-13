import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "command_remove_relation",
    "remove_relation_modal_title",
    "remove_relation_none",
    "remove_relation_confirm_question",
    "remove_relation_confirm_accept",
    "remove_relation_confirm_cancel",
    "remove_relation_removed",
    "remove_relation_noop",
    "remove_relation_error",
];

describe("remove-relation command i18n parity (#181)", () => {
    it("defines all 9 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(9);
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
