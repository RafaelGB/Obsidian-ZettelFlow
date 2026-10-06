import { Canvas } from "obsidian/canvas";
import { setIcon } from "obsidian";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { CanvasDock, type DockPanel } from "./utils/CanvasDock";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { canvas as canvasApi } from "architecture/plugin/canvas";
import { flowFindings, type FlowFinding } from "application/notes/flowFindings";
import { readFlowShape } from "zettelkasten/review/readFlow";

type LocaleKey = Parameters<typeof t>[0];

/** Collapses a burst of render signals; reading a flow touches the vault. */
const REVIEW_DEBOUNCE_MS = 400;

/**
 * **Review this flow** (#428, epic #422).
 *
 * Nothing about a flow was checked until it ran: a file step pointing at a deleted note threw in
 * the middle of someone writing, and unreachable steps, dead ends, duplicate options or a gate on
 * a key nothing writes looked exactly like working ones.
 *
 * A tab of the canvas dock (#686) states how many findings the recorded graph has; opening it lists them, and
 * clicking one selects and centres the node it is about. Findings are facts, never judgements, and
 * nothing here blocks anything: a half-built flow is legitimate work in progress.
 *
 * Read-only and fully torn down on unload (§VI): the panel is one tab of the dock on `canvas.wrapperEl`,
 * every canvas access is feature-detected, and the finder itself cannot write (its guardrail test
 * asserts it imports nothing at all).
 */
export default class FlowReviewExtension extends CanvasExtension {
    private panel: DockPanel | undefined;
    private timer: number | undefined;

    init(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("zettelflow-canvas-render", (canvas: Canvas) =>
                this.schedule(canvas)
            )
        );
        this.plugin.register(() => this.teardown());
    }

    private schedule(canvas: Canvas): void {
        if (this.timer) window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => void this.sync(canvas), REVIEW_DEBOUNCE_MS);
    }

    private async sync(canvas: Canvas): Promise<void> {
        if (!CanvasHelper.isCanvasFlow(this.plugin, canvas)) {
            this.remove();
            return;
        }
        const file = CanvasHelper.canvasFile(this.plugin, canvas);
        const wrapperEl = canvas?.wrapperEl;
        if (!file || !wrapperEl) return;

        let findings: FlowFinding[];
        try {
            const flow = await canvasApi.flows.update(file.path);
            findings = flowFindings(await readFlowShape(flow));
        } catch (error) {
            log.warn("[FlowReview] could not read this flow", error);
            return;
        }

        this.mount(wrapperEl);
        this.render(findings);
    }

    private mount(wrapperEl: HTMLElement): void {
        if (this.panel?.body.isConnected) return;
        this.remove();
        this.panel = CanvasDock.of(wrapperEl).panel("review", t("flow_review_toggle"), 1, { icon: "list-checks" });
    }

    private render(findings: FlowFinding[]): void {
        const panel = this.panel;
        if (!panel) return;
        // The tab carries the count, or a check when there is nothing to report.
        panel.setCount(findings.length);

        const body = panel.body;
        body.empty();
        body.createDiv({ cls: c("canvas-dock-title"), text: t("flow_review_title") });
        if (findings.length === 0) {
            // Plainly, once, without ceremony (FR-9).
            body.createDiv({ cls: c("flow-review-clean"), text: t("flow_review_clean") });
            return;
        }
        body.createDiv({ cls: c("flow-review-note"), text: t("flow_review_note") });

        for (const finding of findings) {
            const sentence = [
                finding.subject,
                t(finding.messageKey as LocaleKey),
                finding.detail,
            ]
                .filter(Boolean)
                .join(" · ");

            if (!finding.nodeId) {
                body.createDiv({ cls: c("flow-review-finding"), text: sentence });
                continue;
            }
            const nodeId = finding.nodeId;
            const row = body.createEl("button", {
                cls: c("flow-review-finding"),
                attr: { type: "button" },
            });
            setIcon(row.createSpan({ cls: c("flow-review-finding-icon") }), "alert-triangle");
            row.createSpan({ text: sentence });
            row.addEventListener("click", () => {
                // The way from a finding to the thing it is about (FR-2).
                CanvasHelper.revealNode(this.plugin, nodeId);
            });
        }
    }

    private remove(): void {
        this.panel?.remove();
        this.panel = undefined;
    }

    private teardown(): void {
        if (this.timer) window.clearTimeout(this.timer);
        this.remove();
    }
}
