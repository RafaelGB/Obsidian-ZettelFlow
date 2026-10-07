/**
 * The labels (#695): which notes earn a name on screen, and where it goes — on **one 2D overlay**,
 * never as a texture per note.
 *
 * The old view made a `SpriteText` per label — a canvas, a texture and a material — every 300 ms
 * for the notes near the camera, and dropped them without disposing any: GPU memory grew for as long
 * as the graph was open. Here a label is a rectangle and a string, chosen fresh each frame from a
 * short ranked list, and drawn by the overlay's 2D context. Nothing is allocated on the GPU at all.
 *
 * Pure: the projection and the text measurement are handed in.
 */

export type LabelDensity = "few" | "more";

/** How many labels each density allows, beside the ones you point at. */
export const LABEL_BUDGET: Record<LabelDensity, { answer: number; rest: number }> = {
    few: { answer: 7, rest: 6 },
    more: { answer: 16, rest: 14 },
};

/** Names longer than this are cut with an ellipsis: a label is a handle, not the title. */
export const LABEL_MAX_CHARS = 34;

export interface LabelSpot {
    x: number;
    y: number;
    /** The dot's radius on screen, so the label sits just above it. */
    r: number;
}

export interface PlacedLabel {
    index: number;
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    /** What you point at or marked: drawn stronger. */
    strong: boolean;
}

export interface LabelInputs {
    hover: number | null;
    marked: Iterable<number>;
    /** The answer's notes, best connected first (ranked once when the answer changes), or `null`. */
    ranked: readonly number[] | null;
    /** Every note, best connected first. */
    hubs: readonly number[];
    density: LabelDensity;
}

/** Who asks for a name, in priority order, each once: pointed at, marked, then the answer or the hubs. */
export function labelCandidates(inputs: LabelInputs): { index: number; strong: boolean }[] {
    const out: { index: number; strong: boolean }[] = [];
    const seen = new Set<number>();
    const push = (index: number, strong: boolean) => {
        if (seen.has(index)) return;
        seen.add(index);
        out.push({ index, strong });
    };
    if (inputs.hover !== null) push(inputs.hover, true);
    for (const i of inputs.marked) push(i, true);
    const budget = LABEL_BUDGET[inputs.density];
    const rest = inputs.ranked ? inputs.ranked.slice(0, budget.answer) : inputs.hubs.slice(0, budget.rest);
    for (const i of rest) push(i, false);
    return out;
}

/** A name, cut to fit a label. */
export function labelText(name: string): string {
    return name.length > LABEL_MAX_CHARS ? `${name.slice(0, LABEL_MAX_CHARS - 1)}…` : name;
}

const LABEL_HEIGHT = 19;
const LABEL_PAD = 12;
const EDGE = 4;

/**
 * Place labels above their dots, first come first served: a label that would overlap one already
 * placed, or leave the view, is skipped rather than drawn on top. `O(k²)` for the `k ≤ 32` labels
 * a frame ever considers.
 */
export function placeLabels(
    candidates: readonly { index: number; strong: boolean }[],
    spot: (index: number) => LabelSpot | null,
    name: (index: number) => string,
    measure: (text: string) => number,
    view: { width: number; height: number }
): PlacedLabel[] {
    const placed: PlacedLabel[] = [];
    for (const candidate of candidates) {
        const at = spot(candidate.index);
        if (!at) continue;
        const text = labelText(name(candidate.index));
        const w = measure(text) + LABEL_PAD;
        const h = LABEL_HEIGHT;
        const x = at.x - w / 2;
        const y = at.y - at.r - 16;
        if (x < EDGE || x + w > view.width - EDGE || y < EDGE || y + h > view.height - EDGE) continue;
        if (placed.some((q) => x < q.x + q.w && x + w > q.x && y < q.y + q.h && y + h > q.y)) continue;
        placed.push({ index: candidate.index, text, x, y, w, h, strong: candidate.strong });
    }
    return placed;
}

export interface RegionSpot {
    x: number;
    y: number;
    /** How far the region spreads on screen, in pixels. */
    span: number;
}

/**
 * Region names, when nothing is asked (#697): over each region, unless the view is so close that
 * the region fills it (then its name says nothing the notes do not) or another name already sits
 * there.
 */
export function placeRegionNames(
    regions: readonly number[],
    spot: (region: number) => RegionSpot | null,
    name: (region: number) => string,
    measure: (text: string) => number,
    view: { width: number; height: number },
    /** Note labels already on screen: a region named after its hub drew its name over the hub's. */
    taken: readonly PlacedLabel[] = []
): PlacedLabel[] {
    const placed: PlacedLabel[] = [];
    const limit = Math.min(view.width, view.height) * 0.3;
    for (const region of regions) {
        const at = spot(region);
        if (!at || at.span > limit) continue;
        const text = name(region).toUpperCase();
        if (!text) continue;
        const w = measure(text) + 8;
        const h = 16;
        const x = at.x - w / 2;
        const y = at.y - 8;
        if (x < 2 || x + w > view.width - 2 || y < 2 || y + h > view.height - 2) continue;
        if ([...placed, ...taken].some((q) => x < q.x + q.w && x + w > q.x && y < q.y + q.h && y + h > q.y)) continue;
        placed.push({ index: region, text, x, y, w, h, strong: false });
    }
    return placed;
}

/** The answer's notes, best connected first, kept to what a frame could ever label. */
export function rankForLabels(lit: Iterable<number>, degree: Float32Array, keep = 32): number[] {
    const top: number[] = [];
    for (const i of lit) {
        if (top.length < keep) {
            top.push(i);
            if (top.length === keep) top.sort((a, b) => degree[b] - degree[a]);
            continue;
        }
        if (degree[i] <= degree[top[keep - 1]]) continue;
        // Insert in order, dropping the last: k is small, so this beats sorting the whole answer.
        let at = keep - 1;
        while (at > 0 && degree[top[at - 1]] < degree[i]) at--;
        top.splice(at, 0, i);
        top.pop();
    }
    if (top.length < keep) top.sort((a, b) => degree[b] - degree[a]);
    return top;
}
