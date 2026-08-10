import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { STEP_PHASES, PHASE_LABEL_KEY, PHASE_DESCRIPTION_KEY } from "zettelkasten/phases";

const UI_KEYS = ["step_builder_phase_title", "step_builder_phase_description", "step_phase_unphased"];

describe("step phase i18n parity (#149, AC-5)", () => {
    const keys = [
        ...STEP_PHASES.map((p) => PHASE_LABEL_KEY[p]),
        ...STEP_PHASES.map((p) => PHASE_DESCRIPTION_KEY[p]),
        ...UI_KEYS,
    ];

    it("defines all 17 phase keys in both en and es", () => {
        expect(keys.length).toBe(17);
        const enMap = en as Record<string, string>;
        const esMap = es as Record<string, string>;
        for (const key of keys) {
            expect(typeof enMap[key]).toBe("string");
            expect(enMap[key].length).toBeGreaterThan(0);
            expect(typeof esMap[key]).toBe("string");
            expect(esMap[key].length).toBeGreaterThan(0);
        }
    });
});
