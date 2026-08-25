import { locateSourceView } from "./surfaceRegistry";

/**
 * Back-compat maps (#272) so nothing breaks when the ~12 views collapse into 4 surfaces (§XI):
 * every retired opener **command** and every retired **view type** resolves to the surface + mode it
 * now lives in. Derived from the pure {@link locateSourceView} registry — no `obsidian`, no view import.
 */

export interface SurfaceTarget {
    surface: string;
    mode: string;
}

/** Retired opener command id → the source view it used to open. */
const COMMAND_SOURCE: Record<string, string> = {
    "show-home": "zettelflow-home",
    "show-notes-history": "zettelflow-history",
    "show-slipbox-health": "zettelflow-slipbox-health",
    "show-knowledge-dashboard": "zettelflow-knowledge-dashboard",
    "show-evolution-timeline": "zettelflow-evolution-timeline",
    "show-thinking-heatmap": "zettelflow-thinking-heatmap",
    "show-discoveries": "zettelflow-discoveries",
    "resurface-related-notes": "zettelflow-resurface",
    "show-open-questions": "zettelflow-open-questions",
    "show-evidence-map": "zettelflow-evidence-map",
    "show-knowledge-map": "zettelflow-knowledge-map",
    "show-concept-nav": "zettelflow-concept-nav",
};

/** Old view types that become thin redirects — every source view except the retained `zettelflow-home`. */
const REDIRECT_VIEW_TYPES = [
    "zettelflow-history",
    "zettelflow-slipbox-health",
    "zettelflow-knowledge-dashboard",
    "zettelflow-evolution-timeline",
    "zettelflow-thinking-heatmap",
    "zettelflow-discoveries",
    "zettelflow-resurface",
    "zettelflow-open-questions",
    "zettelflow-evidence-map",
    "zettelflow-knowledge-map",
    "zettelflow-concept-nav",
];

// The retired 2D Graph views (#280): the surface is now 3D-only, so their aliases open the 3D mode.
const RETIRED_TO_GRAPH_3D: Record<string, SurfaceTarget> = {
    "zettelflow-knowledge-map": { surface: "zettelflow-graph", mode: "3d" },
    "zettelflow-concept-nav": { surface: "zettelflow-graph", mode: "3d" },
};

function resolve(sourceView: string): SurfaceTarget {
    const located = locateSourceView(sourceView);
    if (located) return located;
    const retired = RETIRED_TO_GRAPH_3D[sourceView];
    if (retired) return retired;
    throw new Error(`[surface] no surface hosts the view "${sourceView}"`);
}

/** Retired opener command id → (surface, mode) it should now open. */
export const LEGACY_OPEN_TARGETS: Record<string, SurfaceTarget> = Object.fromEntries(
    Object.entries(COMMAND_SOURCE).map(([command, sourceView]) => [command, resolve(sourceView)])
);

/** Old (now unregistered-as-primary) view type → (surface, mode) a redirect leaf should open. */
export const LEGACY_VIEW_TARGETS: Record<string, SurfaceTarget> = Object.fromEntries(
    REDIRECT_VIEW_TYPES.map((viewType) => [viewType, resolve(viewType)])
);
