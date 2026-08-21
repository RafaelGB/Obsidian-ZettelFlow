import { Component } from "obsidian";

/**
 * A **mode renderer** (#272) — one retired view's rendering, extracted verbatim so a {@link ModeHostView}
 * surface can mount it as a mode. It extends `Component`, so `registerDomEvent` / `registerEvent` /
 * `registerInterval` inside `onload()` are auto-torn-down when the host swaps modes or closes (the host
 * uses `addChild`/`removeChild`). Subclasses render into `this.container` in `onload()`.
 */
export abstract class KnowledgeModeRenderer extends Component {
    constructor(protected readonly container: HTMLElement) {
        super();
    }
}
