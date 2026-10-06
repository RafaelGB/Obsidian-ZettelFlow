import { Canvas, CanvasEdge, CanvasNode } from "obsidian/canvas";
import { setIcon, TFile } from "obsidian";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { YamlService } from "architecture/plugin";
import {
    BLOCK_STYLE,
    NODE_BADGE_ICON,
    WORKFLOW_BLOCK_KINDS,
    nodeBadges,
    styleForEdge,
    styleForNode,
    type BlockStyle,
    type NodeBlockShape,
} from "architecture/plugin/workflow";

type LocaleKey = Parameters<typeof t>[0];

/** Debounce for the (cheap) restyle pass — collapses a burst of render signals. */
const RESTYLE_DEBOUNCE_MS = 80;

/**
 * Makes the visual workflow language legible **on the canvas itself** (#151, maintainer addendum):
 * WAIT nodes are badged/recolored, WHEN (trigger) roots and IF (`if:`) edges are annotated by kind.
 * It only ever **toggles `c()` classes** on canvas node/edge DOM (styling lives in
 * `workflowCanvas.scss`) — purely **cosmetic**: it changes no execution, traversal, or storage, so
 * removing it (or a Canvas-internals change) leaves every flow byte-identical. Every internal access
 * is **feature-detected** — if Obsidian's Canvas shape changes it `log.warn`s and skips the styling;
 * the workflow still runs. All listeners + applied classes are **torn down on unload**.
 */
export default class WorkflowLegibilityExtension extends CanvasExtension {
    private readonly styledEls = new Set<HTMLElement>();
    /**
     * Everything this pass appended — badge strips (#429), block accents and edge-label icons
     * (#686) — removed before the next pass and on unload. Children we own, never Obsidian's.
     */
    private readonly ownEls = new Set<HTMLElement>();
    private restyleTimer: number | undefined;

    init(): void {
        // The setViewData patch fires this on a canvas (re)render; the popup-menu is a cheap extra hook.
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("zettelflow-canvas-render", (canvas: Canvas) =>
                this.scheduleRestyle(canvas)
            )
        );
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("canvas:popup-menu", (canvas: Canvas) =>
                this.scheduleRestyle(canvas)
            )
        );
        // Teardown: cancel the timer and strip every class we added (no lingering styling on unload).
        this.plugin.register(() => this.teardown());
    }

    private scheduleRestyle(canvas: Canvas): void {
        if (this.restyleTimer) window.clearTimeout(this.restyleTimer);
        this.restyleTimer = window.setTimeout(() => this.applyStyling(canvas), RESTYLE_DEBOUNCE_MS);
    }

    private applyStyling(canvas: Canvas): void {
        // Clear the previous pass first so removed/changed nodes don't keep a stale class or label.
        this.clearStyled();
        try {
            if (!CanvasHelper.isCanvasFlow(this.plugin, canvas)) return;
            const nodes = canvas?.nodes;
            if (!nodes || typeof nodes.forEach !== "function") {
                log.warn("ZettelFlow: workflow legibility skipped — canvas.nodes is not iterable");
                return;
            }
            nodes.forEach((node) => this.styleNode(node));
            const edges = canvas?.edges;
            if (edges && typeof edges.forEach === "function") {
                edges.forEach((edge) => this.styleEdge(edge));
            }
        } catch (error) {
            log.warn("ZettelFlow: workflow legibility styling skipped (canvas internals changed)", error);
        }
    }

    private styleNode(node: CanvasNode): void {
        const el = node?.nodeEl;
        if (!el) return;
        const shape = this.nodeShape(node);
        const style = shape ? styleForNode(shape) : undefined;
        this.applyBlockClass(el, style);
        this.paintAccent(el, style);
        this.paintBadges(el, shape, this.noteIsGone(node));
    }

    /**
     * WHEN and WAIT as an edge you can see (#686): a green or orange bar on the node's left side.
     * It used to be an inset shadow on `nodeEl`, which Obsidian's node container — absolute, full
     * size, with its own background — painted over, so the accent never showed.
     */
    private paintAccent(el: HTMLElement, style: BlockStyle | undefined): void {
        const kind = style === BLOCK_STYLE.when ? "when" : style === BLOCK_STYLE.wait ? "wait" : undefined;
        if (!kind) return;
        const accent = el.createDiv({ cls: [c("node-accent"), c(`node-accent-${kind}`)] });
        this.ownEls.add(accent);
    }

    /**
     * What the step does, on the node itself (#429): the questions it asks, the template it
     * writes, the linked note it creates, that it can be skipped, that some exits are conditional.
     * Every badge is derived at render time — nothing new is stored, and the strip disappears with
     * the extension.
     */
    private paintBadges(
        el: HTMLElement,
        shape: NodeBlockShape | undefined,
        noteIsGone: boolean
    ): void {
        const badges = nodeBadges(shape);
        if (badges.length === 0 && !noteIsGone) return;
        // Icon chips along the node's foot (#686), in the step editor's icon vocabulary. They
        // used to pile up as grey pills in the top-right corner, over the step's own text.
        const strip = el.createDiv({ cls: c("node-badges") });
        if (noteIsGone) {
            // The one finding that throws mid-wizard is marked without opening the review (#428).
            this.badge(strip, "alert", "alert-triangle", t("node_badge_missing"));
        }
        for (const badge of badges) {
            const label =
                badge.count === undefined
                    ? t(badge.labelKey as LocaleKey)
                    : tCount(badge.count, "node_badge_asks", String(badge.count));
            this.badge(strip, badge.kind, NODE_BADGE_ICON[badge.kind], label);
        }
        this.ownEls.add(strip);
    }

    private badge(strip: HTMLElement, kind: string, icon: string, label: string): void {
        const chip = strip.createSpan({ cls: [c("node-badge"), c(`node-badge-${kind}`)] });
        setIcon(chip.createSpan({ cls: c("node-badge-icon") }), icon);
        chip.createSpan({ text: label });
    }

    private styleEdge(edge: CanvasEdge): void {
        const el = edge?.labelElement?.wrapperEl;
        if (!el) return; // a plain (unlabelled) edge has no wrapper — nothing to annotate
        const style = styleForEdge(edge.label, this.isGatedExit(edge));
        this.applyBlockClass(el, style);
        if (style === BLOCK_STYLE.if) {
            // IF reads as a condition (#686): a filter icon before the label's own words.
            const icon = createSpan({ cls: c("edge-if-icon") });
            setIcon(icon, "filter");
            el.prepend(icon);
            this.ownEls.add(icon);
        }
    }

    /** A file node whose note is no longer in the vault — it will stop the wizard (#428 FR-5). */
    private noteIsGone(node: CanvasNode): boolean {
        try {
            const data = node.getData();
            if (data.type !== "file" || !data.file) return false;
            return !(this.plugin.app.vault.getAbstractFileByPath(data.file) instanceof TFile);
        } catch (error) {
            log.warn("ZettelFlow: could not check whether a step's note still exists", error);
            return false;
        }
    }

    /**
     * Whether the step this arrow leaves gates it (#427). The condition no longer has to be written
     * on the label, so the canvas asks the step instead — and an arrow that is only words still
     * shows that it is conditional.
     */
    private isGatedExit(edge: CanvasEdge): boolean {
        try {
            const from = (edge as unknown as { from?: { node?: CanvasNode } }).from?.node;
            const edgeId = (edge as unknown as { id?: string }).id;
            if (!from || !edgeId) return false;
            const settings = this.nodeShape(from) as
                | { exits?: Record<string, { when?: string }> }
                | undefined;
            return Boolean(settings?.exits?.[edgeId]?.when?.trim());
        } catch (error) {
            log.warn("ZettelFlow: could not read a step's exits for legibility", error);
            return false;
        }
    }

    /** Resolve a node's block-relevant settings: inline config for text/group, frontmatter for file. */
    private nodeShape(node: CanvasNode): NodeBlockShape | undefined {
        try {
            const data = node.getData();
            if (data.type === "text" || data.type === "group") {
                const config = (data as { zettelflowConfig?: string }).zettelflowConfig;
                if (!config) return undefined;
                return YamlService.instance(config).getZettelFlowSettings();
            }
            if (data.type === "file" && data.file) {
                const file = this.plugin.app.vault.getAbstractFileByPath(data.file);
                if (file instanceof TFile) {
                    const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
                    const settings: unknown = frontmatter?.zettelFlowSettings;
                    if (settings && typeof settings === "object") return settings;
                }
            }
        } catch (error) {
            log.warn("ZettelFlow: could not read a node's workflow settings for legibility", error);
        }
        return undefined;
    }

    /** Add the block-kind class + tooltip to an element (a prior `clearStyled()` removed any stale one). */
    private applyBlockClass(el: HTMLElement, style: BlockStyle | undefined): void {
        if (!style) return;
        el.classList.add(c(style.cssClass));
        if (style.tooltipKey) el.setAttribute("aria-label", t(style.tooltipKey as LocaleKey));
        this.styledEls.add(el);
    }

    /** Strip every class, label and badge this extension applied — nothing of ours survives it. */
    private clearStyled(): void {
        for (const el of this.styledEls) {
            for (const kind of WORKFLOW_BLOCK_KINDS) el.classList.remove(c(BLOCK_STYLE[kind].cssClass));
            el.removeAttribute("aria-label");
        }
        this.styledEls.clear();
        for (const own of this.ownEls) own.remove();
        this.ownEls.clear();
    }

    private teardown(): void {
        if (this.restyleTimer) window.clearTimeout(this.restyleTimer);
        this.clearStyled();
    }
}
