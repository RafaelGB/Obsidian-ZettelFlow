import { locateSourceView } from "./surfaceRegistry";

/**
 * Back-compat maps (#272) so nothing breaks when the ~12 views collapse into 4 surfaces (§XI):
 * every retired opener **command** and every retired **view type** resolves to the surface + mode it
 * now lives in. Derived from the pure {@link locateSourceView} registry — no `obsidian`, no view import.
 */

export interface SurfaceTarget {
    surface: string;
    mode: string;
    /** Extra view state the door asks for — the graph doors land on Explore's graph lens (#484). */
    lens?: string;
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
    // The Graph surface itself, since #484: a workspace saved before the merge still holds leaves
    // of this type, and they must open Explore rather than an empty pane.
    "zettelflow-graph",
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

// Retired modes whose source view no longer hosts a mode, mapped to where they live now: every
// graph door opens Explore, where the graph is a lens (#484); the Dashboard merged into Health (#314).
const EXPLORE: SurfaceTarget = { surface: "zettelflow-discovery", mode: "ask", lens: "graph" };
const RETIRED_TARGETS: Record<string, SurfaceTarget> = {
    "zettelflow-graph": EXPLORE,
    "zettelflow-knowledge-map": EXPLORE,
    "zettelflow-concept-nav": EXPLORE,
    "zettelflow-knowledge-dashboard": { surface: "zettelflow-health", mode: "health" },
};

function resolve(sourceView: string): SurfaceTarget {
    const located = locateSourceView(sourceView);
    if (located) return located;
    const retired = RETIRED_TARGETS[sourceView];
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
