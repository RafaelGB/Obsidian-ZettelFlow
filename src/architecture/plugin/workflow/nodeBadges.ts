/**
 * What a node **does**, readable without opening it (#429, epic #422) — pure.
 *
 * #151 marks three kinds on the canvas (WHEN, IF, WAIT). Everything else a step does — the three
 * questions it asks, the template it writes, the linked note it creates, the fact that it can be
 * skipped, the exits it gates — was only discoverable by opening the editor, one node at a time.
 *
 * Nothing here is stored: a badge is derived from the settings the step already has, so removing
 * this leaves every flow byte-identical (FR-5, FR-7).
 */

import type { NodeBlockShape } from "./blocks";

export type NodeBadgeKind = "start" | "asks" | "template" | "satellite" | "optional" | "gated";

export interface NodeBadge {
    kind: NodeBadgeKind;
    /** i18n key of the badge's sentence-case label; the runtime does the `t()` lookup. */
    labelKey: string;
    /** How many, when the badge counts something (the questions a step asks). */
    count?: number;
}

/** i18n key per badge kind. Pure data. */
export const NODE_BADGE_LABEL_KEY: Record<NodeBadgeKind, string> = {
    start: "node_badge_start",
    asks: "node_badge_asks",
    template: "node_badge_template",
    satellite: "node_badge_satellite",
    optional: "node_badge_optional",
    gated: "node_badge_gated",
};

/** The settings a badge can be derived from — a superset of what {@link NodeBlockShape} needs. */
export interface NodeBadgeShape extends NodeBlockShape {
    actions?: { hasUI?: boolean }[];
    body?: string;
    satellite?: unknown;
    optional?: boolean;
    exits?: Record<string, { when?: string }>;
}

/**
 * What this step does, in reading order: that the flow starts here, what it asks, what it writes,
 * what it also creates, that it can be skipped, and that some of its exits are conditional. A step
 * that does none of these gets no badges at all — an empty strip is noise, not information.
 */
export function nodeBadges(step: NodeBadgeShape | undefined): NodeBadge[] {
    if (!step) return [];
    const badges: NodeBadge[] = [];

    // Which box starts the flow is the first thing you look for on someone else's canvas, and a
    // root without an event trigger is not a WHEN block — so nothing on the canvas said it.
    if (step.root) badges.push({ kind: "start", labelKey: NODE_BADGE_LABEL_KEY.start });
    const asks = (step.actions ?? []).filter((action) => action?.hasUI).length;
    if (asks > 0) badges.push({ kind: "asks", labelKey: NODE_BADGE_LABEL_KEY.asks, count: asks });
    if (step.body?.trim()) badges.push({ kind: "template", labelKey: NODE_BADGE_LABEL_KEY.template });
    if (step.satellite) badges.push({ kind: "satellite", labelKey: NODE_BADGE_LABEL_KEY.satellite });
    if (step.optional) badges.push({ kind: "optional", labelKey: NODE_BADGE_LABEL_KEY.optional });
    if (Object.values(step.exits ?? {}).some((exit) => exit?.when?.trim())) {
        badges.push({ kind: "gated", labelKey: NODE_BADGE_LABEL_KEY.gated });
    }

    return badges;
}
