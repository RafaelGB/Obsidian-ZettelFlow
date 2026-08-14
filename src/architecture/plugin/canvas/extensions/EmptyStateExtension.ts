import { Canvas, CanvasNode } from "obsidian/canvas";
import { TFile } from "obsidian";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { CommunityTemplatesModal } from "application/community/CommunityTemplatesModal";
import { YamlService } from "architecture/plugin";

/**
 * Injects a non-intrusive guide panel onto a ZettelFlow canvas that has zero
 * workflow step nodes (#258 FR-7–FR-11). The panel auto-dismisses once a step
 * node appears and tears down cleanly on plugin unload.
 */
export default class EmptyStateExtension extends CanvasExtension {
    private panelEl: HTMLElement | undefined;

    init(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("zettelflow-canvas-render", (canvas: Canvas) => {
                this.syncPanel(canvas);
            })
        );
        this.plugin.register(() => this.removePanel());
    }

    private syncPanel(canvas: Canvas): void {
        if (!CanvasHelper.isCanvasFlow(this.plugin)) {
            this.removePanel();
            return;
        }

        const stepCount = this.countStepNodes(canvas);
        if (stepCount > 0) {
            this.removePanel();
            return;
        }

        if (this.panelEl) return; // already shown — idempotent

        const wrapperEl = canvas.wrapperEl;
        if (!wrapperEl) {
            log.warn("[EmptyStateExtension] canvas.wrapperEl not available — skipping panel");
            return;
        }

        this.panelEl = wrapperEl.createDiv({ cls: c("empty-state-panel") });

        this.panelEl.createEl("p", { text: t("canvas_empty_state_message") });

        const ctaRow = this.panelEl.createDiv({ cls: c("empty-state-cta-row") });

        const browseBtn = ctaRow.createEl("button", {
            text: t("canvas_empty_state_cta_browse"),
            cls: "mod-cta",
        });
        browseBtn.addEventListener("click", () => {
            new CommunityTemplatesModal(this.plugin).open();
        });
    }

    /** Count nodes that have ZettelFlow step settings (inline or file-frontmatter). */
    private countStepNodes(canvas: Canvas): number {
        let count = 0;
        try {
            const nodes = canvas?.nodes as Map<string, CanvasNode> | undefined;
            if (!nodes || typeof nodes.forEach !== "function") return 0;
            nodes.forEach((node) => {
                const data = node.getData();
                if (data.type === "text" || data.type === "group") {
                    const config = (data as { zettelflowConfig?: string }).zettelflowConfig;
                    if (config) {
                        const settings = YamlService.instance(config).getZettelFlowSettings();
                        if (settings) count++;
                    }
                } else if (data.type === "file" && data.file) {
                    const file = this.plugin.app.vault.getAbstractFileByPath(data.file);
                    if (file instanceof TFile) {
                        const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
                        if (frontmatter?.zettelFlowSettings) count++;
                    }
                }
            });
        } catch (err) {
            log.warn("[EmptyStateExtension] error counting step nodes", err);
        }
        return count;
    }

    private removePanel(): void {
        this.panelEl?.remove();
        this.panelEl = undefined;
    }
}
