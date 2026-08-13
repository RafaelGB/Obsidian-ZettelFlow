import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "community_system_preview",
    "community_system_contents",
    "community_system_install_location",
    "community_system_install_location_desc",
    "community_system_install_button",
    "community_system_installed",
    "community_system_install_error",
];

describe("community system modal i18n parity (#214, AC-6)", () => {
    it("defines all 7 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(7);
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
