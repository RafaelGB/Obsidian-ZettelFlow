import { Modal, type App } from "obsidian";
import { c } from "architecture";

/**
 * On a phone the rule editor is a sheet (#713, FR-20): an Obsidian modal, which a phone already shows
 * full height. One editor renderer, two hosts — never a second editor to keep in step.
 */
export class ScopeRuleSheet extends Modal {
    private closedByUs = false;

    constructor(
        app: App,
        private readonly draw: (host: HTMLElement) => void,
        private readonly dismissed: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass(c("scope-sheet"));
        this.redraw();
    }

    /** Draw the editor again in place (a pick, a switch). */
    redraw(): void {
        this.draw(this.contentEl);
    }

    /** Closed by the editor itself (Add, Cancel): nothing else to undo. */
    finish(): void {
        this.closedByUs = true;
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
        // Swiped away or Esc: the draft is abandoned, as Cancel would.
        if (!this.closedByUs) this.dismissed();
    }
}
