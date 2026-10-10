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
