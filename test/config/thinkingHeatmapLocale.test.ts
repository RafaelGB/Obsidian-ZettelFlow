import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

const KEYS = [
    "thinking_heatmap_view_title",
    "thinking_heatmap_empty",
    "thinking_heatmap_error",
    "thinking_heatmap_refresh_button",
    "thinking_heatmap_legend_less",
    "thinking_heatmap_legend_more",
    "thinking_heatmap_summary",
    "thinking_heatmap_cell_label",
    "command_show_thinking_heatmap",
    "settings_journal_heading",
    "settings_journal_intro",
    "settings_journal_enable_name",
    "settings_journal_enable_desc",
    "settings_journal_disclosure",
    "settings_toolkit_heatmap_name",
    "settings_toolkit_heatmap_desc",
];

describe("thinking heatmap i18n parity (#162, AC-5)", () => {
    it("defines all 16 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(16);
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
