import { Component, type App, type PaneType } from "obsidian";
import type {
    CompanionSections,
    LifecycleStep,
    NearbyRow,
    NextMoveToken,
    NextStepCard,
    NoteNeighbourhood,
    NoteVitals,
} from "architecture/knowledge/state";
import type { ResurfaceReason } from "application/notes/resurfaceRanking";
import type { HeaderAction } from "architecture/components/core/surface/ModeHeader";
import type { CompanionFocus } from "../noteCompanionContract";

/** Everything the companion draws about one note, built once per recompute. */
export interface CompanionModel {
    path: string;
    title: string;
    vitals: NoteVitals;
    steps: LifecycleStep[];
    sections: CompanionSections<ResurfaceReason>;
    /** The next-step card's facts (#641). */
    next: NextStepCard;
    /** The nearby notes *Connect* offers: unlinked, best first, at most four. */
    connect: NearbyRow<ResurfaceReason>[];
    /** The model's revision when this was built — how the card tells a write has landed. */
    revision: number;
    /** The source property a new source goes under (`source`, or the `sources` the note uses). */
    sourceKey: string;
    /** The notes it links to — what *Connect* will not offer again. */
    linksOut: string[];
    /** Its neighbours and the near notes the graph draws (#643); null when they could not be read. */
    neighbourhood: NoteNeighbourhood | null;
}

/** What is on screen: a note, the empty state, or the two moments before a note can be read. */
export type CompanionScreen =
    | { kind: "note"; model: CompanionModel }
    | { kind: "empty"; last: string | null }
    | { kind: "indexing"; path: string }
    | { kind: "error"; path: string };

/** What a block gets to render from and to act through. It never reaches the workspace itself. */
export interface CompanionContext {
    app: App;
    screen: CompanionScreen;
    pinned: boolean;
    /** The component hover previews hang from. */
    owner: Component;
    pin(): void;
    follow(): void;
    refresh(): void;
    /** Bring a focus into view; `move` preselects a next move (#641). */
    reveal(focus: CompanionFocus, move?: NextMoveToken): void;
    /** Open a note; `newLeaf` follows Obsidian's modifier-click (#643). */
    open(path: string, newLeaf?: PaneType | boolean): void;
    /** How the neighbourhood is shown, from the settings (#643 FR-11). */
    neighbourhoodView: "graph" | "list";
    /** Remember how the neighbourhood is shown. */
    setNeighbourhoodView(view: "graph" | "list"): void;
    /** What the head's ⋯ menu offers right now — every block's items, in block order (#642). */
    menu(): HeaderAction[];
}

export type CompanionColumn = "head" | "main" | "side";

/**
 * One part of the companion (#640). The view owns the listeners, the state and the order; a block
 * owns its DOM and redraws it from the context. Later slices add blocks — the next step (#641), the
 * neighbourhood (#643), the story (#642) — without the view changing shape.
 */
export abstract class CompanionBlock extends Component {
    abstract readonly id: string;
    abstract readonly column: CompanionColumn;

    /** The current render's listeners. Replaced on every render, so they never pile up. */
    private pass: Component | null = null;

    constructor(protected readonly el: HTMLElement) {
        super();
    }

    /**
     * Start a render. A block redraws its DOM on every refresh; registering listeners on the block
     * itself would keep every past render's handlers (and their detached elements) alive until the
     * view closed. They belong to the render instead, and go with it.
     */
    protected beginRender(): void {
        if (this.pass) this.removeChild(this.pass);
        this.pass = this.addChild(new Component());
    }

    /** Listen on an element drawn by the current render — HTML or SVG (the neighbourhood's nodes). */
    protected on<K extends keyof HTMLElementEventMap>(
        el: HTMLElement | SVGElement,
        type: K,
        handler: (event: HTMLElementEventMap[K]) => unknown
    ): void {
        // An SVG element dispatches the same events; Obsidian's signature only names HTMLElement.
        (this.pass ?? this).registerDomEvent(el as HTMLElement, type, handler);
    }

    /**
     * Run `fn` after `ms`, unless the render that asked has been replaced by then. How an inline undo
     * expires on time in an idle pane, without a timer outliving the line it was for.
     */
    protected later(ms: number, fn: () => void): void {
        const id = window.setTimeout(fn, ms);
        // Never keep a test runner (or a closing app) alive for a thirty-second offer.
        (id as unknown as { unref?: () => void }).unref?.();
        (this.pass ?? this).register(() => window.clearTimeout(id));
    }

    /**
     * Ring `target` once to say "you landed here". The ring is an animation that removes itself;
     * with reduced motion it is an outline instead, taken off after the same moment.
     */
    protected highlightOnce(target: HTMLElement): void {
        const highlight = "zettelkasten-flow__note-companion-highlight";
        target.addClass(highlight);
        if (prefersReducedMotion(target)) this.later(HIGHLIGHT_MS, () => target.removeClass(highlight));
        else target.addEventListener("animationend", () => target.removeClass(highlight), { once: true });
    }

    abstract update(ctx: CompanionContext): void;

    /** Whether this block is where `focus` lands. */
    claims(_focus: CompanionFocus): boolean {
        return false;
    }

    /** Bring `focus` into view, once. Only called when {@link claims} said yes. */
    reveal(_focus: CompanionFocus, _move?: NextMoveToken): void {}

    /** What this block adds to the head's ⋯ menu. Read when the menu opens, never cached (#642). */
    menuItems(): HeaderAction[] {
        return [];
    }
}

/** How long the arrival ring lasts — the animation's own length, used when motion is reduced. */
export const HIGHLIGHT_MS = 1400;

/** Ask the window the element is in — a popout has its own. Absent under a test runner. */
export function prefersReducedMotion(el: HTMLElement): boolean {
    const win = (el as HTMLElement & { win?: Window }).win ?? (typeof activeWindow === "undefined" ? undefined : activeWindow);
    return win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** A note's file name without folders or `.md` — what a row shows; the path goes in the tooltip. */
export function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}
