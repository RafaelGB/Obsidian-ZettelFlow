import { parseYaml } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import type { ZfTemplate } from "application/template/zfTemplate";
import { templateGraph, type TemplateGraph } from "./templateGraph";
import { flowFindings } from "application/notes/flowFindings";
import { explainBranch } from "application/notes/branchExplanationText";
import {
    advanceRehearsal,
    rehearsalOutcome,
    startRehearsal,
    type RehearsalState,
} from "application/notes/rehearsal";
import type { EvalContext } from "application/notes/conditionEvaluator";

type LocaleKey = Parameters<typeof t>[0];

/**
 * **Try a system before you install it** (#438, epic #434).
 *
 * The same walk (#430) and the same reading (#428) your own flows get, run against a
 * `.zftemplate` held in memory. Nothing is created and nothing is read from the vault: the step
 * contents travel inside the template, so this answers "what would this do to my vault?" without
 * touching it.
 *
 * Side-effecting actions are **listed**, never executed — which matters more here than anywhere
 * else, because this is code from the internet.
 */
export class SystemRehearsalPanel {
    private graph: TemplateGraph | undefined;
    private state: RehearsalState | undefined;
    private context: EvalContext = { frontmatter: {}, noteTitle: "", canvasName: "" };

    constructor(private template: ZfTemplate, private host: HTMLElement) {}

    /** Read the template once; a bundle we cannot parse says so instead of throwing at the user. */
    render(): void {
        this.host.empty();
        if (!this.graph) {
            try {
                this.graph = templateGraph(this.template, (yaml) => parseYaml(yaml));
            } catch (error) {
                log.warn("[gallery] could not read this system as a graph", error);
                this.host.createDiv({ cls: c("rehearsal-note"), text: t("community_system_try_failed") });
                return;
            }
            this.state = startRehearsal(this.graph.rehearsal, this.context);
        }
        const graph = this.graph;

        this.host.createDiv({ cls: c("rehearsal-note"), text: t("community_system_try_intro") });
        this.renderFindings(graph);
        this.renderContext();

        const state = this.state;
        if (!state) {
            this.host.createDiv({ cls: c("rehearsal-note"), text: t("rehearsal_no_root") });
            return;
        }

        const current = graph.rehearsal.steps.find((step) => step.id === state.currentId);
        this.host.createDiv({
            cls: c("rehearsal-current"),
            text: `${t("rehearsal_at")} ${current?.label ?? ""}`,
        });

        for (const option of state.options) {
            const button = this.host.createEl("button", {
                cls: c("rehearsal-option"),
                text: option.says ? `${option.label} · ${option.says}` : option.label,
                attr: { type: "button" },
            });
            button.addEventListener("click", () => {
                if (!this.state) return;
                this.state = advanceRehearsal(graph.rehearsal, this.context, this.state, option.stepId);
                this.render();
            });
        }
        for (const closed of state.closed) {
            this.host.createDiv({
                cls: c("rehearsal-closed"),
                text: `${closed.label} · ${explainBranch(closed.reason, closed.expression)}`,
            });
        }

        if (state.wouldRun.length > 0) {
            this.host.createEl("h6", { text: t("rehearsal_would_run") });
            for (const entry of state.wouldRun) {
                this.host.createDiv({
                    cls: c("rehearsal-would-run"),
                    text: [entry.stepLabel, entry.type, entry.description].filter(Boolean).join(" · "),
                });
            }
        }

        if (state.done) this.renderOutcome(graph, state);

        const restart = this.host.createEl("button", {
            cls: c("rehearsal-restart"),
            text: t("rehearsal_restart"),
            attr: { type: "button" },
        });
        restart.addEventListener("click", () => {
            this.state = startRehearsal(graph.rehearsal, this.context);
            this.render();
        });
    }

    /** What the review says about the system — facts about the graph, not a rating of its author. */
    private renderFindings(graph: TemplateGraph): void {
        const findings = flowFindings(graph.findings);
        if (findings.length === 0) {
            this.host.createDiv({ cls: c("rehearsal-note"), text: t("flow_review_clean") });
            return;
        }
        this.host.createEl("h6", { text: t("flow_review_title") });
        for (const finding of findings) {
            this.host.createDiv({
                cls: c("rehearsal-closed"),
                text: [finding.subject, t(finding.messageKey as LocaleKey), finding.detail]
                    .filter(Boolean)
                    .join(" · "),
            });
        }
    }

    /** The frontmatter a gate would read; without it the walk only ever takes one path. */
    private renderContext(): void {
        const row = this.host.createDiv({ cls: c("rehearsal-context-row") });
        const key = row.createEl("input", {
            type: "text",
            attr: { "aria-label": t("rehearsal_context_key") },
        });
        key.placeholder = t("rehearsal_context_key");
        const value = row.createEl("input", {
            type: "text",
            attr: { "aria-label": t("rehearsal_context_value") },
        });
        value.placeholder = t("rehearsal_context_value");
        const add = row.createEl("button", {
            text: t("rehearsal_context_add"),
            attr: { type: "button" },
        });
        add.addEventListener("click", () => {
            const name = key.value.trim();
            if (!name || !this.graph) return;
            this.context = {
                ...this.context,
                frontmatter: { ...this.context.frontmatter, [name]: value.value.trim() },
            };
            this.state = startRehearsal(this.graph.rehearsal, this.context);
            this.render();
        });

        const current = Object.entries(this.context.frontmatter);
        if (current.length > 0) {
            this.host.createDiv({
                cls: c("rehearsal-note"),
                text: current.map(([name, held]) => `${name}: ${String(held)}`).join(" · "),
            });
        }
    }

    private renderOutcome(graph: TemplateGraph, state: RehearsalState): void {
        const outcome = rehearsalOutcome(
            graph.rehearsal,
            state,
            this.context,
            t("rehearsal_sample_title")
        );
        this.host.createEl("h6", { text: t("rehearsal_outcome") });
        if (outcome.targetFolder) {
            this.host.createDiv({
                cls: c("rehearsal-note"),
                text: `${t("rehearsal_target")} ${outcome.targetFolder}`,
            });
        }
        for (const satellite of outcome.satellites) {
            this.host.createDiv({
                cls: c("rehearsal-note"),
                text: `${t("rehearsal_satellite")} ${satellite.title ?? satellite.template ?? ""}`,
            });
        }
        this.host.createEl("pre", {
            cls: c("rehearsal-preview"),
            text: outcome.preview.body.trim(),
        });
    }
}
