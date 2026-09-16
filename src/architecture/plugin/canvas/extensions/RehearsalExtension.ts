import { Canvas } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { canvas as canvasApi } from "architecture/plugin/canvas";
import type { EvalContext } from "application/notes/conditionEvaluator";
import { explainBranch } from "application/notes/branchExplanationText";
import {
    advanceRehearsal,
    rehearsalOutcome,
    startRehearsal,
    type RehearsalFlow,
    type RehearsalState,
} from "application/notes/rehearsal";
import { readRehearsalFlow } from "zettelkasten/review/readRehearsalFlow";

/**
 * **Rehearse the flow** (#430, epic #422) — the surface.
 *
 * The author walks their own flow with the options they would be offered, sees why a branch is
 * closed where the question is asked, and ends on the note the walk would have produced. Nothing
 * is written: no note, no folder, no frontmatter, no history — the walk is the pure module, which
 * imports no writer at all, and side-effecting actions are **listed**, never run.
 *
 * The canvas is annotated by toggling classes on node elements, as #151 does, and every one of
 * them is removed when the rehearsal closes or the plugin unloads. If the canvas cannot be
 * annotated, the rehearsal still runs as a list (#319's fallback discipline).
 */
export default class RehearsalExtension extends CanvasExtension {
    private panelEl: HTMLElement | undefined;
    private bodyEl: HTMLElement | undefined;
    private canvas: Canvas | undefined;
    private flow: RehearsalFlow | undefined;
    private state: RehearsalState | undefined;
    private context: EvalContext = { frontmatter: {}, noteTitle: "", canvasName: "" };
    private readonly markedEls = new Set<HTMLElement>();

    init(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("zettelflow-canvas-render", (canvas: Canvas) =>
                this.mount(canvas)
            )
        );
        this.plugin.register(() => this.teardown());
    }

    private mount(canvas: Canvas): void {
        if (!CanvasHelper.isCanvasFlow(this.plugin)) {
            this.teardown();
            return;
        }
        this.canvas = canvas;
        if (this.panelEl?.isConnected) return;

        const wrapperEl = canvas?.wrapperEl;
        if (!wrapperEl) {
            log.warn("[Rehearsal] canvas.wrapperEl not available — skipping the rehearsal chip");
            return;
        }
        this.removePanel();
        this.panelEl = wrapperEl.createDiv({ cls: c("rehearsal") });
        const toggle = this.panelEl.createEl("button", {
            cls: c("rehearsal-toggle"),
            text: t("rehearsal_toggle"),
            attr: { type: "button" },
        });
        this.bodyEl = this.panelEl.createDiv({ cls: c("rehearsal-body") });
        this.bodyEl.addClass(c("is-hidden"));
        toggle.addEventListener("click", () => {
            const open = this.bodyEl?.hasClass(c("is-hidden")) ?? false;
            this.bodyEl?.toggleClass(c("is-hidden"), !open);
            if (open) void this.begin();
            else this.stop();
        });
    }

    /** Read the flow and stand at its start. */
    private async begin(): Promise<void> {
        const file = this.plugin.app.workspace.getActiveFile();
        if (!file) return;
        try {
            const flow = await canvasApi.flows.update(file.path);
            this.flow = await readRehearsalFlow(flow);
            this.context = { ...this.context, canvasName: file.basename };
        } catch (error) {
            log.warn("[Rehearsal] could not read this flow", error);
            return;
        }
        this.state = startRehearsal(this.flow, this.context);
        this.render();
    }

    /** Leave the rehearsal: the canvas goes back to exactly what it was. */
    private stop(): void {
        this.state = undefined;
        this.clearMarks();
        this.bodyEl?.empty();
    }

    private render(): void {
        const body = this.bodyEl;
        const flow = this.flow;
        if (!body || !flow) return;
        body.empty();
        body.createEl("h6", { text: t("rehearsal_title") });
        body.createDiv({ cls: c("rehearsal-note"), text: t("rehearsal_note") });

        this.renderContextForm(body);

        const state = this.state;
        if (!state) {
            body.createDiv({ cls: c("rehearsal-note"), text: t("rehearsal_no_root") });
            return;
        }

        this.markCanvas(state);

        // Where the walk stands, and how it got here.
        const current = flow.steps.find((step) => step.id === state.currentId);
        body.createDiv({
            cls: c("rehearsal-current"),
            text: `${t("rehearsal_at")} ${current?.label ?? ""}`,
        });
        body.createDiv({
            cls: c("rehearsal-note"),
            text: state.path
                .map((id) => flow.steps.find((step) => step.id === id)?.label ?? id)
                .join(" → "),
        });

        this.renderOptions(body, state);
        this.renderWouldRun(body, state);
        if (state.done) this.renderOutcome(body, state);

        const restart = body.createEl("button", {
            cls: c("rehearsal-restart"),
            text: t("rehearsal_restart"),
            attr: { type: "button" },
        });
        restart.addEventListener("click", () => {
            this.state = startRehearsal(flow, this.context);
            this.render();
        });
    }

    /**
     * The values a gate reads (FR-4). A rehearsal with an empty context only ever walks one path,
     * so the author supplies the frontmatter the real note would carry — as a form, not as text to
     * be parsed (§XIII).
     */
    private renderContextForm(body: HTMLElement): void {
        const form = body.createDiv({ cls: c("rehearsal-context") });
        form.createDiv({ cls: c("rehearsal-note"), text: t("rehearsal_context") });

        for (const [key, value] of Object.entries(this.context.frontmatter)) {
            const row = form.createDiv({ cls: c("rehearsal-context-row") });
            row.createSpan({ text: `${key}: ${String(value)}` });
            const remove = row.createEl("button", {
                text: t("rehearsal_context_remove"),
                attr: { type: "button" },
            });
            remove.addEventListener("click", () => {
                const { [key]: _gone, ...rest } = this.context.frontmatter;
                this.context = { ...this.context, frontmatter: rest };
                this.state = this.flow ? startRehearsal(this.flow, this.context) : undefined;
                this.render();
            });
        }

        const row = form.createDiv({ cls: c("rehearsal-context-row") });
        const key = row.createEl("input", { type: "text", attr: { "aria-label": t("rehearsal_context_key") } });
        key.placeholder = t("rehearsal_context_key");
        const value = row.createEl("input", { type: "text", attr: { "aria-label": t("rehearsal_context_value") } });
        value.placeholder = t("rehearsal_context_value");
        const add = row.createEl("button", { text: t("rehearsal_context_add"), attr: { type: "button" } });
        add.addEventListener("click", () => {
            const name = key.value.trim();
            if (!name) return;
            this.context = {
                ...this.context,
                frontmatter: { ...this.context.frontmatter, [name]: value.value.trim() },
            };
            // The context decides which branches open, so the walk starts again from the root.
            this.state = this.flow ? startRehearsal(this.flow, this.context) : undefined;
            this.render();
        });
    }

    private renderOptions(body: HTMLElement, state: RehearsalState): void {
        for (const option of state.options) {
            const button = body.createEl("button", {
                cls: c("rehearsal-option"),
                text: option.says ? `${option.label} · ${option.says}` : option.label,
                attr: { type: "button" },
            });
            button.addEventListener("click", () => {
                if (!this.flow || !this.state) return;
                this.state = advanceRehearsal(this.flow, this.context, this.state, option.stepId);
                this.render();
            });
        }

        for (const closed of state.closed) {
            body.createDiv({
                cls: c("rehearsal-closed"),
                text: `${closed.label} · ${explainBranch(closed.reason, closed.expression)}`,
            });
        }
    }

    private renderWouldRun(body: HTMLElement, state: RehearsalState): void {
        if (state.wouldRun.length === 0) return;
        body.createEl("h6", { text: t("rehearsal_would_run") });
        for (const entry of state.wouldRun) {
            const text = [entry.stepLabel, entry.type, entry.description].filter(Boolean).join(" · ");
            body.createDiv({ cls: c("rehearsal-would-run"), text });
        }
    }

    private renderOutcome(body: HTMLElement, state: RehearsalState): void {
        if (!this.flow) return;
        const outcome = rehearsalOutcome(this.flow, state, this.context, t("rehearsal_sample_title"));
        body.createEl("h6", { text: t("rehearsal_outcome") });

        if (outcome.targetFolder) {
            body.createDiv({
                cls: c("rehearsal-note"),
                text: `${t("rehearsal_target")} ${outcome.targetFolder}`,
            });
        }
        for (const satellite of outcome.satellites) {
            body.createDiv({
                cls: c("rehearsal-note"),
                text: `${t("rehearsal_satellite")} ${satellite.title ?? satellite.template ?? ""}`,
            });
        }

        const keys = Object.keys(outcome.preview.frontmatter);
        if (keys.length > 0) {
            body.createDiv({
                cls: c("rehearsal-note"),
                text: `${t("rehearsal_frontmatter")} ${keys.join(", ")}`,
            });
        }
        body.createEl("pre", { cls: c("rehearsal-preview"), text: outcome.preview.body.trim() });
    }

    /** Trace the walk on the canvas itself (FR-2), feature-detected: a failure degrades to the list. */
    private markCanvas(state: RehearsalState): void {
        this.clearMarks();
        try {
            const nodes = this.canvas?.nodes;
            if (!nodes || typeof nodes.get !== "function") {
                log.warn("[Rehearsal] canvas.nodes is not readable — the walk stays in the panel");
                return;
            }
            for (const id of state.path) {
                const el = nodes.get(id)?.nodeEl;
                if (!el) continue;
                el.addClass(c(id === state.currentId ? "rehearsal-node-current" : "rehearsal-node-walked"));
                this.markedEls.add(el);
            }
        } catch (error) {
            log.warn("[Rehearsal] could not annotate the canvas", error);
        }
    }

    private clearMarks(): void {
        for (const el of this.markedEls) {
            el.removeClass(c("rehearsal-node-current"));
            el.removeClass(c("rehearsal-node-walked"));
        }
        this.markedEls.clear();
    }

    private removePanel(): void {
        this.panelEl?.remove();
        this.panelEl = undefined;
        this.bodyEl = undefined;
    }

    private teardown(): void {
        this.clearMarks();
        this.removePanel();
        this.state = undefined;
        this.flow = undefined;
    }
}
