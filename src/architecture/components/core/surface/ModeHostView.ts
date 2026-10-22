import { ItemView, Scope, ViewStateResult } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { surfaceByType, type Surface } from "./surfaceRegistry";
import { isViewTarget, relocateMode } from "./legacyTargets";
import { openNoteCompanion } from "architecture/components/core/noteCompanion/openNoteCompanion";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { CameraPan, ownWindow, type PanShot, type Span } from "./cameraPan";
import { centeredScrollTop, doors, escapeIsFree, NO_DOORS, panPlan, shotPlan, type DoorOrigin, type DoorState, type Via } from "./modeSet";
import { fly, MOTION, motionWelcome } from "architecture/components/core/reader/readerMotion";

type LocaleKey = Parameters<typeof t>[0];

/** The custom properties a set is placed by: the mode in view, and the indicator under its tab. */
const SET_PROPS = { at: "--zf-surface-at", indX: "--zf-surface-ind-x", indW: "--zf-surface-ind-w" };

/** What a card that is a door carries into the move (#875). */
interface Travel {
    via: Via;
    payload?: Record<string, unknown>;
    /** The door's own card, where the flight begins. */
    from?: HTMLElement;
    origin?: DoorOrigin;
    /** Rebuild the mode in place and keep the way back — external data changed, nothing moved. */
    refresh?: boolean;
}

/** What is open over a view and owns Esc while it is: Obsidian's own menus, suggestions, modals, popovers. */
const OVERLAYS = ".menu, .suggestion-container, .modal-container, .popover";

/**
 * Base for a **surface** (#272, epic #268 Phase 7): an `ItemView` that hosts several **modes** behind a
 * segmented control, mounting the active mode's {@link KnowledgeModeRenderer} as a child so its
 * event/interval registrations are cleaned up on every mode switch and on close. The active mode is
 * persisted/deep-linked through the view state (`getState`/`setState`), so a reload — or an alias
 * command targeting a specific mode — restores it.
 *
 * ## One set, one camera (#875)
 *
 * The modes sit side by side in one strip, in tab order, each in its own pane. Moving between them is
 * {@link travel}: the destination is built and ready **before** the camera moves, then — on a
 * `continuous` surface — the camera pans across the set, and a door flies its card into the place it
 * opens, in the same gesture. Only one mode is mounted at rest, two during a shot. A deep link or a
 * restored layout lands with no shot. Every other surface travels the same way, instantly.
 */
export abstract class ModeHostView extends ItemView {
    /**
     * The surface's registered view type. **Must return a literal — it may not read an instance field.**
     * Obsidian's `ItemView` base calls `getViewType()` from inside its own constructor (during the
     * subclass `super()` call), before any subclass field initializer has run; a field-backed value
     * would still be `undefined` at that point and crash ("Cannot read properties of undefined").
     */
    abstract getViewType(): string;
    /**
     * Build the renderer for a mode id, rendering into `container`. `state` carries the view-state
     * payload from the deep-link that requested this mode (e.g. a pre-filled query, #323 G4); most
     * modes ignore it.
     */
    protected abstract createRenderer(
        modeId: string,
        container: HTMLElement,
        state?: Record<string, unknown>
    ): KnowledgeModeRenderer;

    /** The surface definition (title, ordered modes), derived from the construction-safe view type. */
    protected get surface(): Surface {
        return surfaceByType(this.getViewType());
    }

    private activeMode = "";
    private rootEl: HTMLElement | null = null;
    private stripEl: HTMLElement | null = null;
    private inkEl: HTMLElement | null = null;
    private readonly panes = new Map<string, HTMLElement>();
    /** The mode at rest; a second one is mounted only while the camera moves between them. */
    private current: KnowledgeModeRenderer | null = null;
    private readonly mounted = new Map<string, KnowledgeModeRenderer>();
    private readonly tabButtons = new Map<string, HTMLElement>();
    private tabOrder: string[] = [];
    /** The deep-link payload for the next mode build, consumed once so a manual tab switch is clean. */
    private pendingState: Record<string, unknown> | null = null;
    private pan: CameraPan | null = null;
    /** The one way back: to the card that opened this mode, once (#875 FR-13). */
    private doorState: DoorState = NO_DOORS;
    /** Where the last door's card landed, so the way back flies from there. */
    private landedOn: HTMLElement | null = null;
    /** A newer move supersedes an older one still waiting for its mode to be ready. */
    private generation = 0;

    getDisplayText(): string {
        return t(this.surface.titleKey as LocaleKey);
    }

    async onOpen(): Promise<void> {
        this.renderShell();
        // One Esc for the set, on the view's own scope: back to the card you pressed (#875 FR-12).
        if (!this.scope) this.scope = new Scope(this.app?.scope);
        this.scope.register([], "Escape", () => this.onEscape());
        const payload = this.pendingState ?? undefined;
        this.pendingState = null;
        await this.travel(this.hasMode(this.activeMode) ? this.activeMode : this.surface.modes[0].id, { via: "link", ...(payload ? { payload } : {}) });
    }

    async onClose(): Promise<void> {
        this.pan?.finish();
        for (const renderer of this.mounted.values()) this.removeChild(renderer);
        this.mounted.clear();
        this.current = null;
        this.contentEl.empty();
    }

    getState(): Record<string, unknown> {
        return { ...super.getState(), mode: this.activeMode };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const payload = (state as Record<string, unknown> | null) ?? null;
        const mode = payload?.mode;
        if (typeof mode !== "string") return;
        if (this.hasMode(mode)) {
            if (this.stripEl) await this.travel(mode, { via: "link", ...(payload ? { payload } : {}) });
            else {
                this.activeMode = mode; // shell not built yet — onOpen will honour it
                this.pendingState = payload;
            }
            return;
        }
        // A mode this surface no longer has (#487). Hand the leaf over rather than falling back
        // to the first mode: showing the wrong thing without saying so is the worst failure here.
        const moved = relocateMode(this.getViewType(), mode);
        if (moved && isViewTarget(moved)) {
            // A mode that became its own view (#640): this leaf keeps the surface on its default
            // mode, and the view opens where it lives — once the workspace has finished restoring.
            if (this.stripEl) await this.travel(this.surface.modes[0].id, { via: "link" });
            else this.activeMode = this.surface.modes[0].id;
            // Saved, or the stale mode would reopen the companion on every start.
            this.app.workspace.requestSaveLayout();
            this.app.workspace.onLayoutReady(() => void openNoteCompanion(this.app));
            return;
        }
        if (moved && moved.surface === this.getViewType() && this.hasMode(moved.mode)) {
            // A mode renamed inside this surface (#644 health → tend, #645 momentum/agency →
            // practice): switch in place. A setViewState round-trip to the same view type would
            // land back in this setState, and a stale mode would survive in the saved layout.
            const renamed = { ...payload, mode: moved.mode };
            if (this.stripEl) await this.travel(moved.mode, { via: "link", payload: renamed });
            else {
                this.activeMode = moved.mode;
                this.pendingState = renamed;
            }
            this.app.workspace.requestSaveLayout();
            return;
        }
        if (moved) {
            await this.leaf.setViewState({
                type: moved.surface,
                state: { ...payload, mode: moved.mode },
                active: true,
            });
        }
    }

    /** Re-render the active mode (e.g. after external data changed). No-op before the shell is built. */
    refresh(): void {
        if (this.stripEl && this.activeMode) void this.travel(this.activeMode, { via: "link", refresh: true });
    }

    /**
     * A card that is a door (#875): open `to` in this tab, the card flying into the place it opens, and
     * remember it so Esc — or the mode's *Home* — plays the shot backwards to it.
     */
    protected travelByDoor(to: string, payload: Record<string, unknown>, origin: DoorOrigin, from: HTMLElement): Promise<void> {
        return this.travel(to, { via: "door", payload, origin, from });
    }

    /** Whether this surface's modes are one set the camera moves across. */
    protected get continuous(): boolean {
        return this.surface.continuous === true;
    }

    private hasMode(modeId: string): boolean {
        return this.surface.modes.some((m) => m.id === modeId);
    }

    private renderShell(): void {
        const { contentEl } = this;
        contentEl.empty();
        const root = contentEl.createDiv({ cls: [c("surface"), ...(this.continuous ? [c("surface--set")] : [])] });
        this.rootEl = root;
        const tabs = root.createDiv({ cls: c("surface-modes") });
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", t(this.surface.titleKey as LocaleKey));
        this.tabButtons.clear();
        this.tabOrder = [];
        const viewType = this.getViewType();
        // A bar offering one choice is not a choice — and an ARIA tablist of one is noise for a
        // screen reader too. The same rule Explore's lens bar already follows (#487).
        for (const mode of this.surface.modes.length > 1 ? this.surface.modes : []) {
            const btn = tabs.createEl("button", {
                text: t(mode.labelKey as LocaleKey),
                cls: c("surface-mode-tab"),
            });
            btn.id = `zf-tab-${viewType}-${mode.id}`;
            btn.setAttribute("role", "tab");
            btn.setAttribute("aria-controls", `zf-panel-${viewType}`);
            btn.setAttribute("tabindex", "-1"); // roving; the active tab becomes 0 in travel
            this.registerDomEvent(btn, "click", () => {
                if (mode.id !== this.activeMode) void this.travel(mode.id, { via: "bar" });
            });
            this.registerDomEvent(btn, "keydown", (evt) => this.onTabKeydown(evt, mode.id));
            this.tabButtons.set(mode.id, btn);
            this.tabOrder.push(mode.id);
        }
        // The indicator that travels with the camera (#875 FR-4): one line, sliding under the tabs.
        if (this.continuous && this.tabOrder.length > 1) this.inkEl = tabs.createDiv({ cls: c("surface-mode-ink"), attr: { "aria-hidden": "true" } });
        const set = root.createDiv({ cls: c("surface-set") });
        set.id = `zf-panel-${viewType}`;
        set.setAttribute("role", "tabpanel");
        set.setAttribute("tabindex", "0");
        this.stripEl = set.createDiv({ cls: c("surface-strip") });
        this.panes.clear();
        for (const mode of this.surface.modes) {
            // Each pane is also a `surface-body`, so what is keyed on the mode's body still holds.
            const pane = this.stripEl.createDiv({ cls: [c("surface-pane"), c("surface-body")], attr: { "data-mode": mode.id } });
            pane.setAttribute("tabindex", "-1");
            this.panes.set(mode.id, pane);
        }
        this.pan = new CameraPan(SET_PROPS);
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
        if (nextId !== this.activeMode) void this.travel(nextId, { via: "bar" });
    }

    /** Where a tab sits along its bar, for the indicator. */
    private spanOf(modeId: string): Span | null {
        const tab = this.tabButtons.get(modeId);
        return tab ? { x: tab.offsetLeft, w: tab.offsetWidth } : null;
    }

    /**
     * Move to `to` (#875). Build the destination in its pane and wait for it to be ready; then pan the
     * camera there — with the door's card flying into its landing — or, off a continuous surface, a
     * deep link or under reduced motion, simply be there. The mode you left goes when the shot lands.
     */
    private async travel(to: string, how: Travel): Promise<void> {
        const strip = this.stripEl;
        const pane = this.panes.get(to);
        if (!strip || !pane || !this.pan) return;
        const generation = ++this.generation;
        this.pan.finish();
        const from = this.activeMode;
        const departing = from && from !== to ? this.panes.get(from) : undefined;
        const nextDoors = how.refresh
            ? this.doorState
            : how.via === "door" && how.origin
              ? doors(this.doorState, { kind: "door", from, to, origin: how.origin })
              : doors(this.doorState, { kind: how.via === "back" ? "back" : how.via === "bar" ? "bar" : "link" });

        // The destination, built before the camera moves (AC-M2): a fresh one every time — the way
        // back lands in a Home drawn again, never a stale picture of it.
        const previous = this.mounted.get(to);
        if (previous) this.removeChild(previous);
        pane.empty();
        const renderer = this.createRenderer(to, pane, how.payload);
        renderer.backTo = nextDoors.back ? { label: t("surface_mode_home"), icon: "arrow-left", onClick: () => void this.goBack() } : null;
        this.mounted.set(to, renderer);
        this.activeMode = to;
        this.updateTabs(to);
        pane.setAttribute("inert", "");
        this.addChild(renderer); // triggers the renderer's onload() → renders into its pane
        const win = ownWindow(pane);
        await Promise.race([renderer.ready(), new Promise<void>((resolve) => win.setTimeout(resolve, MOTION.shotPatience))]);
        if (generation !== this.generation) return;

        const door = how.via === "door" || how.via === "back";
        const landing = door ? renderer.landing(how.via === "back" ? { door: this.doorState.back?.origin } : how.payload) : null;
        if (landing) this.scrollToLanding(pane, landing);
        const origin = how.via === "back" ? this.landedOn : how.from ?? null;
        // Measured where it is now, before the strip moves: the card the flight lifts off.
        const originBox = origin?.isConnected ? origin.getBoundingClientRect() : null;
        const plan = panPlan(this.surface.modes.map((mode) => mode.id), from, to);
        const shot: PanShot = {
            strip,
            rooms: this.surface.modes.map((mode) => this.panes.get(mode.id) as HTMLElement),
            from: plan.from,
            to: plan.to,
            ...(this.inkEl ? { indicator: { el: this.inkEl, from: from ? this.spanOf(from) : null, to: this.spanOf(to) } } : {}),
        };
        const kind = this.continuous && plan.from >= 0 ? shotPlan({ motion: motionWelcome(strip), via: how.via, landing: Boolean(landing && originBox) }) : "instant";
        if (kind === "instant") this.pan.place(shot);
        else
            await this.pan.run(shot, {
                swallow: true,
                ride: () => (kind === "pan+flight" && landing && originBox ? [this.flight(originBox, landing)] : []),
            });
        if (generation !== this.generation) return;

        // Landed: the mode you left goes, the one you came to takes the keys and the focus.
        for (const [mode, other] of this.mounted) {
            if (mode === to) continue;
            this.removeChild(other);
            this.mounted.delete(mode);
            this.panes.get(mode)?.empty();
        }
        departing?.setAttribute("inert", "");
        this.current = renderer;
        for (const [mode, each] of this.panes) {
            const here = mode === to;
            if (here) each.removeAttribute("inert");
            else each.setAttribute("inert", "");
            each.setAttribute("aria-hidden", here ? "false" : "true");
        }
        if (!this.scope) this.scope = new Scope(this.app?.scope);
        renderer.bindKeys(this.scope);
        this.doorState = nextDoors;
        this.landedOn = how.via === "door" ? landing : null;
        if (door) {
            // Focus in the view, so the next Esc can be the way back (and a screen reader follows).
            const active = this.documentOf()?.activeElement ?? null;
            if (!active || !pane.contains(active)) pane.focus({ preventScroll: true });
            if (landing) renderer.landed(landing);
        }
    }

    /** Back to the card you pressed, playing the shot backwards (#875 FR-13). */
    private async goBack(): Promise<void> {
        const back = this.doorState.back;
        if (back) await this.travel(back.to, { via: "back" });
    }

    /** Esc goes back only when nothing else wants it: no text box, no menu, the mode not using it. */
    private onEscape(): false | undefined {
        if (!this.doorState.back) return undefined;
        const doc = this.documentOf();
        const active = (doc?.activeElement ?? null) as HTMLElement | null;
        const tag = active?.tagName;
        const writing = tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable === true;
        const insideView = !active || active === doc?.body || this.contentEl.contains(active);
        const free = escapeIsFree({
            writing,
            insideView,
            overlayOpen: Boolean(doc?.querySelector(OVERLAYS)),
            modeClaims: this.current?.claimsEscape() ?? false,
        });
        if (!free) return undefined;
        void this.goBack();
        return false;
    }

    /** The document this view is in — a pop-out window has its own. */
    private documentOf(): Document | undefined {
        return (this.contentEl as HTMLElement & { doc?: Document }).doc ?? this.contentEl.ownerDocument ?? undefined;
    }

    /** The tabs say which mode is in view; the panel is labelled by it (WAI-ARIA tabs). */
    private updateTabs(modeId: string): void {
        for (const [id, btn] of this.tabButtons) {
            const active = id === modeId;
            btn.toggleClass(c("surface-mode-tab--active"), active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
            btn.setAttribute("tabindex", active ? "0" : "-1"); // roving tabindex
        }
        this.stripEl?.parentElement?.setAttribute("aria-labelledby", `zf-tab-${this.getViewType()}-${modeId}`);
    }

    /** Scroll the pane so the landing sits in its middle — by number, so the set never moves sideways. */
    private scrollToLanding(pane: HTMLElement, landing: HTMLElement): void {
        const top = landing.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
        pane.scrollTop = centeredScrollTop(top, landing.getBoundingClientRect().height, pane.clientHeight, pane.scrollHeight);
    }

    /**
     * The card becoming its place (#875 FR-7, FR-8): a copy of what it lands as, grown from the card
     * you pressed onto where it will be once the camera arrives — the real one shown in the same frame
     * the copy goes, so there is one picture, never two.
     */
    private flight(from: DOMRect, landing: HTMLElement): Animation | null {
        const root = this.rootEl;
        if (!root) return null;
        const ghost = landing.cloneNode(true) as HTMLElement;
        ghost.setAttribute("aria-hidden", "true");
        ghost.setAttribute("inert", "");
        landing.addClass(c("is-in-shot"));
        return fly(root, ghost, from, landing.getBoundingClientRect(), {
            duration: MOTION.turn,
            grown: true,
            land: "become",
            onLanded: () => landing.removeClass(c("is-in-shot")),
        });
    }
}
