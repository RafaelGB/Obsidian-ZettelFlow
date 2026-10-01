import { describe, it, expect } from "@jest/globals";
import { migrateDashboard } from "dashboards/panels";
import type { DashboardModel } from "dashboards/panels";

function withLegacyScript(code: string, enabled = true): DashboardModel {
    return { panels: [{ id: "p", type: "stat", mapping: {}, script: { enabled, code } }] };
}

describe("legacy per-panel script alias (#632, OQ1 — no visible breakage)", () => {
    it("folds a legacy per-panel script into the dashboard-level computed field", () => {
        const migrated = migrateDashboard(withLegacyScript("return rows.map(r => ({ ...r, score: 1 }))"));
        expect(migrated.computed).toEqual({ enabled: true, code: "return rows.map(r => ({ ...r, score: 1 }))" });
    });

    it("leaves a model that already defines computed fields untouched", () => {
        const model: DashboardModel = { ...withLegacyScript("return rows"), computed: { enabled: false, code: "keep" } };
        expect(migrateDashboard(model).computed).toEqual({ enabled: false, code: "keep" });
    });

    it("is a no-op when no panel carries a legacy script", () => {
        expect(migrateDashboard({ panels: [{ id: "p", type: "stat", mapping: {} }] }).computed).toBeUndefined();
    });

    it("migrates a row-reducing legacy script as-is (documented behaviour shift, not silently dropped)", () => {
        const migrated = migrateDashboard(withLegacyScript("return rows.filter(r => r['note.n'] > 3)"));
        expect(migrated.computed?.code).toContain("filter");
    });
});
