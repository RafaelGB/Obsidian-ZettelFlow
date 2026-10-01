import ZettelFlow from "main";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { ModeHeader } from "architecture/components/core/surface/ModeHeader";
import { StateTransitionComponent } from "starters/zcomponents/StateTransitionComponent";
import { CultivationService } from "architecture/plugin";
import { KnowledgeIndex, STATE_LABEL_KEY, stateTransition, isLifecycleState, type LifecycleState } from "architecture/knowledge";
import { KnowledgeModeRenderer } from "architecture/components/core/surface/KnowledgeModeRenderer";
import { recordMoveOn } from "starters/zcomponents/MoveCommandsComponent";
import { MovePicker } from "architecture/components/core/moves/MovePicker";
import { ClaimDoorModal } from "architecture/components/core/claims/ClaimDoorModal";
import { makeActivatable, hoverPreview } from "architecture/components/core/a11y";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { Notice, TFile, setIcon } from 'obsidian';
import { InquiryPanel } from './InquiryPanel';
import { InquiryNoteSuggest } from './InquiryNoteSuggest';
import { InquiryRuntime } from 'architecture/plugin/inquiry/InquiryRuntime';
import { thinkAbout } from 'starters/zcomponents/ThinkAboutComponent';
import { QuickCaptureModal } from 'zettelkasten/modals/QuickCaptureModal';
import { ConfirmModal } from 'architecture/components/settings/confirmModal';
import { buildInquiryContext, scopeExcludedPaths } from 'architecture/knowledge/state';
import {
    buildCultivationSession,
    selectCultivationTarget,
    cultivationQueue,
    stageDistribution,
    developmentStreak,
    JUDGEMENT_CONFIDENCES,
    withReasoning,
    type CultivationMove,
    type CultivationMoveKind,
    type CultivationSession,
    type JudgementConfidence,
    type StageCount,
} from "architecture/knowledge/state";

const DEBOUNCE_MS = 500;

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
    private queueCount = 0;
    private streak = 0;
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
            }
            const recipe = this.plugin.settings.cultivateMoves as CultivationMoveKind[] | undefined;
            this.session = this.targetPath ? buildCultivationSession(model, this.targetPath, Date.now(), recipe, { friction: this.plugin.settings.cultivateFriction ?? true }) : null;
            this.queueCount = cultivationQueue(model, this.visited, 99, stage).length;
            this.streak = developmentStreak(JudgementLog.getInstance().dailyCounts(), Date.now());
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
        host.empty();
        const root = host.createDiv({ cls: c("cultivate") });

        const header = root.createDiv({ cls: c("cultivate-header") });
        header.createEl("h4", { text: t("cultivate_title"), cls: c("cultivate-title") });
        // Three buttons of equal weight until #577, and the one that opened something was in the
        // middle. The primary is working on your own question — it is what this mode is *for*.
        const bar = new ModeHeader(header, (el, type, handler) => this.registerDomEvent(el, type, handler));
        bar.primary({
            label: t("inquiry_start"),
            icon: "compass",
            onClick: () => {
                this.inquiryMode = true;
                this.mountInquiry();
            },
        });
        // Not buried: moving to the next idea is the most-used control here, and hiding
        // navigation behind an overflow is its own usability failure. It is drawn plainly so it
        // never competes with the primary for the eye.
        bar.nav({ label: t("cultivate_another"), onClick: () => this.anotherIdea() });

        // The exit for the case this surface cannot serve (#473). Cultivate offers "write the
        // counterpoint"; when you do not know it yet, there was nowhere to go. Taking this door
        // writes nothing — leaving a question unanswered is not an edit. It opens another
        // capability, so by the rule it cannot sit beside the primary that opens this one.
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
            root.createDiv({ cls: c("cultivate-status"), text: t("cultivate_building") });
            return;
        }
        if (this.state === "error") {
            root.createDiv({ cls: c("cultivate-status"), text: t("cultivate_error") });
            return;
        }
        if (this.state === "empty") {
            root.createDiv({ cls: c("cultivate-status"), text: t("cultivate_empty") });
            return;
        }

        root.createDiv({ cls: c("cultivate-intro"), text: t("cultivate_intro") });

        // ── the top row: the idea you are on (the one accent card), beside Notes by stage ──
        // A dashboard grid so the two sit side by side on a wide pane and stack when it is narrow.
        const top = root.createDiv({ cls: c("dashboard-grid") });
        const session = this.session;
        const hasSession = this.state !== "emptyStage" && !!session;
        // The idea leads, so it is drawn first and wears the accent. Absent only when the chosen
        // stage is empty — the stage control below still offers the way back.
        if (hasSession && session) this.renderTarget(top, session);
        // The stage selector and per-stage distribution (#589), shown whenever the vault has notes.
        this.renderStageControls(top);

        const momentum: string[] = [];
        if (this.streak > 0) momentum.push(t("cultivate_streak", String(this.streak)));
        if (this.queueCount > 0) momentum.push(t("cultivate_queue", String(this.queueCount)));
        if (momentum.length > 0) root.createDiv({ cls: c("cultivate-momentum"), text: momentum.join(" · ") });

        if (!hasSession || !this.session) {
            root.createDiv({ cls: c("cultivate-status"), text: t("cultivate_empty_stage") });
            return;
        }
        // ── the moves: a responsive grid of cards, not a tall column (#620) ──
        const list = root.createDiv({ cls: c("cultivate-moves") });
        for (const move of this.session.moves) this.renderMove(list, move);
    }

    /** The reader's chosen lifecycle stage (#589), or undefined for "any". */
    private stageFilter(): LifecycleState | undefined {
        const chosen = this.plugin.settings.cultivateStage ?? "any";
        return chosen !== "any" && isLifecycleState(chosen) ? chosen : undefined;
    }

    /**
     * The stage selector and the per-stage distribution, in one control (#589).
     *
     * The chart *is* the selector — each bar sets the filter to its stage (chart-as-selector) — with
     * an "Any stage" chip to clear it. Bars are `<button>`s, so they are keyboard-activatable; the
     * magnitude comes from the `--l{level}` class, never a pixel width, so the user's theme keeps
     * control of the bar. Whole-vault by decision: every stage shows, including empty ones.
     */
    private renderStageControls(root: HTMLElement): void {
        const current = this.plugin.settings.cultivateStage ?? "any";
        const wrap = root.createDiv({ cls: `${c("dashboard-card")} ${c("cultivate-stage")}` });
        const head = wrap.createDiv({ cls: c("cultivate-stage-head") });
        head.createSpan({ cls: c("cultivate-dist-title"), text: t("cultivate_distribution_title") });
        const any = head.createEl("button", {
            cls: c("cultivate-stage-any"),
            text: t("cultivate_stage_any"),
            attr: { type: "button", "aria-label": t("cultivate_stage_filter_label") },
        });
        if (current === "any") any.addClass("is-active");
        this.registerDomEvent(any, "click", () => this.pickStage("any"));

        const dist = wrap.createDiv({ cls: c("cultivate-dist") });
        for (const bucket of this.distribution) {
            const label = t(bucket.labelKey as Parameters<typeof t>[0]);
            const count = tCount(bucket.count, "cultivate_stage_count", String(bucket.count));
            const bar = dist.createEl("button", {
                cls: [c("cultivate-dist-bar"), c(`cultivate-dist-bar--l${bucket.level}`)].join(" "),
                attr: { type: "button", "aria-label": `${label} — ${count}` },
            });
            if (current === bucket.stage) bar.addClass("is-active");
            bar.createSpan({ cls: c("cultivate-dist-emoji"), text: bucket.emoji });
            bar.createSpan({ cls: c("cultivate-dist-count"), text: count });
            bar.createSpan({ cls: c("cultivate-dist-label"), text: label });
            this.registerDomEvent(bar, "click", () => this.pickStage(bucket.stage));
        }
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
                return { status: 'ready', value: buildInquiryContext(index.getModel(), inquiry, [...scopeExcludedPaths(this.plugin.settings), this.app.vault.configDir]) };
            },
        }));
    }

    private renderTarget(root: HTMLElement, session: CultivationSession): void {
        // The idea under cultivation is the one accent card on the surface (#620) — the shared hero
        // shape, so "this is where to look" reads the same here as it does on Home.
        const card = root.createDiv({ cls: `${c("dashboard-card")} ${c("dashboard-card--hero")} ${c("cultivate-target")}` });

        // What just happened, if anything did (#580). The emoji says where the note *is*; a
        // promotion is a fact about two states, and nobody can read it from one.
        const moved =
            this.renderedState?.path === session.path
                ? stateTransition(this.renderedState.state, session.state)
                : null;
        this.renderedState = { path: session.path, state: session.state };

        const stateKey = (STATE_LABEL_KEY as Record<string, string>)[session.state];
        const chip = card.createSpan({
            cls: c("cultivate-state-chip"),
            text: `${session.stateEmoji} ${stateKey ? t(stateKey as Parameters<typeof t>[0]) : session.state}`.trim(),
        });
        // The door for changing a note's state (#578). It was in the palette and nowhere else — and
        // the state is *right here*, on the object the change is about, which is rank 1 by the
        // ranking this epic wrote down. The same picker the command opens, not a second one.
        chip.setAttribute("title", t("state_transition_modal_title"));
        makeActivatable(chip, () => {
            const file = this.app.vault.getAbstractFileByPath(session.path);
            if (file instanceof TFile) StateTransitionComponent.pickState(this.plugin, file);
        }, "button");
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

        const name = card.createSpan({
            cls: c("cultivate-target-name"),
            text: basename(session.path),
        });
        name.setAttribute("title", session.path);
        makeActivatable(name, () => void this.app.workspace.openLinkText(session.path, "", false));
        // Ctrl/Cmd-hover shows the native Page preview without leaving Cultivate (#594).
        hoverPreview(this.app, name, session.path, this);
        const maturity = session.maturity === null ? "—" : session.maturity.toFixed(2);
        card.createDiv({
            cls: c("cultivate-target-meta"),
            text: t("cultivate_target_meta", String(session.degree), maturity),
        });
        this.renderMoveRow(card, session.path);
        this.renderClaimRow(card, session.path);
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

    private renderMove(list: HTMLElement, move: CultivationMove): void {
        const card = list.createDiv({ cls: [c("cultivate-move"), c(`cultivate-move--${move.kind}`)].join(" ") });
        // An icon per kind, so five moves read as five different things at a glance rather than
        // as one wall of text with five identical accent bars.
        const head = card.createDiv({ cls: c("cultivate-move-head") });
        setIcon(head.createSpan({ cls: c("cultivate-move-icon") }), MOVE_ICON[move.kind]);
        const heading = head.createDiv({ cls: c("cultivate-move-heading") });
        heading.createDiv({ cls: c("cultivate-move-title"), text: t(`cultivate_move_${move.kind}_title`) });
        heading.createDiv({ cls: c("cultivate-move-desc"), text: t(`cultivate_move_${move.kind}_desc`) });
        const body = card.createDiv({ cls: c("cultivate-move-body") });

        // #338: a move that would hand you its answer asks for yours first. Always skippable.
        if (move.friction && !this.revealed.has(move.kind)) {
            this.renderFriction(body, move);
            return;
        }

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

    private renderConnect(body: HTMLElement, candidates: string[]): void {
        for (const candidate of candidates) {
            const row = body.createDiv({ cls: c("cultivate-candidate") });
            const link = row.createSpan({ cls: c("cultivate-candidate-name"), text: basename(candidate) });
            link.setAttribute("title", candidate);
            makeActivatable(link, () => void this.app.workspace.openLinkText(candidate, "", false));
            hoverPreview(this.app, link, candidate, this);
            const btn = row.createEl("button", { cls: c("cultivate-candidate-btn"), text: t("cultivate_link_button") });
            btn.addEventListener("click", () => void this.linkNote(candidate));
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
     * The friction phase (#338): the question, a box for your reading, and two ways out. `Reveal`
     * needs text — that is the commitment — and records a judgement; `Skip` reveals and records
     * **nothing**, because a skip is not a judgement (the same rule #337 applies to a dismissed
     * proposal). Nothing here writes to the note.
     */
    private renderFriction(body: HTMLElement, move: CultivationMove): void {
        const friction = move.friction;
        if (!friction) return;
        const prompt = t(friction.promptKey as Parameters<typeof t>[0]);

        body.createDiv({ cls: c("cultivate-friction-prompt"), text: prompt });
        const area = body.createEl("textarea", {
            cls: c("cultivate-friction-input"),
            attr: { rows: "3", "aria-label": prompt },
        });
        area.placeholder = t("cultivate_friction_placeholder");
        area.value = this.frictionAnswers.get(move.kind) ?? "";

        // Optional how-sure marker on your reading (#361, D1) — an unset value records no confidence.
        const confidenceRow = body.createDiv({ cls: c("cultivate-friction-confidence") });
        confidenceRow.createSpan({
            cls: c("cultivate-friction-confidence-label"),
            text: t("proposal_confidence_label"),
        });
        const confidence = confidenceRow.createEl("select", {
            cls: c("cultivate-friction-confidence-select"),
            attr: { "aria-label": t("proposal_confidence_label") },
        });
        confidence.createEl("option", { text: t("confidence_unset"), value: "" });
        for (const level of JUDGEMENT_CONFIDENCES) {
            confidence.createEl("option", { text: t(`confidence_${level}` as Parameters<typeof t>[0]), value: level });
        }

        const actions = body.createDiv({ cls: c("cultivate-friction-actions") });
        const reveal = actions.createEl("button", {
            cls: c("cultivate-friction-reveal"),
            text: t("cultivate_friction_reveal"),
        });
        reveal.disabled = area.value.trim().length === 0;
        area.addEventListener("input", () => {
            reveal.disabled = area.value.trim().length === 0;
        });
        reveal.addEventListener("click", () =>
            this.answerFriction(
                move,
                area.value.trim(),
                confidence.value ? (confidence.value as JudgementConfidence) : undefined
            )
        );

        const skip = actions.createEl("button", {
            cls: c("cultivate-friction-skip"),
            text: t("cultivate_friction_skip"),
        });
        skip.addEventListener("click", () => this.skipFriction(move));
    }

    /**
     * Your reading is committed: record it as a judgement (#336) — the reading itself is the rationale
     * and the how-sure marker rides along when given (#361, D1) — and open the move.
     */
    private answerFriction(move: CultivationMove, text: string, confidence?: JudgementConfidence): void {
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
                    confidence
                )
            );
        }
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
        await this.redrawAfterMove();
    }

    private async addQuestion(text: string): Promise<void> {
        await this.cultivation.addQuestion(this.app, this.targetPath ?? "", text);
        await this.redrawAfterMove();
    }

    private async addCounterpoint(text: string): Promise<void> {
        await this.cultivation.addCounterpoint(this.app, this.targetPath ?? "", text);
        await this.redrawAfterMove();
    }

    private async addSource(text: string): Promise<void> {
        await this.cultivation.addSource(this.app, this.targetPath ?? "", text);
        await this.redrawAfterMove();
    }

    private async advanceState(target: NonNullable<CultivationMove["proposedState"]>): Promise<void> {
        await this.cultivation.advance(this.app, this.plugin, this.targetPath ?? "", target);
        await this.redrawAfterMove();
    }
}
