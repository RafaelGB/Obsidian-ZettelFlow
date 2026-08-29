import { ItemView, ViewStateResult } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { surfaceByType, type Surface } from "./surfaceRegistry";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";

type LocaleKey = Parameters<typeof t>[0];

/**
 * Base for a **surface** (#272, epic #268 Phase 7): an `ItemView` that hosts several **modes** behind a
 * segmented control, mounting the active mode's {@link KnowledgeModeRenderer} as a child so its
 * event/interval registrations are cleaned up on every mode switch and on close. The active mode is
 * persisted/deep-linked through the view state (`getState`/`setState`), so a reload — or an alias
 * command targeting a specific mode — restores it.
 */
export abstract class ModeHostView extends ItemView {
    /**
     * The surface's registered view type. **Must return a literal — it may not read an instance field.**
     * Obsidian's `ItemView` base calls `getViewType()` from inside its own constructor (during the
     * subclass `super()` call), before any subclass field initializer has run; a field-backed value
     * would still be `undefined` at that point and crash ("Cannot read properties of undefined").
     */
    abstract getViewType(): string;
    /** Build the renderer for a mode id, rendering into `container`. */
    protected abstract createRenderer(modeId: string, container: HTMLElement): KnowledgeModeRenderer;

    /** The surface definition (title, ordered modes), derived from the construction-safe view type. */
    protected get surface(): Surface {
        return surfaceByType(this.getViewType());
    }

    private activeMode = "";
    private bodyEl: HTMLElement | null = null;
    private current: KnowledgeModeRenderer | null = null;
    private readonly tabButtons = new Map<string, HTMLElement>();
    private tabOrder: string[] = [];

    getDisplayText(): string {
        return t(this.surface.titleKey as LocaleKey);
    }

    async onOpen(): Promise<void> {
        this.renderShell();
        await this.showMode(this.hasMode(this.activeMode) ? this.activeMode : this.surface.modes[0].id);
    }

    async onClose(): Promise<void> {
        if (this.current) {
            this.removeChild(this.current);
            this.current = null;
        }
        this.contentEl.empty();
    }

    getState(): Record<string, unknown> {
        return { ...super.getState(), mode: this.activeMode };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const mode = (state as { mode?: unknown } | null)?.mode;
        if (typeof mode === "string" && this.hasMode(mode)) {
            if (this.bodyEl) await this.showMode(mode);
            else this.activeMode = mode; // shell not built yet — onOpen will honour it
        }
    }

    /** Re-render the active mode (e.g. after external data changed). No-op before the shell is built. */
    refresh(): void {
        if (this.bodyEl && this.activeMode) void this.showMode(this.activeMode);
    }

    private hasMode(modeId: string): boolean {
        return this.surface.modes.some((m) => m.id === modeId);
    }

    private renderShell(): void {
        const { contentEl } = this;
        contentEl.empty();
        const root = contentEl.createDiv({ cls: c("surface") });
        const tabs = root.createDiv({ cls: c("surface-modes") });
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", t(this.surface.titleKey as LocaleKey));
        this.tabButtons.clear();
        this.tabOrder = [];
        const viewType = this.getViewType();
        for (const mode of this.surface.modes) {
            const btn = tabs.createEl("button", {
                text: t(mode.labelKey as LocaleKey),
                cls: c("surface-mode-tab"),
            });
            btn.id = `zf-tab-${viewType}-${mode.id}`;
            btn.setAttribute("role", "tab");
            btn.setAttribute("aria-controls", `zf-panel-${viewType}`);
            btn.setAttribute("tabindex", "-1"); // roving; the active tab becomes 0 in showMode
            this.registerDomEvent(btn, "click", () => void this.showMode(mode.id));
            this.registerDomEvent(btn, "keydown", (evt) => this.onTabKeydown(evt, mode.id));
            this.tabButtons.set(mode.id, btn);
            this.tabOrder.push(mode.id);
        }
        this.bodyEl = root.createDiv({ cls: c("surface-body") });
        this.bodyEl.id = `zf-panel-${viewType}`;
        this.bodyEl.setAttribute("role", "tabpanel");
        this.bodyEl.setAttribute("tabindex", "0");
    }

    /** Arrow/Home/End keyboard navigation across the tablist (WAI-ARIA automatic activation). */
    private onTabKeydown(evt: KeyboardEvent, modeId: string): void {
        const index = this.tabOrder.indexOf(modeId);
        if (index === -1 || this.tabOrder.length === 0) return;
        let next: number | null = null;
        if (evt.key === "ArrowRight" || evt.key === "ArrowDown") next = (index + 1) % this.tabOrder.length;
        else if (evt.key === "ArrowLeft" || evt.key === "ArrowUp") next = (index - 1 + this.tabOrder.length) % this.tabOrder.length;
        else if (evt.key === "Home") next = 0;
        else if (evt.key === "End") next = this.tabOrder.length - 1;
        if (next === null) return;
        evt.preventDefault();
        const nextId = this.tabOrder[next];
        this.tabButtons.get(nextId)?.focus();
        void this.showMode(nextId);
    }

    private async showMode(modeId: string): Promise<void> {
        if (!this.bodyEl) return;
        this.activeMode = modeId;
        for (const [id, btn] of this.tabButtons) {
            const active = id === modeId;
            btn.toggleClass(c("surface-mode-tab--active"), active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
            btn.setAttribute("tabindex", active ? "0" : "-1"); // roving tabindex
        }
        this.bodyEl.setAttribute("aria-labelledby", `zf-tab-${this.getViewType()}-${modeId}`);
        if (this.current) {
            this.removeChild(this.current);
            this.current = null;
        }
        this.bodyEl.empty();
        this.current = this.createRenderer(modeId, this.bodyEl);
        this.addChild(this.current); // triggers the renderer's onload() → renders into bodyEl
    }
}
