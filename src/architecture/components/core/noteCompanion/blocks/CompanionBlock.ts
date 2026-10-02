import { Component, type App } from "obsidian";
import type {
    CompanionSections,
    LifecycleStep,
    NextMoveToken,
    NoteVitals,
} from "architecture/knowledge/state";
import type { ResurfaceReason } from "application/notes/resurfaceRanking";
import type { CompanionFocus } from "../noteCompanionContract";

/** Everything the companion draws about one note, built once per recompute. */
export interface CompanionModel {
    path: string;
    title: string;
    vitals: NoteVitals;
    steps: LifecycleStep[];
    sections: CompanionSections<ResurfaceReason>;
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
    /** The move a hand-over asked for (S2 #641), if any. */
    move?: NextMoveToken;
    pin(): void;
    follow(): void;
    refresh(): void;
    reveal(focus: CompanionFocus): void;
    open(path: string): void;
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

    constructor(protected readonly el: HTMLElement) {
        super();
    }

    abstract update(ctx: CompanionContext): void;

    /** Whether this block is where `focus` lands. */
    claims(_focus: CompanionFocus): boolean {
        return false;
    }

    /** Bring `focus` into view, once. Only called when {@link claims} said yes. */
    reveal(_focus: CompanionFocus): void {}
}

/** A note's file name without folders or `.md` — what a row shows; the path goes in the tooltip. */
export function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}
