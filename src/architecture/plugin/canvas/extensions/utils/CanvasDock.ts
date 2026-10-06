import { setIcon } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";

/** One tab of the dock: its button, its body, and the small fact on the tab (#686). */
export interface DockPanel {
    readonly body: HTMLElement;
    /** A count on the tab (findings), a check for "nothing to report", or nothing. */
    setCount(count: number | undefined): void;
    /** Take this panel out of the dock; the dock goes when its last panel does. */
    remove(): void;
}

interface PanelEntry {
    id: string;
    order: number;
    tab: HTMLElement;
    body: HTMLElement;
    onOpen?: () => void;
    onClose?: () => void;
}

/** One dock per canvas wrapper. */
const DOCKS = new WeakMap<HTMLElement, CanvasDock>();

/**
 * **One corner dock** for what ZettelFlow draws over a canvas (#686, decision 15): Legend · Review
 * · Rehearse as tabs of a single overlay anchored bottom-right. It replaces three chips placed with
 * magic offsets in two corners, which overlapped each other and Obsidian's own controls.
 *
 * Canvas rules (§VI): it is one element on `canvas.wrapperEl`, the container itself takes no pointer
 * events (Obsidian's drag handling checks `e.targetNode === wrapperEl`), only its controls do; it
 * is removed whole when the last extension using it lets go, and on unload by each of them.
 */
export class CanvasDock {
    private readonly el: HTMLElement;
    private readonly tabs: HTMLElement;
    private readonly bodies: HTMLElement;
    private readonly panels: PanelEntry[] = [];
    private active: string | undefined;

    private constructor(private readonly wrapperEl: HTMLElement) {
        this.el = wrapperEl.createDiv({ cls: c("canvas-dock") });
        this.tabs = this.el.createDiv({ cls: c("canvas-dock-tabs"), attr: { role: "tablist" } });
        this.bodies = this.el.createDiv({ cls: c("canvas-dock-bodies") });
        const fold = this.tabs.createEl("button", {
            cls: ["clickable-icon", c("canvas-dock-fold")],
            attr: { type: "button", "aria-label": t("canvas_dock_fold") },
        });
        setIcon(fold, "chevron-down");
        fold.addEventListener("click", () => this.show(undefined));
        this.syncFold();
    }

    /** The dock on this canvas, created on first use. */
    static of(wrapperEl: HTMLElement): CanvasDock {
        const existing = DOCKS.get(wrapperEl);
        if (existing?.el.isConnected) return existing;
        const dock = new CanvasDock(wrapperEl);
        DOCKS.set(wrapperEl, dock);
        return dock;
    }

    /** Add a tab. A panel already there under the same id is replaced, so this is idempotent. */
    panel(
        id: string,
        label: string,
        order: number,
        hooks: { icon?: string; onOpen?: () => void; onClose?: () => void } = {}
    ): DockPanel {
        this.detach(id);
        const tab = createEl("button", {
            cls: c("canvas-dock-tab"),
            attr: { type: "button", role: "tab", "aria-selected": "false", "data-panel": id },
        });
        if (hooks.icon) setIcon(tab.createSpan({ cls: c("canvas-dock-tab-icon") }), hooks.icon);
        tab.createSpan({ text: label });
        tab.addEventListener("click", () => this.show(this.active === id ? undefined : id));
        const body = this.bodies.createDiv({ cls: c("canvas-dock-body") });
        body.hidden = true;

        const entry: PanelEntry = { id, order, tab, body, onOpen: hooks.onOpen, onClose: hooks.onClose };
        this.panels.push(entry);
        this.panels.sort((a, b) => a.order - b.order);
        // Tabs in their order, the fold button last.
        const fold = this.tabs.lastElementChild;
        for (const panel of this.panels) this.tabs.insertBefore(panel.tab, fold);

        return {
            body,
            setCount: (count) => this.setCount(entry, count),
            remove: () => this.detach(id),
        };
    }

    /** Open one panel (closing the one that was open), or fold the dock to its row of tabs. */
    show(id: string | undefined): void {
        if (this.active === id) return;
        const previous = this.panels.find((panel) => panel.id === this.active);
        if (previous) {
            previous.body.hidden = true;
            previous.tab.setAttribute("aria-selected", "false");
            previous.tab.removeClass("is-active");
            previous.onClose?.();
        }
        this.active = id;
        const next = this.panels.find((panel) => panel.id === id);
        if (next) {
            next.body.hidden = false;
            next.tab.setAttribute("aria-selected", "true");
            next.tab.addClass("is-active");
            next.onOpen?.();
        } else {
            this.active = undefined;
        }
        this.syncFold();
    }

    private syncFold(): void {
        this.el.toggleClass(c("canvas-dock-folded"), this.active === undefined);
    }

    private setCount(entry: PanelEntry, count: number | undefined): void {
        entry.tab.querySelector(`.${c("canvas-dock-count")}`)?.remove();
        if (count === undefined) return;
        const fact = entry.tab.createSpan({ cls: c("canvas-dock-count") });
        if (count === 0) {
            fact.addClass(c("canvas-dock-count-clean"));
            setIcon(fact, "check");
            fact.setAttr("aria-label", t("flow_review_clean_short"));
        } else {
            fact.setText(String(count));
        }
    }

    private detach(id: string): void {
        const index = this.panels.findIndex((panel) => panel.id === id);
        if (index === -1) return;
        const [panel] = this.panels.splice(index, 1);
        if (this.active === id) {
            this.active = undefined;
            panel.onClose?.();
        }
        panel.tab.remove();
        panel.body.remove();
        this.syncFold();
        if (this.panels.length === 0) {
            this.el.remove();
            DOCKS.delete(this.wrapperEl);
        }
    }
}
