/**
 * Which canvas popup actions apply to what is selected (#432) — pure.
 *
 * Obsidian reuses the **same** popup element across selections, and each extension only ever added
 * its own button: selecting an edge and then a node left *Edit condition* on the node, and the
 * mirror image left *Edit ZettelFlow Step* on the edge — which, clicked, opened the editor for
 * whatever node had been selected before.
 *
 * Two extensions each deciding "does this apply to me?" is what let them disagree. They now ask the
 * same function, and each removes its own button before re-adding it.
 */

export interface CanvasSelection {
    /** How many elements are selected. Both actions operate on exactly one. */
    size: number;
    /** The selected element's shape: a canvas node type, or `"edge"`. */
    kind: string | undefined;
    /** A file node whose note already is a step (#686) — its step lives in that note. */
    stepNote?: boolean;
}

export interface PopupMenuOptions {
    /** Edit the step: held on a text or group node, or in the note a file node shows. */
    step: boolean;
    /** Edit the condition on an edge. */
    condition: boolean;
    /** Copy a whole selection of nodes — the only action that wants more than one. */
    copyFlow: boolean;
}

const NONE: PopupMenuOptions = { step: false, condition: false, copyFlow: false };

export function popupMenuOptions(selection: CanvasSelection): PopupMenuOptions {
    // Copying is the one action that wants a group of nodes rather than a subject.
    if (selection.size > 1) return { ...NONE, copyFlow: true };
    // An empty selection has no subject at all.
    if (selection.size !== 1 || !selection.kind) return NONE;

    switch (selection.kind) {
        case "edge":
            return { ...NONE, condition: true };
        case "text":
        case "group":
            // These carry `zettelflowConfig` — the step lives on the node itself.
            return { ...NONE, step: true };
        case "file":
            // A file node's step lives in its note's frontmatter (#686). It used to be edited only
            // from the file menu, so the popup offered nothing on the one node kind whose step a
            // person most often wants to open from the canvas.
            return selection.stepNote ? { ...NONE, step: true } : NONE;
        default:
            // Anything else is a shape we do not configure.
            return NONE;
    }
}
