import { Component, type App } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { activateSurface } from "architecture/plugin";
import { build3DGraph } from "architecture/knowledge/state";
import type { KnowledgeModel } from "architecture/knowledge";
import { communityRgba, readGraphTheme, type GraphTheme } from "architecture/components/core/graph/graphTheme";
import { drawGlimpse, glimpseOf, type Glimpse } from "./glimpse";

/** The glimpse of the last model revision — Home redraws often, the vault changes rarely. */
let cached: { revision: number; glimpse: Glimpse } | null = null;

function glimpseFor(model: KnowledgeModel, now: number): Glimpse {
    const revision = model.revision();
    if (cached?.revision === revision) return cached.glimpse;
    const glimpse = glimpseOf(build3DGraph(model), now);
    cached = { revision, glimpse };
    return glimpse;
}

/**
 * **The vault glimpse** on Home (#705): a small canvas of your vault — regions as nebulae, this
 * week's notes pulsing — that opens Explore. It draws **only while it is on screen** and the
 * window is visible, holds still under reduced motion, and repaints in the theme's colours when the
 * theme changes (§XV). Nothing is written.
 */
export class HomeGlimpse extends Component {
    private canvas: HTMLCanvasElement | undefined;
    private glimpse: Glimpse | undefined;
    private theme: GraphTheme | undefined;
    private frame = 0;
    private visible = false;
    private started = 0;

    constructor(
        private readonly host: HTMLElement,
        private readonly app: App,
        private readonly model: KnowledgeModel
    ) {
        super();
    }

    onload(): void {
        const win = this.window();
        this.glimpse = glimpseFor(this.model, Date.now());
        const box = this.host.createEl("button", {
            cls: c("home-glimpse"),
            attr: { type: "button", "aria-label": t("home_glimpse_open") },
        });
        this.canvas = box.createEl("canvas", { cls: c("home-glimpse-canvas"), attr: { "aria-hidden": "true" } });
        const caption = box.createDiv({ cls: c("home-glimpse-caption") });
        caption.createSpan({
            text: this.glimpse.fresh > 0 ? tCount(this.glimpse.fresh, "home_glimpse_new", String(this.glimpse.fresh)) : t("home_glimpse_still"),
        });
        caption.createSpan({ cls: c("home-glimpse-go"), text: t("home_glimpse_explore") });
        this.registerDomEvent(box, "click", () => void activateSurface(this.app, "zettelflow-explore", "explore"));
        this.readTheme();
        this.registerEvent(this.app.workspace.on("css-change", () => {
            this.readTheme();
            this.paint();
        }));
        // Only while on screen: a glimpse scrolled away, or a window in the background, costs nothing.
        const Observer = (win as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
        if (Observer) {
            const observer = new Observer((entries) => {
                this.visible = entries.some((entry) => entry.isIntersecting);
                this.schedule();
            });
            observer.observe(box);
            this.register(() => observer.disconnect());
        } else {
            this.visible = true;
        }
        this.registerDomEvent(win.document, "visibilitychange", () => this.schedule());
        this.started = win.performance?.now?.() ?? Date.now();
        this.paint();
        this.schedule();
    }

    onunload(): void {
        this.window().cancelAnimationFrame?.(this.frame);
        this.frame = 0;
    }

    private window(): Window {
        return (this.host as HTMLElement & { win?: Window }).win ?? window;
    }

    private reducedMotion(): boolean {
        return this.window().matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    }

    private readTheme(): void {
        const el = this.canvas ?? this.host;
        try {
            const style = this.window().getComputedStyle(el);
            this.theme = readGraphTheme((name) => style.getPropertyValue(name));
        } catch (error) {
            log.warn("[home] could not read the theme for the glimpse", error);
        }
    }

    /** Keep a frame coming only while it is seen, moving, and the window is in front. */
    private schedule(): void {
        const win = this.window();
        if (this.frame || !this.visible || win.document.hidden || this.reducedMotion()) return;
        this.frame = win.requestAnimationFrame(() => {
            this.frame = 0;
            this.paint();
            this.schedule();
        });
    }

    private paint(): void {
        const canvas = this.canvas;
        const glimpse = this.glimpse;
        const theme = this.theme;
        if (!canvas || !glimpse || !theme) return;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (!w || !h) return;
        const ratio = Math.min(2, this.window().devicePixelRatio || 1);
        if (canvas.width !== Math.round(w * ratio)) {
            canvas.width = Math.round(w * ratio);
            canvas.height = Math.round(h * ratio);
        }
        const ctx = canvas.getContext?.("2d");
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const now = this.window().performance?.now?.() ?? Date.now();
        const seconds = this.reducedMotion() ? 0 : Math.max(0, now - this.started) / 1000;
        drawGlimpse(ctx, glimpse, { dark: theme.dark, slot: (slot) => communityRgba(theme, slot) }, w, h, seconds);
    }
}
