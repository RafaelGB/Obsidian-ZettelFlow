import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "knowledge_map_view_title",
    "command_show_knowledge_map",
    "knowledge_map_indexing",
    "knowledge_map_empty",
    "knowledge_map_error",
    "knowledge_map_refresh_button",
    "knowledge_map_unclustered_heading",
    "knowledge_map_member_count",
    "settings_toolkit_map_name",
    "settings_toolkit_map_desc",
];

describe("knowledge map i18n parity (#164)", () => {
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
