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
    }

    private styleEdge(edge: CanvasEdge): void {
        const el = edge?.labelElement?.wrapperEl;
        if (!el) return; // a plain (unlabelled) edge has no wrapper — nothing to annotate
        this.applyBlockClass(el, styleForEdge(edge.label));
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

    /** Toggle the block-kind class + tooltip on an element (clearing any stale block class first). */
    private applyBlockClass(el: HTMLElement, style: BlockStyle | undefined): void {
        for (const kind of WORKFLOW_BLOCK_KINDS) el.classList.remove(c(BLOCK_STYLE[kind].cssClass));
        if (!style) return;
        el.classList.add(c(style.cssClass));
        this.styledEls.add(el);
        if (style.tooltipKey) el.setAttribute("aria-label", t(style.tooltipKey as LocaleKey));
    }

    private teardown(): void {
        if (this.restyleTimer) window.clearTimeout(this.restyleTimer);
        for (const el of this.styledEls) {
            for (const kind of WORKFLOW_BLOCK_KINDS) el.classList.remove(c(BLOCK_STYLE[kind].cssClass));
        }
        this.styledEls.clear();
    }
}
