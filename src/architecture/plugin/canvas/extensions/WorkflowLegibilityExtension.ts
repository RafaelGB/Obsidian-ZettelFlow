import { Canvas, CanvasEdge, CanvasNode } from "obsidian/canvas";
import { TFile } from "obsidian";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { YamlService } from "architecture/plugin";
import {
    BLOCK_STYLE,
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
    /** Badge strips this pass created; removed before the next one and on unload (#429). */
    private readonly badgeEls = new Set<HTMLElement>();
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
            if (!CanvasHelper.isCanvasFlow(this.plugin)) return;
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
        this.applyBlockClass(el, shape ? styleForNode(shape) : undefined);
        this.paintBadges(el, shape, this.noteIsGone(node));
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
        const strip = el.createDiv({ cls: c("node-badges") });
        if (noteIsGone) {
            // The one finding that throws mid-wizard is marked without opening the review (#428).
            const alert = strip.createSpan({
                cls: c("node-badge"),
                text: t("node_badge_missing"),
                attr: { "aria-label": t("node_badge_missing") },
            });
            alert.addClass(c("node-badge-alert"));
        }
        for (const badge of badges) {
            const label =
                badge.count === undefined
                    ? t(badge.labelKey as LocaleKey)
                    : `${badge.count} ${badge.count === 1 ? t("node_badge_asks_one") : t("node_badge_asks")}`;
            const chip = strip.createSpan({
                cls: c("node-badge"),
                text: label,
                attr: { "aria-label": label },
            });
            chip.addClass(c(`node-badge-${badge.kind}`));
        }
        this.badgeEls.add(strip);
    }

    private styleEdge(edge: CanvasEdge): void {
        const el = edge?.labelElement?.wrapperEl;
        if (!el) return; // a plain (unlabelled) edge has no wrapper — nothing to annotate
        this.applyBlockClass(el, styleForEdge(edge.label, this.isGatedExit(edge)));
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
        for (const strip of this.badgeEls) strip.remove();
        this.badgeEls.clear();
    }

    private teardown(): void {
        if (this.restyleTimer) window.clearTimeout(this.restyleTimer);
        this.clearStyled();
    }
}
