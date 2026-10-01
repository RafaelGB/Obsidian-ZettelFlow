/**
 * Register the "Dashboard" Bases view (epic #622, S1 #623).
 *
 * `registerBasesView` is the Bases door (`obsidian.d.ts` L5009) — not `registerView` (the
 * `BasesView` doc-comment there is stale). It is guarded by a `typeof` check so an older Obsidian
 * without the Bases API loads the plugin gracefully instead of throwing (the Canvas-patch lesson).
 */
import { Plugin } from "obsidian";
import { t } from "architecture/lang";
import { log } from "architecture";
import { DASHBOARD_VIEW_TYPE, DashboardBasesView } from "./DashboardBasesView";

export function registerDashboardBasesView(plugin: Plugin): void {
    if (typeof plugin.registerBasesView !== "function") {
        log.warn("Bases view API unavailable; the dashboard view was not registered");
        return;
    }
    plugin.registerBasesView(DASHBOARD_VIEW_TYPE, {
        name: t("dashboard_view_name"),
        icon: "bar-chart-3",
        factory: (controller, containerEl) => new DashboardBasesView(controller, containerEl),
    });
}
