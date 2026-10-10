/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DomNode } from "./dashboardDom";

/**
 * A finger, a pen or a mouse on the page (#750): `pointerdown → pointermove* → pointerup`, each with
 * its `pointerType`, `clientX/Y` and `timeStamp`, fired on the node that listens (the fake DOM does
 * not bubble) with `target` the node under the finger. A tap is followed by the `click` a browser
 * synthesises, so a test can see it swallowed.
 */
let clock = 1000;

export interface PointAt {
    x: number;
    y: number;
    /** What is under the finger; the listener itself when not given. */
    target?: DomNode;
}

interface Options {
    type?: "touch" | "pen" | "mouse";
    /** How long the gesture takes, start to lift. */
    ms?: number;
    /** Intermediate moves. */
    steps?: number;
    /** Lift the finger at the end (a held swipe does not). */
    lift?: boolean;
}

function event(node: DomNode, at: PointAt, type: string, timeStamp: number, extra: Record<string, unknown> = {}): any {
    return { pointerType: type, pointerId: 1, isPrimary: true, clientX: at.x, clientY: at.y, timeStamp, target: at.target ?? node, button: 0, ...extra };
}

export function pointerDown(node: DomNode, at: PointAt, type: Options["type"] = "touch"): any {
    clock += 1000;
    return node.fire("pointerdown", event(node, at, type, clock));
}

export function pointerMove(node: DomNode, at: PointAt, ms: number, type: Options["type"] = "touch"): any {
    clock += ms;
    return node.fire("pointermove", event(node, at, type, clock));
}

export function pointerUp(node: DomNode, at: PointAt, ms: number, type: Options["type"] = "touch"): any {
    clock += ms;
    return node.fire("pointerup", event(node, at, type, clock));
}

/** A quick touch that barely moves, then the synthetic click. Returns that click's event. */
export function touchTap(node: DomNode, at: PointAt, options: Options = {}): any {
    const type = options.type ?? "touch";
    pointerDown(node, at, type);
    pointerUp(node, at, options.ms ?? 80, type);
    return node.fire("click", event(node, at, type, clock));
}

/** A mouse click: the same events, from a mouse. */
export function mouseClick(node: DomNode, at: PointAt): any {
    return touchTap(node, at, { type: "mouse" });
}

/** A drag from `from` to `to` over `ms`, in `steps` moves, lifted unless `lift: false`. */
export function touchSwipe(node: DomNode, from: PointAt, to: PointAt, options: Options = {}): void {
    const type = options.type ?? "touch";
    const steps = options.steps ?? 6;
    const ms = options.ms ?? 240;
    pointerDown(node, from, type);
    for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        pointerMove(node, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, target: from.target }, ms / steps, type);
    }
    if (options.lift !== false) pointerUp(node, { ...to, target: from.target }, 1, type);
}

/**
 * A pen (or a mouse) writing on the page (#745): down at the first point, through each of the rest,
 * up at the last — with a pressure and an altitude on every sample. `lift: false` keeps the pen down.
 */
export function penStroke(
    node: DomNode,
    points: PointAt[],
    options: { type?: "pen" | "mouse"; pressure?: number; altitude?: number; lift?: boolean; pointerId?: number } = {}
): void {
    const type = options.type ?? "pen";
    const extra = { pressure: options.pressure ?? 0.5, altitudeAngle: options.altitude ?? Math.PI / 2, pointerId: options.pointerId ?? 1, buttons: 1 };
    clock += 1000;
    node.fire("pointerdown", event(node, points[0], type, clock, extra));
    for (const at of points.slice(1)) {
        clock += 8;
        node.fire("pointermove", event(node, at, type, clock, extra));
    }
    if (options.lift === false) return;
    clock += 8;
    node.fire("pointerup", event(node, points[points.length - 1], type, clock, { ...extra, pressure: 0 }));
}

/** A pen lifted that `penStroke` left down. */
export function penUp(node: DomNode, at: PointAt, options: { type?: "pen" | "mouse"; pointerId?: number } = {}): any {
    clock += 8;
    return node.fire("pointerup", event(node, at, options.type ?? "pen", clock, { pointerId: options.pointerId ?? 1, pressure: 0 }));
}

/**
 * Two fingers on the page, together (#745 FR-8): down at `a` and `b`, each moved `travel` px (apart,
 * when `apart`), and up after `ms`. Each finger has its own `pointerId`.
 */
export function twoFingers(node: DomNode, a: PointAt, b: PointAt, options: { ms?: number; travel?: number; apart?: boolean } = {}): void {
    const ms = options.ms ?? 120;
    const travel = options.travel ?? 0;
    const sign = options.apart ? -1 : 1;
    clock += 1000;
    node.fire("pointerdown", event(node, a, "touch", clock, { pointerId: 11, isPrimary: true }));
    node.fire("pointerdown", event(node, b, "touch", clock + 5, { pointerId: 12, isPrimary: false }));
    const a2 = { ...a, x: a.x + sign * travel };
    const b2 = { ...b, x: b.x + travel };
    if (travel) {
        node.fire("pointermove", event(node, a2, "touch", clock + ms / 2, { pointerId: 11 }));
        node.fire("pointermove", event(node, b2, "touch", clock + ms / 2, { pointerId: 12 }));
    }
    clock += ms;
    node.fire("pointerup", event(node, a2, "touch", clock, { pointerId: 11 }));
    node.fire("pointerup", event(node, b2, "touch", clock + 5, { pointerId: 12 }));
}
