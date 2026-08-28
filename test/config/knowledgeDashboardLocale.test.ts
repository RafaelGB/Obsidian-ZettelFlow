import { describe, it, expect } from "@jest/globals";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

// The dashboard panels/metrics/recommendations are now rendered by the Health mode (#314); its own
// chrome + toolkit keys were removed with the standalone renderer, so only these live keys remain.
const KEYS = [
    // command alias (1) — still registered as a Health redirect
    "command_show_knowledge_dashboard",
    // panels (3)
    "knowledge_dashboard_panel_connectivity",
    "knowledge_dashboard_panel_debt",
    "knowledge_dashboard_panel_today",
    // metrics (8)
    "knowledge_dashboard_metric_connected",
    "knowledge_dashboard_metric_orphaned",
    "knowledge_dashboard_metric_unresolved",
    "knowledge_dashboard_metric_score",
    "knowledge_dashboard_metric_process",
    "knowledge_dashboard_metric_contradictions",
    "knowledge_dashboard_metric_connections",
    "knowledge_dashboard_metric_questions",
    // bands (3)
    "knowledge_dashboard_band_low",
    "knowledge_dashboard_band_medium",
    "knowledge_dashboard_band_high",
    // recommendation tokens (9)
    "knowledge_dashboard_rec_connect_orphans",
    "knowledge_dashboard_rec_all_connected",
    "knowledge_dashboard_rec_reduce_debt",
    "knowledge_dashboard_rec_debt_clear",
    "knowledge_dashboard_rec_resolve_contradictions",
    "knowledge_dashboard_rec_answer_questions",
    "knowledge_dashboard_rec_process_ideas",
    "knowledge_dashboard_rec_make_connections",
    "knowledge_dashboard_rec_all_clear",
];

describe("knowledge dashboard i18n parity (#171)", () => {
    it("defines all 24 keys in both en and es, non-empty", () => {
        expect(KEYS.length).toBe(24);
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
