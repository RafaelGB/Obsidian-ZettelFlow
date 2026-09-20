/**
 * The **three ZettelFlow surfaces** and their modes (#272, epic #268 Phase 7) — one obvious front
 * door per job, with the former ~12 sidebar views surviving as modes inside them. Pure data: no
 * `obsidian`, no React, no view import — so the alias/redirect maps derived from it stay unit-testable.
 *
 * #484 absorbed the Graph surface — it hosted **one** mode, answering *what shape is my knowledge?*
 * while Explore answered *which notes match this?*, the same question asked twice with no way to
 * carry an answer across. The graph is a **lens** now.
 *
 * #487 then gave Explore its own room. Discovery's four modes are narrow lists that belong in a
 * side panel; Explore is facets, chips, an answer and a 3D graph, and a mode cannot be moved out
 * of a pane without taking the four lists with it. So the count went 4 → 3 → 4 — and the honest
 * reading is *the Graph surface was absorbed and Explore took its place*, not that a box was
 * saved. The principle was never "fewer boxes": it is one home per capability, and no two places
 * answering the same question.
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
            { id: "cultivate", labelKey: "surface_mode_cultivate" },
            { id: "recent", sourceView: "zettelflow-history", labelKey: "surface_mode_recent" },
            // The Thought Lab (#467) is a mode, not a view: ModeHostView already owns the
            // switching, the deep links and the lifecycle, and a fourth leaf type would be
            // exactly the addition subtraction exists to refuse.
            { id: "lab", labelKey: "surface_mode_lab" },
        ],
    },
    {
        viewType: "zettelflow-health",
        titleKey: "surface_health_title",
        modes: [
            { id: "health", sourceView: "zettelflow-slipbox-health", labelKey: "surface_mode_health" },
            { id: "timeline", sourceView: "zettelflow-evolution-timeline", labelKey: "surface_mode_timeline" },
            { id: "momentum", sourceView: "zettelflow-thinking-heatmap", labelKey: "surface_mode_momentum" },
            { id: "agency", labelKey: "surface_mode_agency" },
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
        viewType: "zettelflow-explore",
        titleKey: "surface_explore_title",
        // One mode, and therefore no mode bar (see ModeHostView): a bar offering one choice is not
        // a choice. Explore's own lens bar is where the switching that matters happens.
        modes: [{ id: "explore", labelKey: "surface_mode_ask" }],
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
