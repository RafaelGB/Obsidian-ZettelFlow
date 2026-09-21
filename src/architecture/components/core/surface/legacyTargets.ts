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
    // And the Discovery surface, since #504, for the same reason.
    "zettelflow-discovery",
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
const EXPLORE: SurfaceTarget = { surface: "zettelflow-explore", mode: "explore", lens: "graph" };
/** What to do next. Home has answered this all along — Discovery was the second place (#504). */
const HOME: SurfaceTarget = { surface: "zettelflow-home", mode: "home" };
/** What is around the note you are reading: its history, what contradicts it, what is unrevisited. */
const THIS_NOTE: SurfaceTarget = { surface: "zettelflow-health", mode: "timeline" };
const RETIRED_TARGETS: Record<string, SurfaceTarget> = {
    "zettelflow-graph": EXPLORE,
    "zettelflow-knowledge-map": EXPLORE,
    "zettelflow-concept-nav": EXPLORE,
    "zettelflow-knowledge-dashboard": { surface: "zettelflow-health", mode: "health" },
    // The wizard's note history, then the write record's panel that replaced it, then nothing
    // (#511): the undo it existed for is offered in the moment now. Home is where it pointed.
    "zettelflow-history": HOME,
    // Discovery, dissolved (#504): two of its modes were recommendations, two were about the
    // note you had open, and each half already had somewhere to be.
    "zettelflow-discovery": HOME,
    "zettelflow-discoveries": HOME,
    "zettelflow-open-questions": HOME,
    "zettelflow-resurface": THIS_NOTE,
    "zettelflow-evidence-map": THIS_NOTE,
};

/**
 * A mode that moved house (#487), keyed `"<surface>:<mode>"`.
 *
 * A workspace saved before Explore got its own surface still holds a Discovery leaf asking for
 * the `ask` mode. Without this it would open Discovery and quietly show Connections instead —
 * the failure that looks like nothing went wrong, which is the worst kind.
 */
export const RELOCATED_MODES: Record<string, SurfaceTarget> = {
    "zettelflow-discovery:ask": { surface: "zettelflow-explore", mode: "explore", lens: undefined },
    // The four modes of the dissolved surface (#504), for a workspace saved before it went.
    "zettelflow-discovery:connections": HOME,
    "zettelflow-discovery:questions": HOME,
    "zettelflow-discovery:forgotten": THIS_NOTE,
    "zettelflow-discovery:challenges": THIS_NOTE,
};

/** Where a mode this surface no longer has went, or `null` if it never existed. */
export function relocateMode(surface: string, mode: string): SurfaceTarget | null {
    return RELOCATED_MODES[`${surface}:${mode}`] ?? null;
}

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
