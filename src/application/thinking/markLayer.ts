/**
 * The layer a mark was made on (#758, epic #742): three, closed, the one vocabulary of every mark —
 * a highlight, a margin note, a page note and ink (#745) alike.
 *
 * Each pass through a book keeps its own ink: what you mark the first time, what you write after,
 * the sources you chase. A mark made before layers existed is on the reading layer, and nothing is
 * rewritten for it; the reading layer is never written down, so an old file stays byte for byte.
 */
import type { Thought } from "./thought";

export const MARK_LAYERS = ["reading", "reflection", "research"] as const;
export type MarkLayer = (typeof MARK_LAYERS)[number];

export const DEFAULT_LAYER: MarkLayer = "reading";

export function isLayer(value: unknown): value is MarkLayer {
    return typeof value === "string" && (MARK_LAYERS as readonly string[]).includes(value);
}

/** A mark's layer; one with none, or one this build does not know, is on the reading layer. */
export function layerOf(thought: Pick<Thought, "layer">): MarkLayer {
    return isLayer(thought.layer) ? thought.layer : DEFAULT_LAYER;
}
