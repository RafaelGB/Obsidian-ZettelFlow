/**
 * The camera (#693, epic #692) — one orbit camera for 3D and a top-down sheet for the flat view,
 * as **pure** numbers so the GPU and the CPU agree on where a note is.
 *
 * The GPU draws with {@link viewProjection}; the picker, the labels and the peek card ask
 * {@link projectPoint} with the very same matrix. Two projections that had to be kept in step by
 * hand is how a click lands on the note beside the one under the cursor.
 */

export interface Camera {
    /** Rotation around the vertical axis, radians. */
    yaw: number;
    /** Elevation, radians, clamped short of the poles. */
    pitch: number;
    /** Distance from the target (3D), or the zoom level of the sheet (flat). */
    dist: number;
    /** What the camera looks at. */
    tx: number;
    ty: number;
    tz: number;
    /** Top-down sheet instead of perspective — the flat view, and mobile (#698). */
    flat: boolean;
}

export type CameraGoal = Partial<Pick<Camera, "yaw" | "pitch" | "dist" | "tx" | "ty" | "tz">>;

/** Where a point lands on screen, how deep it is, and how many pixels one world unit covers there. */
export interface Projected {
    x: number;
    y: number;
    depth: number;
    scale: number;
}

export const PITCH_LIMIT = 1.45;
export const MIN_DIST = 60;
/** The field of view across the **shorter** side of the view, so a tall pane frames like a wide one. */
const FOV_MIN = 2 * Math.atan(0.526);
const NEAR = 4;
const FAR = 40_000;
/** Pixels per world unit of the flat sheet at `dist = 820`, matching the 3D framing at that distance. */
const FLAT_SCALE = 820 * 1.05;

export function defaultCamera(flat = false): Camera {
    return { yaw: 0.6, pitch: -0.32, dist: 820, tx: 0, ty: 0, tz: 0, flat };
}

/** Pixels per world unit on the flat sheet. */
export function flatScale(cam: Camera): number {
    return FLAT_SCALE / Math.max(1, cam.dist);
}

function fovY(width: number, height: number): number {
    if (height <= width) return FOV_MIN;
    return 2 * Math.atan(Math.tan(FOV_MIN / 2) * (height / Math.max(1, width)));
}

/** Focal length in pixels: how far a unit at depth 1 moves on screen. */
function focalPx(width: number, height: number): number {
    return height / 2 / Math.tan(fovY(width, height) / 2);
}

/**
 * Pixels per world unit at depth 1 (3D, divide by the point's depth) or everywhere (flat) — what
 * the shaders scale a dot by, so a near note is bigger than a far one.
 */
export function focalLength(cam: Camera, width: number, height: number): number {
    return cam.flat ? flatScale(cam) : focalPx(Math.max(1, width), Math.max(1, height));
}

/** The camera's eye in world space (3D only). */
export function eyeOf(cam: Camera): [number, number, number] {
    const cp = Math.cos(cam.pitch);
    return [
        cam.tx + cam.dist * cp * Math.sin(cam.yaw),
        cam.ty - cam.dist * Math.sin(cam.pitch),
        cam.tz + cam.dist * cp * Math.cos(cam.yaw),
    ];
}

/**
 * The clip-space matrix, column-major, for WebGL (`gl.uniformMatrix4fv(…, false, m)`).
 *
 * 3D is `perspective × lookAt`. Flat is an orthographic top-down sheet over `x`/`z`, with screen
 * `y` growing down the way {@link projectPoint} reports it.
 */
export function viewProjection(cam: Camera, width: number, height: number, out = new Float32Array(16)): Float32Array {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (cam.flat) {
        const s = flatScale(cam);
        const sx = (2 * s) / w;
        const sz = (2 * s) / h;
        out.fill(0);
        // clip.x = (x - tx) · sx ;  clip.y = -(z - tz) · sz ;  clip.z = 0 ; clip.w = 1
        out[0] = sx;
        out[9] = -sz;
        out[12] = -cam.tx * sx;
        out[13] = cam.tz * sz;
        out[15] = 1;
        return out;
    }
    const [ex, ey, ez] = eyeOf(cam);
    // lookAt(eye → target, up = +y)
    let fx = cam.tx - ex, fy = cam.ty - ey, fz = cam.tz - ez;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    // side = f × up
    let sx = -fz, sz = fx;
    const sl = Math.hypot(sx, sz) || 1;
    sx /= sl; sz /= sl;
    const sy = 0;
    // up' = side × f
    const ux = sy * fz - sz * fy;
    const uy = sz * fx - sx * fz;
    const uz = sx * fy - sy * fx;
    const tx = -(sx * ex + sy * ey + sz * ez);
    const ty = -(ux * ex + uy * ey + uz * ez);
    const tz = fx * ex + fy * ey + fz * ez;

    const f = 1 / Math.tan(fovY(w, h) / 2);
    const aspect = w / h;
    const a = f / aspect;
    const c = (FAR + NEAR) / (NEAR - FAR);
    const d = (2 * FAR * NEAR) / (NEAR - FAR);

    // P × V, written out (V rows: side, up, -forward).
    out[0] = a * sx; out[1] = f * ux; out[2] = c * -fx; out[3] = fx;
    out[4] = a * sy; out[5] = f * uy; out[6] = c * -fy; out[7] = fy;
    out[8] = a * sz; out[9] = f * uz; out[10] = c * -fz; out[11] = fz;
    out[12] = a * tx; out[13] = f * ty; out[14] = c * tz + d; out[15] = -tz;
    return out;
}

/** Where `(x, y, z)` lands on a `width × height` view, or `null` behind the camera. */
export function projectPoint(
    m: Float32Array,
    cam: Camera,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number
): Projected | null {
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cam.flat) {
        return { x: (cx * 0.5 + 0.5) * width, y: (0.5 - cy * 0.5) * height, depth: 0, scale: flatScale(cam) };
    }
    if (cw < NEAR) return null;
    return {
        x: (cx / cw * 0.5 + 0.5) * width,
        y: (0.5 - cy / cw * 0.5) * height,
        depth: cw,
        scale: focalPx(width, height) / cw,
    };
}

/**
 * The goal that frames `points` (flat triples) — the camera goes to the answer (#696).
 *
 * `shift` widens the framing when the answer card covers part of the view; `min` keeps a single
 * note from filling the screen. Framing moves the camera and nothing else: it never hides a note.
 */
export function frameGoal(
    cam: Camera,
    points: ArrayLike<number>,
    count: number,
    opts: { min?: number; shift?: number; aspect?: number } = {}
): CameraGoal | null {
    if (count === 0) return null;
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < count; i++) {
        sx += points[i * 3];
        sy += points[i * 3 + 1];
        sz += points[i * 3 + 2];
    }
    const cx = sx / count, cy = sy / count, cz = sz / count;
    const shift = opts.shift ?? 1;
    if (cam.flat) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < count; i++) {
            const x = points[i * 3], z = points[i * 3 + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        const span = Math.max(maxX - minX, maxZ - minZ, 80);
        return { tx: (minX + maxX) / 2, tz: (minZ + maxZ) / 2, dist: Math.max(opts.min ?? 260, span * 1.9 * shift) };
    }
    let r = 0;
    for (let i = 0; i < count; i++) {
        const d = Math.hypot(points[i * 3] - cx, points[i * 3 + 1] - cy, points[i * 3 + 2] - cz);
        if (d > r) r = d;
    }
    return { tx: cx, ty: cy, tz: cz, dist: Math.max(opts.min ?? 260, Math.max(40, r) * 2.25 * shift) };
}

/**
 * One step of a camera flight toward `goal`. Returns the goal still to reach, or `null` when it has
 * arrived. Reduced motion arrives at once (#319 S4): a flight is decoration, never information.
 */
export function stepCamera(cam: Camera, goal: CameraGoal, dtMs: number, reduced: boolean): CameraGoal | null {
    const s = reduced ? 1 : 1 - Math.pow(0.0022, Math.max(0, dtMs) / 1000);
    const keys = ["yaw", "pitch", "dist", "tx", "ty", "tz"] as const;
    for (const key of keys) {
        const want = goal[key];
        if (want === undefined) continue;
        cam[key] += (want - cam[key]) * s;
    }
    const done = keys.every((key) => {
        const want = goal[key];
        return want === undefined || Math.abs(want - cam[key]) < 0.5;
    });
    if (done) {
        for (const key of keys) {
            const want = goal[key];
            if (want !== undefined) cam[key] = want;
        }
        return null;
    }
    return goal;
}

/** Orbit by a pointer drag of `dx`, `dy` pixels (3D), or pan the sheet (flat). */
export function dragCamera(cam: Camera, from: Camera, dx: number, dy: number, pan: boolean): void {
    if (cam.flat) {
        const s = flatScale(cam);
        cam.tx = from.tx - dx / s;
        cam.tz = from.tz - dy / s;
        return;
    }
    if (pan) {
        // Slide the target in the camera's own plane, at a speed that keeps the point under the cursor.
        const k = from.dist / 900;
        const cy = Math.cos(from.yaw), sy = Math.sin(from.yaw);
        cam.tx = from.tx - (dx * cy) * k;
        cam.tz = from.tz + (dx * sy) * k;
        cam.ty = from.ty + dy * k;
        return;
    }
    cam.yaw = from.yaw + dx * 0.005;
    cam.pitch = clamp(from.pitch + dy * 0.004, -PITCH_LIMIT, PITCH_LIMIT);
}

/** Zoom by a wheel delta (or a pinch ratio as `exp(delta·k)`), within the graph's own bounds. */
export function zoomCamera(cam: Camera, factor: number, maxDist: number): void {
    cam.dist = clamp(cam.dist * factor, MIN_DIST, Math.max(MIN_DIST * 2, maxDist));
}

export function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}
