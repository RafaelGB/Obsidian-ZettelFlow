import type { LayoutInput } from "./layoutCore";

/** What the view tells the layout worker (#694). */
export type LayoutMessage = { type: "start"; id: number; input: LayoutInput } | { type: "stop" };

/** What the worker answers: positions so far, and whether the layout has settled. */
export interface LayoutReply {
    type: "positions";
    id: number;
    positions: Float32Array;
    done: boolean;
    ticks: number;
}

/** How long one slice of ticks runs in the worker before the positions are posted and it yields. */
export const LAYOUT_SLICE_MS = 14;
/** How long one slice of layout ticks runs on the main thread: short enough to keep frames smooth. */
export const MAIN_THREAD_SLICE_MS = 6;
