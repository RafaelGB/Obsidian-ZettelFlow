/**
 * The **four ZettelFlow surfaces** and their modes (#272, epic #268 Phase 7) — one obvious front
 * door per job, with the former ~12 sidebar views surviving as modes inside them. Pure data: no
 * `obsidian`, no React, no view import — so the alias/redirect maps derived from it stay unit-testable.
 */

export interface SurfaceMode {
    /** Stable mode id, used in the view state for deep-linking. */
    id: string;
    /** The retired view's type this mode reuses verbatim (its renderer); absent for net-new modes. */
    sourceView?: string;
    /** i18n key of the mode's label in the segmented control (sentence case). */
    labelKey: string;
}

export interface Surface {
    /** The registered `ItemView` type for this surface. */
    viewType: string;
    /** i18n key of the surface title (sentence case). */
    titleKey: string;
    /** The modes, in display order; the first is the default. */
    modes: SurfaceMode[];
}

export const SURFACES: readonly Surface[] = [
    {
        viewType: "zettelflow-home",
        titleKey: "surface_home_title",
        modes: [
            { id: "home", sourceView: "zettelflow-home", labelKey: "surface_mode_home" },
            { id: "recent", sourceView: "zettelflow-history", labelKey: "surface_mode_recent" },
        ],
    },
    {
        viewType: "zettelflow-health",
        titleKey: "surface_health_title",
        modes: [
            { id: "health", sourceView: "zettelflow-slipbox-health", labelKey: "surface_mode_health" },
            { id: "dashboard", sourceView: "zettelflow-knowledge-dashboard", labelKey: "surface_mode_dashboard" },
            { id: "timeline", sourceView: "zettelflow-evolution-timeline", labelKey: "surface_mode_timeline" },
            { id: "momentum", sourceView: "zettelflow-thinking-heatmap", labelKey: "surface_mode_momentum" },
        ],
    },
    {
        viewType: "zettelflow-discovery",
        titleKey: "surface_discovery_title",
        modes: [
            { id: "connections", sourceView: "zettelflow-discoveries", labelKey: "surface_mode_connections" },
            { id: "forgotten", sourceView: "zettelflow-resurface", labelKey: "surface_mode_forgotten" },
            { id: "questions", sourceView: "zettelflow-open-questions", labelKey: "surface_mode_questions" },
            { id: "challenges", sourceView: "zettelflow-evidence-map", labelKey: "surface_mode_challenges" },
        ],
    },
    {
        viewType: "zettelflow-graph",
        titleKey: "surface_graph_title",
        modes: [
            { id: "map", sourceView: "zettelflow-knowledge-map", labelKey: "surface_mode_map" },
            { id: "navigate", sourceView: "zettelflow-concept-nav", labelKey: "surface_mode_navigate" },
            { id: "3d", labelKey: "surface_mode_3d" },
        ],
    },
];

/** Where a retired view now lives: its surface `viewType` + the `mode` id (or `null` if unknown). */
export function locateSourceView(sourceView: string): { surface: string; mode: string } | null {
    for (const surface of SURFACES) {
        for (const mode of surface.modes) {
            if (mode.sourceView === sourceView) return { surface: surface.viewType, mode: mode.id };
        }
    }
    return null;
}

/** The default (first) mode id of a surface, or null if the surface isn't known. */
export function defaultMode(surfaceViewType: string): string | null {
    const surface = SURFACES.find((s) => s.viewType === surfaceViewType);
    return surface ? surface.modes[0].id : null;
}

/** The surface definition for a view type; throws if the type is not a known surface. */
export function surfaceByType(surfaceViewType: string): Surface {
    const surface = SURFACES.find((s) => s.viewType === surfaceViewType);
    if (!surface) throw new Error(`[surface] unknown surface "${surfaceViewType}"`);
    return surface;
}
