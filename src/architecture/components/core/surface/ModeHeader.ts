import { Menu, setIcon } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";

/**
 * **A mode's header carries one primary action** (#577, epic #574).
 *
 * #509 found eleven identically weighted buttons offering the cognitive moves and called it *"the
 * thing the picker exists to avoid, put back by hand"*. #542 found twenty-two controls in the 3D
 * view and answered *subtract, then a gear*. The same shape was one level down, in the headers:
 * the Lab drew the legend and the mechanic that opens a capability through one private helper, with
 * one class and one weight, so nothing on screen said which of them mattered.
 *
 * The rule this encodes, and the reason it can be checked at all:
 *
 * > A header may carry **one** control that opens a capability. A refresh, a filter, and moving
 * > around inside the mode are not that.
 *
 * The judgement about which one is primary stays a judgement — but it becomes a **visible** one,
 * because `primary()` is called once per header and the diff shows which call it is.
 * `onePrimaryAction.test.ts` counts them.
 *
 * What this deliberately does **not** reach: a cancel that appears while a composer is armed, an
 * undo where the card was, a clear beside the filter it clears. Those are contextual controls on
 * the thing they act upon — rank 1 by the door ranking — and two of them were placed deliberately,
 * against a toast, for reasons written down at the time.
 */
export interface HeaderAction {
    label: string;
    /** A Lucide id. The primary shows it inline; overflow items get it from the `Menu`. */
    icon: string;
    onClick: () => void;
}

/** How the owning `Component` registers a listener, so teardown stays the component's. */
export type RegisterDomEvent = (el: HTMLElement, type: "click" | "mousedown", handler: () => void) => void;

export class ModeHeader {
    private primaryDrawn = false;
    private readonly overflow: HeaderAction[] = [];

    constructor(
        private readonly host: HTMLElement,
        private readonly register: RegisterDomEvent
    ) {}

    /**
     * The one control that opens something. Calling it twice is a programming error rather than a
     * layout preference, so it throws — a second primary is what this class exists to prevent, and
     * a silently ignored call would hide the bug instead of reporting it.
     */
    primary(action: HeaderAction): HTMLElement {
        if (this.primaryDrawn) {
            throw new Error("[surface] a mode header carries one primary action (#577)");
        }
        this.primaryDrawn = true;
        const button = this.host.createEl("button", {
            cls: [c("mode-header-primary"), "mod-cta"].join(" "),
            attr: { type: "button", "aria-label": action.label },
        });
        setIcon(button.createSpan({ cls: c("mode-header-icon") }), action.icon);
        button.createSpan({ text: action.label });
        this.register(button, "mousedown", action.onClick);
        return button;
    }

    /**
     * A control that moves you around **inside** the mode — next idea, refresh, a filter. It stays
     * in the header, because burying navigation is its own usability failure, and it is drawn
     * plainly so it never competes with the primary for the eye.
     *
     * The line: if activating it opens a capability, it is not this. `onePrimaryAction.test.ts`
     * cannot tell the two apart — but the call says which one you meant, in a diff someone reads.
     */
    nav(action: Omit<HeaderAction, "icon"> & { icon?: string }): HTMLElement {
        const button = this.host.createEl("button", {
            cls: c("mode-header-nav"),
            attr: { type: "button", "aria-label": action.label },
        });
        if (action.icon) setIcon(button.createSpan({ cls: c("mode-header-icon") }), action.icon);
        button.createSpan({ text: action.label });
        this.register(button, "click", action.onClick);
        return button;
    }

    /** Everything else the header used to carry. It goes behind one control, in declared order. */
    secondary(action: HeaderAction): void {
        this.overflow.push(action);
    }

    /**
     * Draw the overflow, if anything went into it. Obsidian's own `Menu` rather than a new widget:
     * it is keyboard-operable, it is themed, and `MenuItem.setSubmenu()` is still undeclared at
     * 1.13.1 — which #496 already refused to reach past for a convenience.
     */
    done(): void {
        if (this.overflow.length === 0) return;
        const trigger = this.host.createEl("button", {
            cls: ["clickable-icon", c("mode-header-more")].join(" "),
            attr: { type: "button", "aria-label": t("mode_header_more"), "aria-haspopup": "menu" },
        });
        setIcon(trigger, "more-horizontal");
        const open = () => {
            const menu = new Menu();
            for (const action of this.overflow) {
                menu.addItem((item) => item.setTitle(action.label).setIcon(action.icon).onClick(action.onClick));
            }
            // From the button's own corner, so opening it with the keyboard puts the menu where
            // the control is rather than wherever the pointer happens to be.
            const box = trigger.getBoundingClientRect();
            menu.showAtPosition({ x: box.left, y: box.bottom });
        };
        this.register(trigger, "click", open);
    }
}
