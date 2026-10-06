import { Canvas } from "obsidian/canvas";
import { Notice, setIcon } from "obsidian";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { CanvasDock, type DockPanel } from "./utils/CanvasDock";
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
    private panel: DockPanel | undefined;
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
        if (!CanvasHelper.isCanvasFlow(this.plugin, canvas)) {
            this.teardown();
            return;
        }
        this.canvas = canvas;
        if (this.panel?.body.isConnected) return;

        const wrapperEl = canvas?.wrapperEl;
        if (!wrapperEl) {
            log.warn("[Rehearsal] canvas.wrapperEl not available — skipping the rehearsal tab");
            return;
        }
        this.removePanel();
        // The third tab of the canvas dock (#686): opening it starts the walk, folding it ends it.
        this.panel = CanvasDock.of(wrapperEl).panel("rehearse", t("rehearsal_toggle"), 2, {
            icon: "play",
            onOpen: () => void this.begin(),
            onClose: () => this.stop(),
        });
        this.bodyEl = this.panel.body;
    }

    /** Read the flow and stand at its start. */
    private async begin(): Promise<void> {
        const file = CanvasHelper.canvasFile(this.plugin, this.canvas);
        if (!file) return;
        try {
            const flow = await canvasApi.flows.update(file.path);
            this.flow = await readRehearsalFlow(flow);
            this.context = { ...this.context, canvasName: file.basename };
        } catch (error) {
            log.warn("[Rehearsal] could not read this flow", error);
            return;
        }
        // A canvas can hold several flows; starting in the first one found would be a guess.
        const roots = this.flow.steps.filter((step) => step.root);
        this.state = roots.length === 1 ? startRehearsal(this.flow, this.context) : undefined;
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
        body.createDiv({ cls: c("canvas-dock-title"), text: t("rehearsal_title") });
        body.createDiv({ cls: c("rehearsal-note"), text: t("rehearsal_note") });

        this.renderContextForm(body);

        const state = this.state;
        if (!state) {
            this.clearMarks();
            this.renderStarts(body);
            return;
        }

        this.markCanvas(state);

        // The walk as a path (#686): the steps behind you, the one you stand on, and what is next.
        this.renderStepper(body, flow, state);

        this.renderOptions(body, state);
        // An end is a fact worth stating: the walk stops here because there is nowhere else to go.
        if (state.done) body.createDiv({ cls: c("rehearsal-note"), text: t("rehearsal_end") });
        this.renderWouldRun(body, state);
        if (state.done) this.renderOutcome(body, state);

        const restart = body.createEl("button", {
            cls: c("rehearsal-restart"),
            text: t("rehearsal_restart"),
            attr: { type: "button" },
        });
        restart.addEventListener("click", () => {
            // Back to the choice of start, so pressing it visibly does something even when the
            // walk had not moved yet.
            this.state = undefined;
            new Notice(t("rehearsal_restarted"));
            this.render();
        });
    }

    /**
     * The walk, read top to bottom: a dot per step walked, a check on the ones behind you, the
     * current one marked "you are here", and — while the walk goes on — a last row saying what
     * comes next depends on what you choose.
     */
    private renderStepper(body: HTMLElement, flow: RehearsalFlow, state: RehearsalState): void {
        const list = body.createEl("ol", { cls: c("rehearsal-steps") });
        state.path.forEach((id, index) => {
            const current = id === state.currentId;
            const row = list.createEl("li", {
                cls: [c("rehearsal-step"), current ? c("rehearsal-step-current") : c("rehearsal-step-done")],
            });
            const dot = row.createSpan({ cls: c("rehearsal-step-dot") });
            if (current) dot.setText(String(index + 1));
            else setIcon(dot, "check");
            const text = row.createDiv({ cls: c("rehearsal-step-text") });
            text.createDiv({
                cls: c("rehearsal-step-name"),
                text: flow.steps.find((step) => step.id === id)?.label ?? id,
            });
            if (current) text.createDiv({ cls: c("rehearsal-step-hint"), text: t("rehearsal_you_are_here") });
        });
        if (!state.done) {
            const next = list.createEl("li", { cls: [c("rehearsal-step"), c("rehearsal-step-next")] });
            next.createSpan({ cls: c("rehearsal-step-dot"), text: String(state.path.length + 1) });
            const text = next.createDiv({ cls: c("rehearsal-step-text") });
            text.createDiv({ cls: c("rehearsal-step-name"), text: "…" });
            text.createDiv({ cls: c("rehearsal-step-hint"), text: t("rehearsal_next_depends") });
        }
    }

    /**
     * Where to begin. A canvas usually holds several flows — four groups on one board is normal —
     * so the rehearsal asks instead of guessing, and a board with no start says so.
     */
    private renderStarts(body: HTMLElement): void {
        const roots = this.flow?.steps.filter((step) => step.root) ?? [];
        if (roots.length === 0) {
            body.createDiv({ cls: c("rehearsal-note"), text: t("rehearsal_no_root") });
            return;
        }
        body.createDiv({ cls: c("rehearsal-current"), text: t("rehearsal_choose_start") });
        for (const root of roots) {
            const button = body.createEl("button", {
                cls: c("rehearsal-option"),
                text: root.label,
                attr: { type: "button" },
            });
            button.addEventListener("click", () => {
                if (!this.flow) return;
                this.state = startRehearsal(this.flow, this.context, root.id);
                this.render();
            });
        }
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
                this.state = this.restarted();
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
            // The context decides which branches open, so the walk starts again from where it began.
            this.state = this.restarted();
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
            const row = body.createDiv({ cls: c("rehearsal-closed") });
            row.createSpan({ cls: c("rehearsal-closed-label"), text: closed.label });
            row.createSpan({ cls: c("rehearsal-closed-reason"), text: explainBranch(closed.reason, closed.expression) });
        }
    }

    private renderWouldRun(body: HTMLElement, state: RehearsalState): void {
        if (state.wouldRun.length === 0) return;
        body.createDiv({ cls: c("canvas-dock-subtitle"), text: t("rehearsal_would_run") });
        for (const entry of state.wouldRun) {
            const text = [entry.stepLabel, entry.type, entry.description].filter(Boolean).join(" · ");
            body.createDiv({ cls: c("rehearsal-would-run"), text });
        }
    }

    private renderOutcome(body: HTMLElement, state: RehearsalState): void {
        if (!this.flow) return;
        const outcome = rehearsalOutcome(this.flow, state, this.context, t("rehearsal_sample_title"));
        body.createDiv({ cls: c("canvas-dock-subtitle"), text: t("rehearsal_outcome") });

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

    /** The same walk from its own start, re-evaluated against the context as it now stands. */
    private restarted(): RehearsalState | undefined {
        const from = this.state?.path[0];
        if (!this.flow || !from) return undefined;
        return startRehearsal(this.flow, this.context, from);
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
        this.panel?.remove();
        this.panel = undefined;
        this.bodyEl = undefined;
    }

    private teardown(): void {
        this.clearMarks();
        this.removePanel();
        this.state = undefined;
        this.flow = undefined;
    }
}
