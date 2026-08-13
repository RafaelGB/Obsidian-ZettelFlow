import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "command_install_methodology_package",
    "command_uninstall_methodology_package",
    "methodology_package_installed_notice",
    "methodology_package_already_installed",
    "methodology_package_removed_notice",
    "methodology_package_not_installed",
    "methodology_package_install_error",
    "methodology_package_uninstall_error",
    "settings_toolkit_packages_name",
    "settings_toolkit_packages_desc",
];

describe("methodology packages i18n parity (#174)", () => {
    it("defines all 10 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(10);
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
