import { projectPoint, type Camera } from "./graphCamera";

/** How close the pointer must be to a dot, in pixels, for it to count as on it. */
export const PICK_RADIUS = 14;

/**
 * The note under the pointer (#693, #695): the nearest dot within reach, measured with the very
 * matrix the GPU draws with, so a click lands on the note you see. A bigger note reaches a little
 * further. Invisible notes (time, #697) are never picked; while an answer is up, only its notes are.
 *
 * Pure and `O(n)` — ten thousand projections are a fraction of a millisecond, which is why there is
 * no picking buffer to keep in step with the scene.
 */
export function pickNearest(
    matrix: Float32Array,
    camera: Camera,
    positions: Float32Array,
    alpha: Float32Array,
    degree: Float32Array,
    n: number,
    x: number,
    y: number,
    view: { width: number; height: number },
    restrict: ReadonlySet<number> | null
): number | null {
    let best: number | null = null;
    let bestD = PICK_RADIUS;
    for (let i = 0; i < n; i++) {
        if (alpha[i * 4 + 3] < 0.004) continue;
        if (restrict && !restrict.has(i)) continue;
        const p = projectPoint(matrix, camera, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], view.width, view.height);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.y - y) - Math.sqrt(degree[i]);
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    return best;
}
