import { setIcon } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { STILL, type Cam } from "architecture/components/core/reader/readerShot";
import { FolderSuggest } from "architecture/settings/suggesters/FolderSuggest";
import { flowFolders } from "architecture/plugin/canvas/flowRole";
import type { StaticTemplateOptions } from "config";
import type { ZfTemplate } from "application/template/zfTemplate";
import { flowFindings } from "application/notes/flowFindings";
import { explainBranch } from "application/notes/branchExplanationText";
import { advanceRehearsal, rehearsalOutcome, startRehearsal, type RehearsalOption, type RehearsalState } from "application/notes/rehearsal";
import type { EvalContext } from "application/notes/conditionEvaluator";
import type { StepSettings } from "zettelkasten";
import { templateGraph, type ParseYaml, type TemplateGraph } from "../templateGraph";
import { askOf, frameStep, type SystemDrawing } from "../systemDrawing";
import { executableCodeSites, sanitizeFolderSegment } from "../systemInstall";
import { installDestination, type InstallRole } from "../installDestination";
import { consequence } from "../installConsequence";
import { installSystem, type InstallOutcome } from "../installSystem";
import { installsOf, nextFreeFolder } from "../installRecord";
import { summaryOf } from "../systemsCatalog";
import type { CommunityRoomHost } from "./communityRoomHost";
import { drawSystem, markWalk, moveCamera, placeCamera, travelDot, type DrawingView } from "./systemDrawingView";
import { SHOT, boxOf, play, type Box } from "./systemShots";

type LocaleKey = Parameters<typeof t>[0];

/** The five answers to *how will you use it?*, in the order they are offered. */
export const INSTALL_ROLES: readonly InstallRole[] = ["create", "edit", "folder", "event", "none"];

/** Literal keys, so the locale guardrail sees each one. */
const USE_KEY: Record<InstallRole, LocaleKey> = {
    create: "community_use_create",
    edit: "community_use_edit",
    folder: "community_use_folder",
    event: "community_use_event",
    none: "community_system_role_none",
};

const USE_DESC_KEY: Record<InstallRole, LocaleKey> = {
    create: "community_use_desc_create",
    edit: "community_use_desc_edit",
    folder: "community_use_desc_folder",
    event: "community_use_desc_event",
    none: "community_use_desc_none",
};

/** The level as three dots, and in words for whoever cannot see them. */
export function difficultyDots(parent: HTMLElement, level: string | undefined): void {
    const filled = level === "easy" ? 1 : level === "medium" ? 2 : level === "hard" ? 3 : 0;
    const dots = parent.createSpan({
        cls: c("system-dots"),
        attr: filled ? { role: "img", "aria-label": t(`system_difficulty_${level}` as LocaleKey) } : { "aria-hidden": "true" },
    });
    for (let i = 1; i <= 3; i++) dots.createSpan({ cls: i <= filled ? [c("system-dot-level"), "is-on"].join(" ") : c("system-dot-level") });
}

/** `4 steps · 1 branch point`, or `1 step`. */
export function stepsText(steps: number | undefined, branches: number | undefined): string {
    const count = steps ?? 0;
    const said = tCount(count, "community_systems_steps", String(count));
    if (count <= 1) return said;
    const forks = branches ?? 0;
    return `${said} · ${tCount(forks, "community_systems_branches", String(forks))}`;
}

/** A question a step asks, and its options when it offers any. */
function questionsOf(settings: StepSettings | undefined): { label: string; options: string[] }[] {
    return (settings?.actions ?? [])
        .filter((action) => action.hasUI)
        .map((action) => {
            const raw = (action as { options?: unknown }).options;
            const options = Array.isArray(raw)
                ? raw.map((option) => (Array.isArray(option) ? String(option[1] ?? option[0]) : String(option)))
                : [];
            return { label: askOf(action), options };
        });
}

/** A way out of the step the walk stands on — open, or opened by the answer it carries. */
interface WalkExit {
    stepId: string;
    label: string;
    says: string;
    answer?: { key: string; value: string };
}

export interface SystemPanelOptions {
    host: CommunityRoomHost;
    entry: StaticTemplateOptions;
    /** Null when the template could not be fetched: the panel says so, and offers to try again. */
    template: ZfTemplate | null;
    drawing: SystemDrawing | null;
    parseYaml: ParseYaml;
    lang: string;
    onBack(): void;
    onRetry(): void;
    onInstalled(outcome: Extract<InstallOutcome, { kind: "installed" }>, role: InstallRole): void;
}

/**
 * **A system, open in place** (#799 FR-7 – FR-12): the stage with its full drawing on the left, and
 * on the right what it is, the walk, how you will use it, what will happen, and Install.
 *
 * The walk is the rehearsal (#438) **on the drawing**: the step you are at is lit, the ones you
 * walked stay marked, the edges you took stay drawn, and choosing an exit sends a dot along its
 * edge while the camera frames where it leads. Nothing is read from the vault and nothing is
 * written until Install — and Install opens no dialog, because the sentence above it already said
 * exactly what it would do.
 */
export class SystemPanel {
    readonly el: HTMLElement;
    readonly stage: HTMLElement;
    view: DrawingView | null = null;
    private side!: HTMLElement;
    private walkBody: HTMLElement | null = null;
    private graph: TemplateGraph | null = null;
    private state: RehearsalState | undefined;
    /** A property you pretend the note has (#438's review), and the answers the walk gave its gates. */
    private pretend: Record<string, unknown> = {};
    private answers: Record<string, unknown> = {};
    private get context(): EvalContext {
        return { frontmatter: { ...this.pretend, ...this.answers }, noteTitle: "", canvasName: "" };
    }
    private visited = new Set<string>();
    private taken = new Set<string>();
    private cam: Cam = STILL;
    private moving = false;
    private role: InstallRole;
    private changing = false;
    private targetFolder: string;
    private roleFolder = "";
    private acknowledged: boolean;
    private installing = false;
    private disposed = false;
    private useEl: HTMLElement | null = null;
    private consequenceEl: HTMLElement | null = null;
    private installButton: HTMLButtonElement | null = null;
    private statusEl: HTMLElement | null = null;
    private fieldProblemEl: HTMLElement | null = null;

    constructor(parent: HTMLElement, private readonly options: SystemPanelOptions) {
        const { host, entry, template } = options;
        const settings = host.plugin.settings;
        // Today's rule (#437): *Create notes* only when no canvas holds that role yet, so the default
        // is never destructive.
        this.role = settings.ribbonCanvas ? "none" : "create";
        const base = settings.foldersFlowsPath || "";
        const segment = sanitizeFolderSegment(template?.name ?? entry.title);
        const preferred = segment ? (base ? `${base}/${segment}` : segment) : base;
        const copies = installsOf(settings.installedSystems, entry.ref);
        // Another copy never lands on the first one.
        this.targetFolder = copies.length > 0
            ? nextFreeFolder(preferred, (path) => Boolean(host.app.vault.getAbstractFileByPath(path)) || copies.some((copy) => copy.folder === path))
            : preferred;
        this.acknowledged = template ? executableCodeSites(template).length === 0 : true;

        this.el = parent.createDiv({ cls: c("system-open") });
        const crumb = this.el.createDiv({ cls: c("system-crumb") });
        const back = crumb.createEl("button", { cls: c("system-crumb-back"), attr: { type: "button", "aria-label": t("community_systems_back") } });
        setIcon(back.createSpan({ cls: c("system-crumb-icon") }), "chevron-left");
        back.createSpan({ text: t("community_room_systems") });
        back.addEventListener("click", () => options.onBack());
        const grid = this.el.createDiv({ cls: c("system-open-grid") });
        this.stage = grid.createDiv({ cls: c("system-stage") });
        this.side = grid.createDiv({ cls: c("system-side") });
        this.render();
    }

    /** The stage's box on screen, where the card's drawing lands. */
    stageBox(): Box {
        return boxOf(this.stage);
    }

    /** The ghost has landed: the stage's own drawing is the picture now. */
    landed(): void {
        this.stage.removeClass("is-waiting");
    }

    /** Draw the stage and the side panel. The stage's drawing waits, hidden, for the ghost to land. */
    private render(): void {
        const { entry, template, drawing } = this.options;
        this.stage.empty();
        if (drawing) {
            this.stage.addClass("is-waiting");
            this.view = drawSystem(this.stage, drawing, "full");
            placeCamera(this.view, STILL);
        }
        const side = this.side;
        side.empty();
        side.createEl("h2", { cls: c("system-name"), text: template?.name ?? entry.title });
        side.createEl("p", { cls: c("system-lede"), text: summaryOf(entry, this.options.lang) });
        const facts = side.createDiv({ cls: c("system-facts") });
        difficultyDots(facts, entry.difficulty);
        if (entry.difficulty) facts.createSpan({ text: t(`system_difficulty_${entry.difficulty}`) });
        facts.createSpan({ text: stepsText(drawing?.steps ?? entry.steps, drawing?.branches ?? entry.branches) });
        facts.createSpan({ text: t("community_systems_by", template?.author ?? entry.author) });

        if (!template) {
            const failed = side.createDiv({ cls: c("system-unreachable"), attr: { role: "status" } });
            failed.createEl("p", { text: t("community_systems_template_unreachable") });
            const retry = failed.createEl("button", { cls: "mod-cta", text: t("community_systems_try_again"), attr: { type: "button" } });
            retry.addEventListener("click", () => this.options.onRetry());
            return;
        }
        this.renderWalkBlock(template);
        this.renderUse();
        this.consequenceEl = side.createEl("p", { cls: c("system-consequence"), attr: { "aria-live": "polite" } });
        this.sayConsequence();
        this.renderCode(template);
        this.renderInstall();
    }

    // ── the walk ────────────────────────────────────────────────────────────────

    private renderWalkBlock(template: ZfTemplate): void {
        const block = this.side.createEl("section", { cls: c("system-block") });
        const head = block.createEl("h4", { cls: c("system-block-title") });
        setIcon(head.createSpan({ cls: c("system-block-icon") }), "play");
        head.createSpan({ text: t("community_walk_title") });
        this.walkBody = block.createDiv({ cls: c("system-walk") });
        try {
            this.graph = templateGraph(template, this.options.parseYaml);
        } catch (error) {
            log.warn("[gallery] could not read this system as a graph", error);
            this.walkBody.createEl("p", { cls: c("system-note"), text: t("community_system_try_failed") });
            return;
        }
        this.restart();
    }

    /** Stand at the start: the root, or — for a single note with no root marked — its only step. */
    private start(): RehearsalState | undefined {
        const flow = this.graph?.rehearsal;
        if (!flow) return undefined;
        const started = startRehearsal(flow, this.context);
        if (started) return started;
        const entered = new Set(flow.edges.map((edge) => edge.toNode));
        const first = flow.steps.find((step) => !entered.has(step.id)) ?? flow.steps[0];
        return first ? startRehearsal(flow, this.context, first.id) : undefined;
    }

    /** Again from the start: the answers the walk gave are forgotten, a property you pretended is kept. */
    private restart(): void {
        this.answers = {};
        this.state = this.start();
        this.visited = new Set(this.state?.path ?? []);
        this.taken = new Set();
        if (this.view) {
            const from = this.cam;
            this.cam = STILL;
            markWalk(this.view, this.state?.currentId, this.visited, this.taken);
            void play(this.view.el, [moveCamera(this.view, from, STILL, SHOT.frame)], SHOT.frame);
        }
        this.renderWalk();
    }

    private renderWalk(): void {
        const body = this.walkBody;
        const graph = this.graph;
        if (!body || !graph) return;
        body.empty();
        const state = this.state;
        if (!state) {
            body.createEl("p", { cls: c("system-note"), text: t("rehearsal_no_root") });
            return;
        }
        const step = graph.rehearsal.steps.find((candidate) => candidate.id === state.currentId);
        body.createDiv({ cls: c("system-walk-at"), text: step?.label ?? "" });
        for (const question of questionsOf(graph.settings.get(state.currentId ?? ""))) {
            const ask = body.createDiv({ cls: c("system-ask") });
            ask.createSpan({ text: question.label });
            if (question.options.length > 0) {
                const options = ask.createDiv({ cls: c("system-ask-options") });
                for (const option of question.options) options.createSpan({ cls: c("system-ask-option"), text: option });
            }
        }

        const exits = this.exitsAt(state);
        if (exits.length > 0) {
            const list = body.createDiv({ cls: c("system-exits") });
            for (const exit of exits) this.renderExit(list, exit);
        } else {
            const end = body.createDiv({ cls: c("system-walk-end") });
            end.createSpan({ text: t("community_walk_end") });
            if (state.path.length > 1) {
                const again = end.createEl("button", { text: t("community_walk_again"), attr: { type: "button" } });
                again.addEventListener("click", () => this.restart());
            }
        }
        // A branch no single answer opens is said, with #414's own explanation.
        const answerable = new Set(exits.map((exit) => exit.stepId));
        for (const closed of state.closed.filter((branch) => !answerable.has(branch.id))) {
            body.createDiv({ cls: c("system-note"), text: `${closed.label} · ${explainBranch(closed.reason, closed.expression)}` });
        }
        if (state.wouldRun.length > 0) {
            body.createEl("h6", { cls: c("system-walk-subtitle"), text: t("rehearsal_would_run") });
            for (const entry of state.wouldRun) {
                body.createDiv({ cls: c("system-note"), text: [entry.stepLabel, entry.type, entry.description].filter(Boolean).join(" · ") });
            }
        }
        if (state.done) this.renderOutcome(graph, state, body);
        this.renderReview(graph, body);
        body.createEl("p", { cls: c("system-walk-footer"), text: t("community_walk_footer") });
    }

    /**
     * The ways out of where the walk stands: the exits open now, and the ones a gate keeps closed
     * until the step's question is answered (`frontmatter.origin === "source"`). Taking one of those
     * *is* the answer — the walk takes it as if you had picked that option in the wizard.
     */
    private exitsAt(state: RehearsalState): WalkExit[] {
        const config = this.graph?.settings.get(state.currentId ?? "")?.exits ?? {};
        const edgeTo = (stepId: string) => this.options.drawing?.edges.find((edge) => edge.from === state.currentId && edge.to === stepId);
        const open: WalkExit[] = state.options.map((option: RehearsalOption) => ({ stepId: option.stepId, label: option.label, says: option.says?.trim() || option.label }));
        const answered: WalkExit[] = [];
        for (const branch of state.closed) {
            const reason = branch.reason;
            if (reason.kind !== "comparison" || reason.operator !== "===" || !reason.path.startsWith("frontmatter.")) continue;
            const edge = edgeTo(branch.id);
            const says = (edge ? config[edge.id]?.says?.trim() : undefined) || branch.label;
            answered.push({ stepId: branch.id, label: branch.label, says, answer: { key: reason.path.slice("frontmatter.".length), value: reason.expected } });
        }
        return [...open, ...answered];
    }

    private renderExit(parent: HTMLElement, exit: WalkExit): void {
        const button = parent.createEl("button", { cls: c("system-exit"), attr: { type: "button", "data-step": exit.stepId } });
        setIcon(button.createSpan({ cls: c("system-exit-icon") }), "corner-down-right");
        button.createSpan({ cls: c("system-exit-says"), text: exit.says });
        if (exit.says !== exit.label) button.createSpan({ cls: c("system-exit-to"), text: `→ ${exit.label}` });
        button.addEventListener("click", () => void this.walkTo(exit.stepId));
    }

    /** Take an exit: the walk advances, a dot runs its edge, the camera frames where it leads. */
    async walkTo(stepId: string): Promise<void> {
        const graph = this.graph;
        const state = this.state;
        if (!graph || !state || this.moving) return;
        const from = state.currentId;
        const exit = this.exitsAt(state).find((candidate) => candidate.stepId === stepId);
        let here = state;
        if (exit?.answer) {
            // The answer opens the gate: walk the same path again with it, then take the exit.
            this.answers = { ...this.answers, [exit.answer.key]: exit.answer.value };
            let replay = this.start();
            for (const id of state.path.slice(1)) if (replay) replay = advanceRehearsal(graph.rehearsal, this.context, replay, id);
            if (replay) here = replay;
        }
        const next = advanceRehearsal(graph.rehearsal, this.context, here, stepId);
        if (next === here) return;
        this.state = next;
        this.visited.add(stepId);
        const edge = this.options.drawing?.edges.find((candidate) => candidate.from === from && candidate.to === stepId);
        if (edge) this.taken.add(edge.id);
        this.renderWalk();
        const view = this.view;
        const drawing = this.options.drawing;
        if (!view || !drawing) return;
        markWalk(view, stepId, this.visited, this.taken);
        const frame = boxOf(this.stage);
        const to = frameStep(drawing, stepId, { width: frame.width, height: frame.height });
        const camFrom = this.cam;
        this.cam = to;
        this.moving = true;
        try {
            await play(view.el, [edge ? travelDot(view, edge, SHOT.walk) : null, moveCamera(view, camFrom, to, SHOT.frame)], SHOT.frame);
        } finally {
            this.moving = false;
        }
    }

    private renderOutcome(graph: TemplateGraph, state: RehearsalState, body: HTMLElement): void {
        const outcome = rehearsalOutcome(graph.rehearsal, state, this.context, t("rehearsal_sample_title"));
        if (outcome.targetFolder) body.createDiv({ cls: c("system-note"), text: `${t("rehearsal_target")} ${outcome.targetFolder}` });
        for (const satellite of outcome.satellites) {
            body.createDiv({ cls: c("system-note"), text: `${t("rehearsal_satellite")} ${satellite.title ?? satellite.template ?? ""}` });
        }
    }

    /** #438's review and its *pretend a property*, folded under the walk so it stays a walk. */
    private renderReview(graph: TemplateGraph, body: HTMLElement): void {
        const details = body.createEl("details", { cls: c("system-review") });
        details.createEl("summary", { text: t("flow_review_title") });
        const findings = flowFindings(graph.findings);
        if (findings.length === 0) details.createDiv({ cls: c("system-note"), text: t("flow_review_clean") });
        for (const finding of findings) {
            details.createDiv({
                cls: c("system-note"),
                text: [finding.subject, t(finding.messageKey as LocaleKey), finding.detail].filter(Boolean).join(" · "),
            });
        }
        details.createDiv({ cls: c("system-note"), text: t("rehearsal_context") });
        const row = details.createDiv({ cls: c("system-context-row") });
        const key = row.createEl("input", { attr: { type: "text", "aria-label": t("rehearsal_context_key"), placeholder: t("rehearsal_context_key") } });
        const value = row.createEl("input", { attr: { type: "text", "aria-label": t("rehearsal_context_value"), placeholder: t("rehearsal_context_value") } });
        const add = row.createEl("button", { text: t("rehearsal_context_add"), attr: { type: "button" } });
        add.addEventListener("click", () => {
            const name = key.value.trim();
            if (!name) return;
            this.pretend = { ...this.pretend, [name]: value.value.trim() };
            this.restart();
        });
        const held = Object.entries(this.pretend);
        if (held.length > 0) details.createDiv({ cls: c("system-note"), text: held.map(([name, v]) => `${name}: ${String(v)}`).join(" · ") });
    }

    // ── how will you use it? ────────────────────────────────────────────────────

    private renderUse(): void {
        const block = this.side.createEl("section", { cls: c("system-block") });
        block.createEl("h4", { cls: c("system-block-title"), text: t("community_use_title") });
        this.useEl = block.createDiv({ cls: c("system-use") });
        this.drawUse();
    }

    private drawUse(): void {
        const use = this.useEl;
        if (!use) return;
        use.empty();
        if (!this.changing) {
            const summary = use.createEl("button", { cls: c("system-use-current"), attr: { type: "button", "aria-expanded": "false" } });
            const text = summary.createSpan({ cls: c("system-use-text") });
            text.createEl("b", { text: t(USE_KEY[this.role]) });
            text.createEl("small", { text: t(USE_DESC_KEY[this.role]) });
            summary.createSpan({ cls: c("system-use-change"), text: t("community_use_change") });
            summary.addEventListener("click", () => {
                this.changing = true;
                this.drawUse();
            });
        } else {
            const list = use.createDiv({ cls: c("system-use-roles"), attr: { role: "radiogroup", "aria-label": t("community_use_title") } });
            for (const role of INSTALL_ROLES) {
                const label = list.createEl("label", { cls: role === this.role ? [c("system-use-choice"), "is-active"].join(" ") : c("system-use-choice") });
                const radio = label.createEl("input", { attr: { type: "radio", name: "zf-system-role", value: role } });
                radio.checked = role === this.role;
                const text = label.createSpan({ cls: c("system-use-text") });
                text.createEl("b", { text: t(USE_KEY[role]) });
                text.createEl("small", { text: t(USE_DESC_KEY[role]) });
                radio.addEventListener("change", () => this.choose(role));
            }
        }
        this.drawField(use);
    }

    /** Choose a role: the list folds back to the one chosen, and the sentence below is rewritten. */
    choose(role: InstallRole): void {
        this.role = role;
        this.changing = false;
        this.drawUse();
        this.sayConsequence();
        this.setStatus("");
    }

    /** The folder a folder flow runs on, or where the files go — the event role decides its own. */
    private drawField(use: HTMLElement): void {
        if (this.role === "event") {
            this.fieldProblemEl = use.createDiv({ cls: c("system-field-problem") });
            return;
        }
        const field = use.createEl("label", { cls: c("system-field") });
        const folderRole = this.role === "folder";
        field.createSpan({ cls: c("system-field-label"), text: folderRole ? t("assign_role_folder") : t("community_system_install_location") });
        const input = field.createEl("input", { attr: { type: "text", spellcheck: "false" } });
        input.value = folderRole ? this.roleFolder : this.targetFolder;
        const update = () => {
            if (folderRole) this.roleFolder = input.value;
            else this.targetFolder = input.value;
            this.fieldProblemEl?.setText("");
            this.sayConsequence();
        };
        input.addEventListener("input", update);
        try {
            new FolderSuggest(input, () => update());
        } catch (error) {
            log.debug("[gallery] no folder suggestions here", error);
        }
        this.fieldProblemEl = use.createDiv({ cls: c("system-field-problem"), attr: { role: "status" } });
    }

    /** The one sentence: what is created and where, how it runs, what it displaces, and the undo. */
    private sayConsequence(): void {
        const el = this.consequenceEl;
        const template = this.options.template;
        if (!el || !template) return;
        const destination = installDestination({
            role: this.role,
            targetFolder: this.targetFolder,
            canvasFilename: template.canvas.filename,
            folders: flowFolders(this.options.host.plugin.settings),
            folder: this.roleFolder,
        });
        const parts = consequence({ role: this.role, destination, fileCount: 1 + template.steps.length, canvasFilename: template.canvas.filename });
        el.setText(
            parts
                .map((part) => (part.count === undefined ? t(part.key as LocaleKey, ...part.args) : tCount(part.count, part.key as LocaleKey, ...part.args)))
                .join(" ")
        );
    }

    // ── the code it brings, and Install ─────────────────────────────────────────

    private renderCode(template: ZfTemplate): void {
        const sites = executableCodeSites(template);
        if (sites.length === 0) return;
        const block = this.side.createDiv({ cls: c("system-code") });
        const head = block.createEl("p", { cls: c("system-code-title") });
        setIcon(head.createSpan({ cls: c("system-code-icon") }), "alert-triangle");
        head.createSpan({ text: t("community_code_brings") });
        const list = block.createEl("ul", { cls: c("system-code-sites") });
        for (const site of sites) list.createEl("li", { text: `${site.filename} — ${site.actionType}` });
        const ack = block.createEl("label", { cls: c("system-code-ack") });
        const box = ack.createEl("input", { attr: { type: "checkbox" } });
        ack.createSpan({ text: t("community_code_ack") });
        box.addEventListener("change", () => {
            this.acknowledged = box.checked;
            if (this.installButton) this.installButton.disabled = !this.acknowledged || this.installing;
        });
    }

    private renderInstall(): void {
        const row = this.side.createDiv({ cls: c("system-install-row") });
        const again = installsOf(this.options.host.plugin.settings.installedSystems, this.options.entry.ref).length > 0;
        this.installButton = row.createEl("button", {
            cls: ["mod-cta", c("system-install")].join(" "),
            text: again ? t("community_install_another") : t("community_install"),
            attr: { type: "button" },
        });
        this.installButton.disabled = !this.acknowledged;
        this.installButton.addEventListener("click", () => void this.install());
        this.statusEl = row.createDiv({ cls: c("system-install-status"), attr: { role: "status", "aria-live": "polite" } });
    }

    private setStatus(text: string): void {
        this.statusEl?.setText(text);
    }

    /** Install, in place: every outcome but success is said here, next to what caused it. */
    async install(): Promise<void> {
        const template = this.options.template;
        const button = this.installButton;
        if (!template || !button || this.installing || !this.acknowledged) return;
        this.installing = true;
        button.disabled = true;
        this.fieldProblemEl?.setText("");
        this.setStatus(t("community_system_installing"));
        const role = this.role;
        let outcome: InstallOutcome;
        try {
            outcome = await installSystem(this.options.host.plugin, template, this.options.entry.ref, {
                role,
                targetFolder: this.targetFolder,
                folder: this.roleFolder,
            });
        } finally {
            this.installing = false;
        }
        if (this.disposed) return;
        button.disabled = !this.acknowledged;
        switch (outcome.kind) {
            case "installed":
                this.setStatus("");
                this.options.onInstalled(outcome, role);
                return;
            case "role-problem":
                this.setStatus("");
                this.fieldProblemEl?.setText(
                    outcome.problem === "folder-required" ? t("assign_role_problem_folder_required") : t("assign_role_problem_no_home")
                );
                return;
            case "invalid":
                this.setStatus(t("community_system_install_error"));
                return;
            default:
                this.setStatus(
                    outcome.kind === "conflict"
                        ? t("community_system_install_conflict")
                        : outcome.kind === "partial"
                            ? t("community_system_install_partial")
                            : t("community_system_install_error")
                );
                button.setText(t("community_systems_try_again"));
        }
    }

    dispose(): void {
        this.disposed = true;
        this.el.remove();
    }
}
