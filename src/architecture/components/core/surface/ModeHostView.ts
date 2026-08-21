import { ItemView, ViewStateResult } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import type { Surface } from "./surfaceRegistry";
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
    /** The surface definition (view type, title, ordered modes) — set as a field by the subclass. */
    protected abstract readonly surface: Surface;
    /** Build the renderer for a mode id, rendering into `container`. */
    protected abstract createRenderer(modeId: string, container: HTMLElement): KnowledgeModeRenderer;

    private activeMode = "";
    private bodyEl: HTMLElement | null = null;
    private current: KnowledgeModeRenderer | null = null;
    private readonly tabButtons = new Map<string, HTMLElement>();

    getViewType(): string {
        return this.surface.viewType;
    }

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
        for (const mode of this.surface.modes) {
            const btn = tabs.createEl("button", {
                text: t(mode.labelKey as LocaleKey),
                cls: c("surface-mode-tab"),
            });
            btn.setAttribute("role", "tab");
            this.registerDomEvent(btn, "click", () => void this.showMode(mode.id));
            this.tabButtons.set(mode.id, btn);
        }
        this.bodyEl = root.createDiv({ cls: c("surface-body") });
    }

    private async showMode(modeId: string): Promise<void> {
        if (!this.bodyEl) return;
        this.activeMode = modeId;
        for (const [id, btn] of this.tabButtons) {
            btn.toggleClass(c("surface-mode-tab--active"), id === modeId);
            btn.setAttribute("aria-selected", id === modeId ? "true" : "false");
        }
        if (this.current) {
            this.removeChild(this.current);
            this.current = null;
        }
        this.bodyEl.empty();
        this.current = this.createRenderer(modeId, this.bodyEl);
        this.addChild(this.current); // triggers the renderer's onload() → renders into bodyEl
    }
}
