import { Canvas } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
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
 * A chip in the corner states how many findings the recorded graph has; opening it lists them, and
 * clicking one selects and centres the node it is about. Findings are facts, never judgements, and
 * nothing here blocks anything: a half-built flow is legitimate work in progress.
 *
 * Read-only and fully torn down on unload (§VI): the panel is one element on `canvas.wrapperEl`,
 * every canvas access is feature-detected, and the finder itself cannot write (its guardrail test
 * asserts it imports nothing at all).
 */
export default class FlowReviewExtension extends CanvasExtension {
    private panelEl: HTMLElement | undefined;
    private bodyEl: HTMLElement | undefined;
    private toggleEl: HTMLElement | undefined;
    private timer: number | undefined;
    private open = false;

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
        if (!CanvasHelper.isCanvasFlow(this.plugin)) {
            this.remove();
            return;
        }
        const file = this.plugin.app.workspace.getActiveFile();
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
        if (this.panelEl?.isConnected) return;
        this.remove();
        this.panelEl = wrapperEl.createDiv({ cls: c("flow-review") });
        const toggle = this.panelEl.createEl("button", {
            cls: c("flow-review-toggle"),
            attr: { type: "button", "aria-expanded": String(this.open) },
        });
        this.toggleEl = toggle;
        this.bodyEl = this.panelEl.createDiv({ cls: c("flow-review-body") });
        this.bodyEl.toggleClass(c("is-hidden"), !this.open);
        toggle.addEventListener("click", () => {
            this.open = !this.open;
            toggle.setAttribute("aria-expanded", String(this.open));
            this.bodyEl?.toggleClass(c("is-hidden"), !this.open);
        });
    }

    private render(findings: FlowFinding[]): void {
        const toggle = this.toggleEl;
        const body = this.bodyEl;
        if (!toggle || !body) return;

        toggle.textContent =
            findings.length === 0
                ? t("flow_review_clean_short")
                : `${t("flow_review_toggle")} · ${findings.length}`;
        toggle.toggleClass(c("has-findings"), findings.length > 0);

        body.empty();
        body.createEl("h6", { text: t("flow_review_title") });
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
                text: sentence,
                attr: { type: "button" },
            });
            row.addEventListener("click", () => {
                // The way from a finding to the thing it is about (FR-2).
                CanvasHelper.revealNode(this.plugin, nodeId);
            });
        }
    }

    private remove(): void {
        this.panelEl?.remove();
        this.panelEl = undefined;
        this.bodyEl = undefined;
        this.toggleEl = undefined;
    }

    private teardown(): void {
        if (this.timer) window.clearTimeout(this.timer);
        this.remove();
    }
}
