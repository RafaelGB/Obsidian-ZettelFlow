/* eslint-disable @typescript-eslint/no-explicit-any */
import { DomNode } from "./dashboardDom";

/**
 * The Web Animations API, recorded (#750). `DomNode` has no `animate`, so under jest every motion is
 * "not welcome" and nothing plays. With `recordAnimations()` on, `animate()` returns a fake
 * `Animation` a test can drive — `currentTime`, `playbackRate`, `pause/play/reverse/finish/cancel`,
 * `finished` — and every keyframe set is kept, so a test can say what moved and how.
 *
 * It also gives `DomNode` a `cloneNode`, which a chapter's sheet is built from.
 */
export class FakeAnimation {
    currentTime: number | null = 0;
    playbackRate = 1;
    playState: "running" | "paused" | "finished" | "idle" = "running";
    onfinish: (() => void) | null = null;
    finished: Promise<FakeAnimation>;
    private resolve!: (a: FakeAnimation) => void;
    private reject!: (e: unknown) => void;
    readonly effect: { target: unknown; getTiming: () => { duration: number } };
    constructor(
        public readonly target: any,
        public readonly keyframes: Record<string, unknown>[],
        public readonly options: { duration?: number; easing?: string; fill?: string }
    ) {
        this.finished = new Promise<FakeAnimation>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        // A cancelled animation's `finished` rejects; nobody must see that as an unhandled error.
        this.finished.catch(() => undefined);
        this.effect = { target, getTiming: () => ({ duration: options.duration ?? 0 }) };
    }
    get duration(): number {
        return this.options.duration ?? 0;
    }
    pause(): void {
        this.playState = "paused";
    }
    play(): void {
        this.playState = "running";
    }
    reverse(): void {
        this.playbackRate = -this.playbackRate;
        this.playState = "running";
    }
    updatePlaybackRate(rate: number): void {
        this.playbackRate = rate;
    }
    finish(): void {
        if (this.playState === "finished" || this.playState === "idle") return;
        this.currentTime = this.playbackRate < 0 ? 0 : this.duration;
        this.playState = "finished";
        this.onfinish?.();
        this.resolve(this);
    }
    cancel(): void {
        if (this.playState === "idle") return;
        this.playState = "idle";
        this.currentTime = null;
        this.reject(new Error("AbortError"));
    }
}

export interface AnimationRecord {
    animations: FakeAnimation[];
    /** Every keyframe key used by any recorded animation. */
    keys(): Set<string>;
    /** Finish everything still running (or paused) — the turn plays out. */
    finishAll(): void;
    stop(): void;
}

function cloneNode(this: DomNode, deep = false): DomNode {
    const copy = new DomNode(this.tag);
    copy.attrs = { ...this.attrs };
    copy.classes = new Set(this.classes);
    copy.text = this.text;
    copy.cssProps = { ...this.cssProps };
    if (deep) for (const child of this.children) copy.appendChild(cloneNode.call(child, true));
    return copy;
}

/** Turn the recording on; `stop()` puts `DomNode` back as it was. */
export function recordAnimations(): AnimationRecord {
    const proto = DomNode.prototype as any;
    const hadAnimate = Object.prototype.hasOwnProperty.call(proto, "animate");
    const hadClone = Object.prototype.hasOwnProperty.call(proto, "cloneNode");
    const animations: FakeAnimation[] = [];
    proto.animate = function (this: DomNode, keyframes: Record<string, unknown>[], options: any = {}) {
        const animation = new FakeAnimation(this, keyframes, typeof options === "number" ? { duration: options } : options);
        animations.push(animation);
        return animation;
    };
    proto.cloneNode = cloneNode;
    return {
        animations,
        keys: () => new Set(animations.flatMap((a) => a.keyframes.flatMap((frame) => Object.keys(frame)))),
        finishAll: () => {
            for (const animation of [...animations]) animation.finish();
        },
        stop: () => {
            if (!hadAnimate) delete proto.animate;
            if (!hadClone) delete proto.cloneNode;
        },
    };
}

/**
 * Reduced motion asked for, or not (#753): the window every `DomNode` lives in answers the media
 * query with `on`. Returns the undo.
 */
export function reducedMotion(on: boolean): () => void {
    const g = globalThis as any;
    const had = Object.prototype.hasOwnProperty.call(g, "matchMedia");
    const before = g.matchMedia;
    g.matchMedia = () => ({ matches: on });
    return () => {
        if (had) g.matchMedia = before;
        else delete g.matchMedia;
    };
}
