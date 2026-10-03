import { Component } from "obsidian";

/**
 * A **mode renderer** (#272) — one retired view's rendering, extracted verbatim so a {@link ModeHostView}
 * surface can mount it as a mode. It extends `Component`, so `registerDomEvent` / `registerEvent` /
 * `registerInterval` inside `onload()` are auto-torn-down when the host swaps modes or closes (the host
 * uses `addChild`/`removeChild`). Subclasses render into `this.container` in `onload()`.
 */
export abstract class KnowledgeModeRenderer extends Component {
    private readonly scopes = new Map<string, Component>();

    constructor(protected readonly container: HTMLElement) {
        super();
    }

    /**
     * A fresh listener scope named `key`, replacing the last one of that name (#639 review).
     *
     * A mode that redraws part of itself — the whole mode on a vault change, a chip row on a click,
     * a progress row on every tick — must not register its listeners on itself: each redraw would
     * add handlers (and keep their detached elements alive) until the mode closed. Registering on
     * the scope instead means the previous draw's listeners go with the previous draw.
     */
    protected scope(key: string): Component {
        const previous = this.scopes.get(key);
        if (previous) this.removeChild(previous);
        const next = this.addChild(new Component());
        this.scopes.set(key, next);
        return next;
    }
}
