/**
 * The deterministic block-kind → visual-style map for in-canvas legibility (#151, maintainer
 * addendum). Pure & Obsidian-free: it yields the **raw** class suffix + i18n keys; the runtime
 * `WorkflowLegibilityExtension` applies `c(cssClass)` and `t(labelKey)`. Keeping this pure means the
 * "which treatment does each block get" decision is unit-tested, while the DOM toggling stays a thin
 * runtime shell.
 */

import {
    BLOCK_LABEL_KEY,
    classifyNodeBlock,
    type NodeBlockShape,
    type WorkflowBlockKind,
} from "./blocks";

export interface BlockStyle {
    /** Raw class suffix; the runtime prefixes it with `c()`. */
    cssClass: string;
    /** i18n key of the block's label. */
    labelKey: string;
    /** i18n key of the block's in-canvas hover tooltip (absent for ACTION — the default node). */
    tooltipKey?: string;
}

export const BLOCK_STYLE: Record<WorkflowBlockKind, BlockStyle> = {
    when: {
        cssClass: "workflow-block-when",
        labelKey: BLOCK_LABEL_KEY.when,
        tooltipKey: "workflow_canvas_when_tooltip",
    },
    if: {
        cssClass: "workflow-block-if",
        labelKey: BLOCK_LABEL_KEY.if,
        tooltipKey: "workflow_canvas_if_tooltip",
    },
    action: {
        cssClass: "workflow-block-action",
        labelKey: BLOCK_LABEL_KEY.action,
    },
    wait: {
        cssClass: "workflow-block-wait",
        labelKey: BLOCK_LABEL_KEY.wait,
        tooltipKey: "workflow_canvas_wait_tooltip",
    },
};

/** The style for a node, by its classified block kind. */
export function styleForNode(node: NodeBlockShape): BlockStyle {
    return BLOCK_STYLE[classifyNodeBlock(node)];
}

const IF_EDGE_PREFIX = /^if:\s*/i;

/** The IF style for a conditional (`if: …`) edge; `undefined` for a plain edge (no styling). */
export function styleForEdge(tooltip: string | undefined): BlockStyle | undefined {
    return tooltip && IF_EDGE_PREFIX.test(tooltip) ? BLOCK_STYLE.if : undefined;
}
