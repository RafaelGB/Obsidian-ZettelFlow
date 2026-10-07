import ZettelFlow from "main";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { ModeHeader } from "architecture/components/core/surface/ModeHeader";
import { StateTransitionComponent } from "starters/zcomponents/StateTransitionComponent";
import { CultivationService } from "architecture/plugin";
import { KnowledgeIndex, STATE_LABEL_KEY, LIFECYCLE_STATES, stateTransition, isLifecycleState, type LifecycleState, type Idea } from "architecture/knowledge";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { recordMoveOn } from "starters/zcomponents/MoveCommandsComponent";
import { MovePicker } from "architecture/components/core/moves/MovePicker";
import { ClaimDoorModal } from "architecture/components/core/claims/ClaimDoorModal";
import { makeActivatable, hoverPreview } from "architecture/components/core/a11y";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { Notice, TFile, setIcon, moment as obsidianMoment, type Scope } from 'obsidian';
import type MomentFn from 'moment';
import { familyPage, eyebrow, keyHints } from 'architecture/components/core/family/family';
import { InquiryPanel } from './InquiryPanel';
import { InquiryNoteSuggest } from './InquiryNoteSuggest';
import { InquiryRuntime } from 'architecture/plugin/inquiry/InquiryRuntime';
import { thinkAbout } from 'starters/zcomponents/ThinkAboutComponent';
import { QuickCaptureModal } from 'zettelkasten/modals/QuickCaptureModal';
import { ConfirmModal } from 'architecture/components/settings/confirmModal';
import { buildInquiryContext, ruledOutGaps } from 'architecture/knowledge/state';
import { isPathExcluded } from 'architecture/knowledge/state';
import { scopeReasonName } from 'architecture/components/core/scope/ruleSentence';
import {
    buildCultivationSession,
    selectCultivationTarget,
    stageDistribution,
    withReasoning,
    type CultivationMove,
    type CultivationMoveKind,
    type CultivationSession,
    type StageCount,
} from "architecture/knowledge/state";

const DEBOUNCE_MS = 500;
const moment = obsidianMoment as unknown as typeof MomentFn;

/**
 * An icon per move (#472 follow-up). Five moves stacked with identical accent bars read as one
 * wall; an icon each lets you find the one you want without reading all of them.
 */
const MOVE_ICON: Record<CultivationMoveKind, string> = {
    connect: "link",
    challenge: "swords",
    question: "help-circle",
    advance: "trending-up",
    source: "book-marked",
};
type ViewState = "indexing" | "ready" | "empty" | "emptyStage" | "error";

/** What a kept answer says in the trail, per move that asks first — literal, so the locale guard sees it. */
const FRICTION_TRAIL: Partial<Record<CultivationMoveKind, Parameters<typeof t>[0]>> = {
    connect: "cultivate_trail_friction_connect",
    challenge: "cultivate_trail_friction_challenge",
    source: "cultivate_trail_friction_source",
};

function basename(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/**
 * The **Cultivate** mode (#309): a guided thinking session that walks the user through cognitive moves
 * on one idea — connect, challenge, question, advance, add a source — each applying a real operation
 * to the note. The session (pure {@link buildCultivationSession}) rebuilds live as moves land, so it
 * always shows "what to do next" on that idea. Offline; AI is never required.
 */
export class CultivateModeRenderer extends KnowledgeModeRenderer {
    private inquiryMode = false;
    private inquiryPanel: InquiryPanel | undefined;
    private state: ViewState = "indexing";
    private session: CultivationSession | null = null;
    private targetPath: string | null = null;
    /** The idea itself, for what it says and where it lives (#706). */
    private idea: Idea | undefined;
    /** The move you are on — one at a time (#706). */
    private activeMove: CultivationMoveKind | null = null;
    /** What you kept with this idea today, in order (#706). Forgotten with the idea. */
    private trail: string[] = [];
    /** The prompt's box, so a redraw keeps what you were writing. */
    private promptEl: HTMLTextAreaElement | undefined;
    /** The strip fills in once per visit, not on every redraw. */
    private stripShown = false;
    private readonly visited = new Set<string>();
    /** Moves whose friction prompt has been answered or skipped this session (#338). */
    private readonly revealed = new Set<CultivationMoveKind>();
    /** What the user wrote at the prompt, so `challenge` can pre-fill the counterpoint field. */
    private readonly frictionAnswers = new Map<CultivationMoveKind, string>();
    private debounceTimer: number | undefined;
    /** Notes per lifecycle stage, for the distribution chart and stage selector (#589). */
    private distribution: StageCount[] = [];

    constructor(container: HTMLElement, private readonly plugin: ZettelFlow, state?: Record<string, unknown>) {
        super(container);
        this.inquiryMode = state?.inquiry === 'start' || state?.inquiry === 'resume';
        // A note handed over by name — the thesis at the end of a reading (#672). Kept like any
        // target: refined in place, and replaced only if the model does not know it.
        if (typeof state?.target === 'string' && state.target.length > 0) this.targetPath = state.target;
    }

    private get app() {
        return this.plugin.app;
    }

    onload(): void {
        if (this.inquiryMode) this.mountInquiry();
        const debounced = () => {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.recompute(), DEBOUNCE_MS);
        };
        // The note's **own** change, not the vault's (#580). A move writes frontmatter, which fires
        // `changed`; `resolved` is the vault-wide link-resolution event and a property write that
        // adds no link may never produce one — which is why this card used to go stale.
        this.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file instanceof TFile && file.path === this.targetPath) {
                    // Re-read the note before re-deriving (#590 follow-up). `changed` fires *after*
                    // Obsidian re-parses the frontmatter, so the cache is fresh here — while the
                    // `modify` event that already ran `onModify` fired *before* the re-parse, leaving
                    // the model holding the old state. Recomputing without re-indexing would redraw
                    // the card exactly as it was, which is why changing the state from the chip's
                    // picker or the command palette showed only a notice and never moved the card.
                    KnowledgeIndex.getInstance().onModify(file);
                    this.refreshTarget();
                }
            })
        );
        this.registerEvent(this.app.metadataCache.on("resolved", debounced));
        this.registerEvent(this.app.vault.on("rename", debounced));
        this.registerEvent(this.app.vault.on("delete", debounced));
        this.recompute();
    }

    onunload(): void {
        window.clearTimeout(this.debounceTimer);
        if (this.inquiryPanel) {
            if (InquiryRuntime.getInstance().getSnapshot().status !== 'saved') new Notice(t('inquiry_pending_warning'));
            this.removeChild(this.inquiryPanel); this.inquiryPanel = undefined;
        }
        this.container.empty();
    }

    /** Move to a fresh, not-yet-cultivated idea. */
    private anotherIdea(): void {
        this.forgetFriction();
        this.activeMove = null;
        this.trail = [];
        if (this.targetPath) this.visited.add(this.targetPath);
        this.targetPath = null;
        this.recompute();
    }

    private recompute(): void {
        if (this.inquiryMode) { this.inquiryPanel?.refreshContext(); return; }
        try {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") {
                this.state = "indexing";
                this.render();
                return;
            }
            const model = index.getModel();
            if (model.size() === 0) {
                this.state = "empty";
                this.render();
                return;
            }
            // The reader's chosen lifecycle stage (#589), or undefined for every stage.
            const stage = this.stageFilter();
            this.distribution = stageDistribution(model);
            // Keep the current target across recomputes so applying a move refines the session in place.
            if (!this.targetPath || !model.get(this.targetPath)) {
                this.targetPath =
                    selectCultivationTarget(model, this.visited, stage) ?? selectCultivationTarget(model, new Set(), stage);
                this.forgetFriction();
                this.activeMove = null;
                this.trail = [];
            }
            const recipe = this.plugin.settings.cultivateMoves as CultivationMoveKind[] | undefined;
            this.session = this.targetPath ? buildCultivationSession(model, this.targetPath, Date.now(), recipe, { friction: this.plugin.settings.cultivateFriction ?? true }) : null;
            this.idea = this.targetPath ? model.get(this.targetPath) : undefined;
            // A chosen stage with nothing in it is not an empty vault — keep the selector and chart on
            // screen so the reader can pick another stage (#589, AC-4).
            this.state = this.session ? "ready" : stage ? "emptyStage" : "empty";
        } catch (error) {
            this.state = "error";
            log.error(`[Cultivate] recompute failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        this.render();
    }

    private render(): void {
        const host = this.container;
        // A redraw never loses what you are writing at the prompt.
        const writing = this.promptEl?.value ?? "";
        const hadFocus = !!this.promptEl && this.promptEl.ownerDocument?.activeElement === this.promptEl;
        host.empty();
        this.promptEl = undefined;
        const page = familyPage(host, "cultivate");
        page.addClass(c("cultivate"));

        const header = page.createDiv({ cls: c("cultivate-header") });
        eyebrow(header, "sprout", t("cultivate_eyebrow"));
        // One primary since #706: *Another idea* — moving to the next idea is what a visit is made
        // of, and it was a quiet nav button beside a primary most visits never used (the inquiry,
        // which now lives at the end of the stage strip as *From a question of mine…*).
        const bar = new ModeHeader(header, (el, type, handler) => this.registerDomEvent(el, type, handler));
        bar.primary({ label: t("cultivate_another"), icon: "arrow-right", onClick: () => this.anotherIdea() });
        // The exit for the case this surface cannot serve (#473). Cultivate offers "write the
        // counterpoint"; when you do not know it yet, there was nowhere to go. Taking this door
        // writes nothing — leaving a question unanswered is not an edit.
        if (this.targetPath) {
            const path = this.targetPath;
            bar.secondary({
                label: t("cultivate_think_instead"),
                icon: "lightbulb",
                onClick: () => thinkAbout(this.plugin, path),
            });
        }
        bar.done();

        if (this.state === "indexing") {
            page.createDiv({ cls: c("cultivate-status"), text: t("cultivate_building") });
            return;
        }
        if (this.state === "error") {
            page.createDiv({ cls: c("cultivate-status"), text: t("cultivate_error") });
            return;
        }
        if (this.state === "empty") {
            page.createDiv({ cls: c("cultivate-status"), text: t("cultivate_empty") });
            return;
        }

        // The stage strip (#589, rebuilt #706): the vault's maturation at a glance, and the filter.
        this.renderStageControls(page);

        const session = this.session;
        if (this.state === "emptyStage" || !session) {
            page.createDiv({ cls: c("cultivate-status"), text: t("cultivate_empty_stage") });
            this.renderKeys(page);
            return;
        }
        this.renderTarget(page, session);
        this.renderMovePills(page, session);
        const active = session.moves.find((move) => move.kind === this.activeMove) ?? session.moves[0];
        if (active) this.renderActiveMove(page, active, writing, hadFocus);
        this.renderTrail(page);
        this.renderKeys(page);
    }

    private renderKeys(page: HTMLElement): void {
        keyHints(page, [
            { keys: ["1–5"], label: t("cultivate_key_move") },
            { keys: ["→"], label: t("cultivate_key_another") },
            { keys: ["Ctrl", "Enter"], label: t("cultivate_key_keep") },
        ]);
    }

    /** Keys while you are not writing: a digit picks a move, → brings another idea (#706). */
    bindKeys(scope: Scope): void {
        const typing = (): boolean => {
            const active = this.container.ownerDocument?.activeElement;
            return active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement;
        };
        for (let i = 1; i <= 5; i++) {
            this.key(scope, [], String(i), () => {
                const move = this.session?.moves[i - 1];
                if (typing() || !move) return;
                this.pickMove(move.kind);
                return false;
            });
        }
        this.key(scope, [], "ArrowRight", () => {
            if (typing() || this.inquiryMode) return;
            this.anotherIdea();
            return false;
        });
    }

    private pickMove(kind: CultivationMoveKind): void {
        this.activeMove = kind;
        this.render();
    }

    /** The moves, one at a time, as pills in your words (#706) — never five cards at once. */
    private renderMovePills(page: HTMLElement, session: CultivationSession): void {
        const row = page.createDiv({ cls: c("cultivate-pills"), attr: { role: "tablist" } });
        const current = this.activeMove ?? session.moves[0]?.kind;
        session.moves.forEach((move, index) => {
            const pill = row.createEl("button", {
                cls: [c("cultivate-pill"), c(`cultivate-pill--${move.kind}`), ...(move.kind === current ? ["is-active"] : [])],
                attr: { type: "button", role: "tab", "aria-selected": String(move.kind === current), "aria-keyshortcuts": String(index + 1) },
            });
            setIcon(pill.createSpan({ cls: c("cultivate-pill-icon") }), MOVE_ICON[move.kind]);
            pill.createSpan({ text: t(`cultivate_move_${move.kind}_title`) });
            this.registerDomEvent(pill, "click", () => this.pickMove(move.kind));
        });
    }

    /**
     * The move you picked, in Think's voice (#706): its question first and a box for your answer —
     * write first, then see what your notes say. The answer is recorded as a judgement; *show me*
     * reveals and records nothing (#338). With nothing to ask first, the move itself is here.
     */
    private renderActiveMove(page: HTMLElement, move: CultivationMove, writing: string, hadFocus: boolean): void {
        const panel = page.createDiv({ cls: [c("cultivate-prompt"), c(`cultivate-prompt--${move.kind}`)] });
        if (move.friction && !this.revealed.has(move.kind)) {
            this.renderFriction(panel, move, writing, hadFocus);
            return;
        }
        panel.createDiv({ cls: [c("cultivate-prompt-question"), c("family-idea-text")], text: t(`cultivate_move_${move.kind}_desc`) });
        const body = panel.createDiv({ cls: c("cultivate-move-body") });
        switch (move.kind) {
            case "connect":
                this.renderConnect(body, move.candidates ?? []);
                break;
            case "challenge":
                this.renderChallenge(body, move.candidates ?? []);
                break;
            case "question":
                this.renderTextMove(body, "cultivate_question_placeholder", (text) => this.addQuestion(text));
                break;
            case "advance":
                this.renderAdvance(body, move);
                break;
            case "source":
                this.renderTextMove(body, "cultivate_source_placeholder", (text) => this.addSource(text));
                break;
        }
    }

    /** What you kept with this idea today (#706) — each move you made, said once, in order. */
    private renderTrail(page: HTMLElement): void {
        const section = page.createDiv({ cls: c("cultivate-today") });
        eyebrow(section, "rotate-ccw", t("cultivate_today"));
        const trail = section.createDiv({ cls: c("cultivate-trail") });
        if (this.trail.length === 0) {
            trail.createDiv({ cls: c("cultivate-trail-empty"), text: t("cultivate_today_empty") });
            return;
        }
        for (const entry of this.trail) trail.createDiv({ cls: c("cultivate-trail-row"), text: entry });
    }

    private remember(entry: string): void {
        this.trail.push(entry);
    }

    /** The reader's chosen lifecycle stage (#589), or undefined for "any". */
    private stageFilter(): LifecycleState | undefined {
        const chosen = this.plugin.settings.cultivateStage ?? "any";
        return chosen !== "any" && isLifecycleState(chosen) ? chosen : undefined;
    }

    /**
     * **The stage strip** (#589, rebuilt #706): your notes by stage, as one bar — a quiet picture of
     * how the vault is maturing — and the filter in the same control. Click a stage and Cultivate
     * offers ideas from it; click it again for every stage, youngest first. Counts are facts, never
     * a score (§XII): no percentages, no "healthy". *From a question of mine…* sits at its end — the
     * inquiry (#401) that used to be this mode's primary.
     *
     * Each segment's width is its count, handed to the stylesheet as `--zf-n` through `setCssProps`
     * — the theme keeps the colours, and nothing is written inline.
     */
    private renderStageControls(root: HTMLElement): void {
        const current = this.plugin.settings.cultivateStage ?? "any";
        const shown = this.distribution.filter((bucket) => bucket.stage !== "archived" || bucket.count > 0);
        const strip = root.createDiv({
            cls: [c("cultivate-strip"), ...(current !== "any" ? [c("cultivate-strip--filtered")] : [])],
            attr: { role: "group", "aria-label": t("cultivate_distribution_title") },
        });
        const bar = strip.createDiv({ cls: [c("cultivate-strip-bar"), ...(this.stripShown ? [] : [c("cultivate-strip-bar--fill")])] });
        this.stripShown = true;
        const legend = strip.createDiv({ cls: c("cultivate-strip-legend") });
        for (const bucket of shown) {
            const label = t(bucket.labelKey as Parameters<typeof t>[0]);
            const count = tCount(bucket.count, "cultivate_stage_count", String(bucket.count));
            const active = current === bucket.stage;
            if (bucket.count > 0) {
                const segment = bar.createEl("button", {
                    cls: [c("cultivate-strip-seg"), c(`cultivate-stage--${bucket.stage}`), ...(active ? ["is-active"] : [])],
                    attr: { type: "button", "aria-label": `${label} — ${count}`, "aria-pressed": String(active) },
                });
                segment.setCssProps({ "--zf-n": String(bucket.count) });
                this.registerDomEvent(segment, "click", () => this.pickStage(active ? "any" : bucket.stage));
            }
            const item = legend.createEl("button", {
                cls: [c("cultivate-strip-key"), c(`cultivate-stage--${bucket.stage}`), ...(active ? ["is-active"] : [])],
                attr: { type: "button", "aria-pressed": String(active) },
            });
            item.createSpan({ cls: c("cultivate-strip-dot") });
            item.createSpan({ text: label });
            item.createSpan({ cls: c("cultivate-strip-count"), text: String(bucket.count) });
            this.registerDomEvent(item, "click", () => this.pickStage(active ? "any" : bucket.stage));
        }
        legend.createSpan({ cls: c("cultivate-strip-space") });
        const question = legend.createEl("button", { cls: c("cultivate-strip-question"), attr: { type: "button" } });
        setIcon(question.createSpan({ cls: c("cultivate-strip-question-icon") }), "compass");
        question.createSpan({ text: t("cultivate_from_question") });
        this.registerDomEvent(question, "click", () => {
            this.inquiryMode = true;
            this.mountInquiry();
        });
        const chosen = this.distribution.find((bucket) => bucket.stage === current);
        strip.createDiv({
            cls: c("cultivate-strip-note"),
            text: chosen
                ? t("cultivate_strip_only", t(chosen.labelKey as Parameters<typeof t>[0]).toLowerCase())
                : t("cultivate_strip_all"),
        });
    }

    /** Set the stage filter (chart-as-selector), persist it, and re-select within the new stage. */
    private pickStage(stage: string): void {
        this.plugin.settings.cultivateStage = stage;
        void this.plugin.saveSettings();
        this.visited.clear();
        this.targetPath = null;
        this.recompute();
    }

    private mountInquiry(): void {
        if (this.inquiryPanel) this.removeChild(this.inquiryPanel);
        this.container.empty();
        const runtime = InquiryRuntime.getInstance();
        if (!runtime.getSnapshot().current) runtime.start();
        runtime.resume();
        const ordinary = this.container.createEl('button', { text: t('inquiry_ordinary'), cls: c('inquiry-onramp') });
        ordinary.addEventListener('click', () => {
            if (runtime.getSnapshot().status !== 'saved') new Notice(t('inquiry_pending_warning'));
            if (this.inquiryPanel) this.removeChild(this.inquiryPanel);
            this.inquiryPanel = undefined; this.inquiryMode = false; this.recompute();
        });
        const canUse = (path: string) => KnowledgeIndex.getInstance().inScope(path) && this.app.vault.getFileByPath(path) instanceof TFile;
        this.inquiryPanel = this.addChild(new InquiryPanel(this.container.createDiv(), {
            runtime, canUse,
            pick: select => new InquiryNoteSuggest(this.app, select).open(),
            capture: () => new QuickCaptureModal(this.plugin, { capture: title => runtime.capture(title) }).open(),
            open: async path => { if (canUse(path)) await this.app.workspace.openLinkText(path, '', false); },
            confirm: (key, action) => new ConfirmModal(this.app, t(key), t('component_confirm'), t('inquiry_cancel'), action).open(),
            context: inquiry => {
                const index = KnowledgeIndex.getInstance();
                if (index.status !== 'ready') return { status: 'loading' };
                const configDir = this.app.vault.configDir;
                // The one gate (#713), plus Obsidian's own config folder, which is never a note.
                const excludedBy = (path: string): string | null => {
                    if (isPathExcluded(path, [configDir])) return configDir;
                    const reason = index.excludedBy(path);
                    return reason === null ? null : scopeReasonName(reason, index.scopeRules());
                };
                return { status: 'ready', value: buildInquiryContext(index.getModel(), inquiry, excludedBy) };
            },
        }));
    }

    /**
     * The idea, as the hero of the page (#706): its name, **what it says** in the serif of an idea
     * (you read the claim, not a row of metrics), where it is on its way as a gentle stepper, and the
     * notes it lives near. The state chip is the door for changing the state (#578); the claim door
     * and the move picker sit quietly at its foot. No degree, no maturity number — §XII.
     */
    private renderTarget(root: HTMLElement, session: CultivationSession): void {
        const card = root.createDiv({ cls: [c("cultivate-idea"), c("cultivate-target")] });
        const idea = this.idea;

        // What just happened, if anything did (#580). A promotion is a fact about two states, and
        // nobody can read it from one.
        const moved =
            this.renderedState?.path === session.path
                ? stateTransition(this.renderedState.state, session.state)
                : null;
        this.renderedState = { path: session.path, state: session.state };

        const top = card.createDiv({ cls: c("cultivate-idea-top") });
        const stateKey = (STATE_LABEL_KEY as Record<string, string>)[session.state];
        const chip = top.createSpan({
            cls: c("cultivate-state-chip"),
            text: stateKey ? t(stateKey as Parameters<typeof t>[0]) : session.state,
        });
        // The door for changing a note's state (#578): on the object the change is about. The same
        // picker the command opens, not a second one.
        chip.setAttribute("title", t("state_transition_modal_title"));
        makeActivatable(chip, () => {
            const file = this.app.vault.getAbstractFileByPath(session.path);
            if (file instanceof TFile) StateTransitionComponent.pickState(this.plugin, file);
        }, "button");
        if (idea) top.createSpan({ cls: c("cultivate-idea-since"), text: t("cultivate_idea_since", moment(idea.created).fromNow()) });
        if (moved) {
            // Once, on the chip that changed, and nowhere else: the state is where you acted.
            chip.addClass(c("cultivate-state-changed"));
            card.createDiv({
                cls: c("cultivate-state-transition"),
                text: t(
                    "cultivate_state_transition",
                    t(moved.fromKey as Parameters<typeof t>[0]),
                    t(moved.toKey as Parameters<typeof t>[0])
                ),
            });
        }

        const name = card.createEl("h2", {
            cls: [c("cultivate-target-name"), c("family-idea-text")],
            text: idea?.title || basename(session.path),
        });
        name.setAttribute("title", session.path);
        makeActivatable(name, () => void this.app.workspace.openLinkText(session.path, "", false));
        // Ctrl/Cmd-hover shows the native Page preview without leaving Cultivate (#594).
        hoverPreview(this.app, name, session.path, this);

        const claim = idea?.claims.find((one) => one.text.trim())?.text.trim();
        card.createDiv({
            cls: [c("cultivate-idea-claim"), c("family-idea-text"), ...(claim ? [] : [c("cultivate-idea-claim--empty")])],
            text: claim ?? t("cultivate_idea_no_claim"),
        });

        // The lifecycle as a stepper: where it has been, where it is — never a number.
        const steps: LifecycleState[] = LIFECYCLE_STATES.filter((state) => state !== "archived");
        const at = steps.indexOf(session.state as LifecycleState);
        if (at >= 0) {
            const stepper = card.createDiv({ cls: c("cultivate-life") });
            steps.forEach((state, index) => {
                const step = stepper.createDiv({
                    cls: [c("cultivate-life-step"), ...(index < at ? [c("is-past")] : index === at ? [c("is-now")] : [])],
                });
                step.createSpan({ cls: c("cultivate-life-dot") });
                step.createSpan({ cls: c("cultivate-life-label"), text: t(STATE_LABEL_KEY[state]) });
            });
        }

        const near = idea ? [...new Set(idea.relations.map((relation) => relation.to))].filter((path) => path !== session.path).slice(0, 4) : [];
        if (near.length > 0) {
            const row = card.createDiv({ cls: c("cultivate-near") });
            row.createSpan({ text: t("cultivate_lives_near") });
            for (const path of near) {
                const neighbour = row.createSpan({ cls: c("cultivate-near-chip"), text: basename(path) });
                neighbour.setAttribute("title", path);
                makeActivatable(neighbour, () => void this.app.workspace.openLinkText(path, "", false));
                hoverPreview(this.app, neighbour, path, this);
            }
        }

        const foot = card.createDiv({ cls: c("cultivate-idea-foot") });
        this.renderClaimRow(foot, session.path);
        this.renderMoveRow(foot, session.path);
    }

    /**
     * The moves, on the note Cultivate is already showing you (#493, fixed by #509).
     *
     * This shipped as **eleven buttons in a row**, iterated straight out of `MOVE_VERBS` and
     * never looked at before it went out — into the one surface whose last redesign was
     * triggered by it feeling overwhelming. Eleven buttons is not a second way of offering the
     * moves; it is the thing the picker exists to avoid, put back by hand.
     *
     * One control now, opening the same picker every other door opens. **The note is never
     * written to**: a move is a fact about what you did, not an edit.
     */
    private renderMoveRow(card: HTMLElement, path: string): void {
        const row = card.createDiv({ cls: c("cultivate-target-moves") });
        const button = row.createEl("button", {
            cls: c("cultivate-target-move"),
            text: t("move_pick_title"),
        });
        const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
        this.registerDomEvent(button, "click", () =>
            new MovePicker(this.app, name, "note", (verb) => recordMoveOn(verb, path)).open()
        );
    }

    /**
     * Say what this note claims, on the note Cultivate is already showing you (#561).
     *
     * One control, beside the moves, opening the same sentence box the note's own menu opens. It is
     * the note's **claim** that is written, never anything Cultivate inferred: the door is for your
     * sentence (§XII).
     */
    private renderClaimRow(card: HTMLElement, path: string): void {
        const row = card.createDiv({ cls: c("cultivate-target-claim") });
        const button = row.createEl("button", {
            cls: c("cultivate-target-move"),
            text: t("claim_door_cultivate"),
        });
        this.registerDomEvent(button, "click", () => {
            const file = this.app.vault.getFileByPath(path);
            if (file instanceof TFile) new ClaimDoorModal(this.app, file).open();
        });
    }

    /**
     * The connections Cultivate suggests, each with **not related** beside *Link* (#703).
     *
     * The gaps section left Home with the dashboard, and its verdict came here, to the one place a
     * suggested connection is already in front of you: the machine observes, you rule, the verdict
     * is recorded and writes nothing to the vault (§XII, #534). A pair you ruled out is not offered
     * again. Absent when the record is off — a button that silently does nothing is worse than none.
     */
    private renderConnect(body: HTMLElement, all: string[]): void {
        const log = JudgementLog.getInstance();
        const target = this.targetPath ?? "";
        const ruled = ruledOutGaps(log.entries());
        const candidates = all.filter((candidate) => !ruled.has(target, candidate));
        const canRule = log.enabled();
        for (const candidate of candidates) {
            const row = body.createDiv({ cls: c("cultivate-candidate") });
            const link = row.createSpan({ cls: c("cultivate-candidate-name"), text: basename(candidate) });
            link.setAttribute("title", candidate);
            makeActivatable(link, () => void this.app.workspace.openLinkText(candidate, "", false));
            hoverPreview(this.app, link, candidate, this);
            const btn = row.createEl("button", { cls: c("cultivate-candidate-btn"), text: t("cultivate_link_button") });
            btn.addEventListener("click", () => void this.linkNote(candidate));
            if (!canRule) continue;
            const verdict = row.createEl("button", {
                text: t("home_gap_not_related"),
                cls: c("cultivate-candidate-verdict"),
                attr: { type: "button", "aria-label": t("home_gap_not_related_aria") },
            });
            verdict.addEventListener("click", () => {
                JudgementLog.getInstance().recordGapVerdict(target, candidate);
                this.remember(t("cultivate_trail_not_related", basename(candidate)));
                this.recompute();
            });
        }
    }

    private renderChallenge(body: HTMLElement, contradictions: string[]): void {
        if (contradictions.length > 0) {
            for (const path of contradictions) {
                const row = body.createDiv({ cls: c("cultivate-candidate") });
                const link = row.createSpan({ cls: c("cultivate-candidate-name"), text: basename(path) });
                link.setAttribute("title", path);
                makeActivatable(link, () => void this.app.workspace.openLinkText(path, "", false));
                hoverPreview(this.app, link, path, this);
            }
        } else {
            body.createDiv({ cls: c("cultivate-move-hint"), text: t("cultivate_no_contradictions") });
        }
        this.renderTextMove(body, "cultivate_counterpoint_placeholder", (text) => this.addCounterpoint(text), this.frictionAnswers.get("challenge"));
    }

    /**
     * The friction phase (#338), in Think's voice (#706): the question, why it is asked, a box for
     * your reading, and two ways on. *Keep my answer* needs text — that is the commitment — and
     * records a judgement; *show me what my notes say* reveals and records **nothing**, because a
     * skip is not a judgement. Ctrl/Cmd+Enter keeps. Nothing here writes to the note.
     */
    private renderFriction(panel: HTMLElement, move: CultivationMove, writing: string, hadFocus: boolean): void {
        const friction = move.friction;
        if (!friction) return;
        const prompt = t(friction.promptKey as Parameters<typeof t>[0]);
        panel.createDiv({ cls: [c("cultivate-prompt-question"), c("family-idea-text")], text: prompt });
        panel.createDiv({ cls: c("cultivate-prompt-why"), text: t(`cultivate_move_${move.kind}_desc`) });
        const area = panel.createEl("textarea", {
            cls: c("cultivate-friction-input"),
            attr: { rows: "3", "aria-label": prompt },
        });
        area.placeholder = t("cultivate_friction_placeholder");
        area.value = writing || this.frictionAnswers.get(move.kind) || "";
        this.promptEl = area;
        if (hadFocus) window.setTimeout(() => area.focus(), 0);

        const actions = panel.createDiv({ cls: c("cultivate-friction-actions") });
        const keep = actions.createEl("button", {
            cls: [c("cultivate-friction-reveal"), "mod-cta"],
            text: t("cultivate_friction_reveal"),
            attr: { type: "button" },
        });
        keep.disabled = area.value.trim().length === 0;
        this.registerDomEvent(area, "input", () => {
            keep.disabled = area.value.trim().length === 0;
        });
        this.registerDomEvent(area, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                this.answerFriction(move, area.value.trim());
            }
        });
        this.registerDomEvent(keep, "click", () => this.answerFriction(move, area.value.trim()));
        const skip = actions.createEl("button", {
            cls: c("cultivate-friction-skip"),
            text: t("cultivate_friction_skip"),
            attr: { type: "button" },
        });
        this.registerDomEvent(skip, "click", () => this.skipFriction(move));
        actions.createSpan({ cls: c("cultivate-friction-note"), text: t("cultivate_friction_note") });
    }

    /**
     * Your reading is committed: record it as a judgement (#336) — the reading itself is the
     * rationale — and open the move.
     */
    private answerFriction(move: CultivationMove, text: string): void {
        if (!text || !move.friction) return;
        this.frictionAnswers.set(move.kind, text);
        if (this.session) {
            JudgementLog.getInstance().record(
                withReasoning(
                    {
                        path: this.session.path,
                        subject: `friction:${move.kind}`,
                        origin: "derived",
                        verdict: move.friction.verdict,
                    },
                    text,
                    undefined
                )
            );
        }
        const kept = FRICTION_TRAIL[move.kind];
        if (kept) this.remember(t(kept, text));
        if (this.promptEl) this.promptEl.value = "";
        this.reveal(move.kind);
    }

    /** Skipping is always allowed, and records nothing. */
    private skipFriction(move: CultivationMove): void {
        this.reveal(move.kind);
    }

    private reveal(kind: CultivationMoveKind): void {
        this.revealed.add(kind);
        this.render();
    }

    /** A different idea is a different session, so its prompts come back. */
    private forgetFriction(): void {
        this.revealed.clear();
        this.frictionAnswers.clear();
    }

    private renderAdvance(body: HTMLElement, move: CultivationMove): void {
        const target = move.proposedState;
        if (!target) return;
        const label = move.proposedStateLabelKey ? t(move.proposedStateLabelKey as Parameters<typeof t>[0]) : target;
        const btn = body.createEl("button", {
            cls: c("cultivate-advance-btn"),
            text: t("cultivate_advance_button", label),
        });
        btn.addEventListener("click", () => void this.advanceState(target));
        const notYet = body.createEl("button", { cls: c("cultivate-advance-later"), text: t("cultivate_advance_not_yet"), attr: { type: "button" } });
        notYet.addEventListener("click", () => {
            // Deciding it is not ready is yours too, and writes nothing.
            this.remember(t("cultivate_trail_not_yet"));
            this.render();
        });
    }

    /** A one-line text input + add button, shared by question / source / counterpoint. */
    private renderTextMove(body: HTMLElement, placeholderKey: Parameters<typeof t>[0], apply: (text: string) => Promise<void>, initial?: string): void {
        const row = body.createDiv({ cls: c("cultivate-input-row") });
        const input = row.createEl("input", { type: "text", cls: c("cultivate-input") });
        input.placeholder = t(placeholderKey);
        input.setAttribute("aria-label", t(placeholderKey));
        if (initial) input.value = initial;
        const submit = () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = "";
            void apply(text);
        };
        input.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") submit();
        });
        const btn = row.createEl("button", { cls: c("cultivate-input-btn"), text: t("cultivate_add_button") });
        btn.addEventListener("click", () => submit());
    }

    /**
     * Redraw because **you** did something (#580).
     *
     * Always happens, and it re-reads the note before re-deriving: the write, the index upsert (on
     * `vault.on("modify")`) and this are three steps across two event loops, and Obsidian does not
     * guarantee their order — so the act draws what the model holds *now*, and the note's own
     * `changed` event converges on it milliseconds later. The card is therefore never *left* stale,
     * which is the only promise worth making here.
     *
     * Re-reading is free: the snapshot recorder is diff-gated, so an upsert with nothing new records
     * nothing.
     */
    private async redrawAfterMove(): Promise<void> {
        const path = this.targetPath;
        if (path) {
            const file = this.app.vault.getFileByPath(path);
            if (file instanceof TFile) KnowledgeIndex.getInstance().onModify(file);
        }
        this.recompute();
    }

    /**
     * Redraw for something that changed **while you write** — the note edited in another pane, or
     * its state changed from the command palette.
     *
     * Refuses while a text box in this pane has focus, so typing can never move the ground under
     * you. It is not a veto on what you asked for: that path is {@link redrawAfterMove}, and using
     * one guard for both is the bug the Lab already paid for once.
     */
    private refreshTarget(): void {
        const active = this.container.ownerDocument.activeElement;
        const typing = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement;
        if (typing && this.container.contains(active)) return;
        this.recompute();
    }

    // ── apply (#309 S3): delegate to the CultivationService (Workflow Engine owns the writes) ──────
    private readonly cultivation = CultivationService.getInstance();

    /** The state this card last drew, so a change can be said rather than only shown (#580). */
    private renderedState: { path: string; state: string } | undefined;

    private async linkNote(target: string): Promise<void> {
        await this.cultivation.link(this.app, this.targetPath ?? "", basename(target));
        this.remember(t("cultivate_trail_linked", basename(target)));
        await this.redrawAfterMove();
    }

    private async addQuestion(text: string): Promise<void> {
        await this.cultivation.addQuestion(this.app, this.targetPath ?? "", text);
        this.remember(t("cultivate_trail_question", text));
        await this.redrawAfterMove();
    }

    private async addCounterpoint(text: string): Promise<void> {
        await this.cultivation.addCounterpoint(this.app, this.targetPath ?? "", text);
        this.remember(t("cultivate_trail_counterpoint", text));
        await this.redrawAfterMove();
    }

    private async addSource(text: string): Promise<void> {
        await this.cultivation.addSource(this.app, this.targetPath ?? "", text);
        this.remember(t("cultivate_trail_source", text));
        await this.redrawAfterMove();
    }

    private async advanceState(target: NonNullable<CultivationMove["proposedState"]>): Promise<void> {
        await this.cultivation.advance(this.app, this.plugin, this.targetPath ?? "", target);
        this.remember(t("cultivate_trail_advanced", t(STATE_LABEL_KEY[target])));
        await this.redrawAfterMove();
    }
}
