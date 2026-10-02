/**
 * Load-time migration (#632): fold a legacy per-panel `script` (S6) into the single dashboard-level
 * `computed` field, so old view config keeps working with the one consolidated mechanism. Pure.
 */
import type { DashboardModel } from "./types";

export function migrateDashboard(model: DashboardModel): DashboardModel {
    if (model.computed) return model; // already dashboard-level
    const legacy = model.panels.find((panel) => panel.script?.code?.trim());
    if (!legacy?.script) return model;
    return { ...model, computed: { enabled: legacy.script.enabled, code: legacy.script.code } };
}
