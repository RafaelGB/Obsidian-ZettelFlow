import { setIcon } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { docUrl, pick, type LearnCatalog, type Level, type Tutorial } from "../learn/learnCatalog";
import { filmOf, trackOf, upNext } from "../learn/learnProgress";
import type { LearnImages } from "../learn/learnImages";
import { resolveDoor, type DoorRun } from "../learn/doItNow";
import { boxOf, type Box } from "./systemShots";
import { filmStep, FRAME_PROP } from "./learnShots";

type LocaleKey = Parameters<typeof t>[0];

export const LEVEL_KEY: Record<Level, LocaleKey> = {
    easy: "learn_level_easy",
    medium: "learn_level_medium",
    hard: "learn_level_hard",
};

export interface LessonContext {
    catalog: LearnCatalog;
    lang: string;
    images: LearnImages;
    isDone(id: string): boolean;
    /** The stage starts empty: the picture flying in from the card becomes it. */
    waiting: boolean;
    onBack(): void;
    onToggleDone(id: string, done: boolean): void;
    onDoIt(run: DoorRun): void;
    onReadDoc(url: string): void;
    /** *Up next* or a related tutorial. */
    onOpen(id: string): void;
}

/**
 * **A lesson, in place** (#802 FR-9–FR-11): a crumb back to Learn, a stage where the camera travels
 * down a film strip of the step pictures, and beside it what the tutorial says — the door, the steps
 * (each one a place to jump to), the tip, *Previous* / *Next step*, and the end: *Mark as done*,
 * *Do it now* when the capability has a door Learn can run, *Read the full page*, *Up next* and
 * *Related*. Everything the catalog says is drawn as text.
 */
export class LearnLesson {
    readonly el: HTMLElement;
    private readonly stage: HTMLElement;
    private readonly track: HTMLElement;
    private readonly stepOf: HTMLElement;
    private readonly steps: HTMLElement[] = [];
    private readonly prev: HTMLButtonElement;
    private readonly next: HTMLButtonElement;
    private readonly done: HTMLButtonElement;
    private readonly film: { frames: string[]; at: number[] };
    private moving: Animation | null = null;
    private current = 0;

    constructor(parent: HTMLElement, readonly tutorial: Tutorial, private readonly ctx: LessonContext) {
        const lang = ctx.lang;
        this.el = parent.createDiv({ cls: c("learn-lesson"), attr: { "data-tutorial": tutorial.id } });

        const crumb = this.el.createDiv({ cls: c("learn-crumb") });
        const back = crumb.createEl("button", { cls: c("learn-crumb-back"), attr: { type: "button" } });
        setIcon(back.createSpan({ cls: c("learn-crumb-icon") }), "arrow-left");
        back.createSpan({ text: t("community_room_learn") });
        back.addEventListener("click", () => ctx.onBack());
        const track = trackOf(ctx.catalog, tutorial.id);
        if (track) {
            crumb.createSpan({ cls: c("learn-crumb-sep"), text: "/", attr: { "aria-hidden": "true" } });
            crumb.createSpan({ cls: c("learn-crumb-track"), text: pick(track.title, lang) });
        }

        const grid = this.el.createDiv({ cls: c("learn-lesson-grid") });
        this.stage = grid.createDiv({ cls: c("learn-stage") });
        if (ctx.waiting) this.stage.addClass("is-waiting");
        const filmEl = this.stage.createDiv({ cls: c("learn-film") });
        this.track = filmEl.createDiv({ cls: c("learn-film-track") });
        this.film = filmOf(tutorial);
        this.film.frames.forEach((image, i) => {
            const frame = this.track.createDiv({ cls: c("learn-film-frame") });
            frame.setCssProps({ "--zf-learn-i": String(i) });
            ctx.images.frame(frame, image, pick(tutorial.title, lang));
        });
        this.track.setCssProps({ [FRAME_PROP]: "0" });

        const side = grid.createDiv({ cls: c("learn-side") });
        side.createEl("h2", { cls: c("learn-lesson-title"), text: pick(tutorial.title, lang) });
        side.createEl("p", { cls: c("learn-lesson-summary"), text: pick(tutorial.summary, lang) });
        const facts = side.createDiv({ cls: c("learn-facts") });
        facts.createSpan({ text: t("learn_minutes", String(tutorial.minutes)) });
        facts.createSpan({ text: t(LEVEL_KEY[tutorial.level]) });
        this.stepOf = facts.createSpan({ cls: c("learn-step-of"), attr: { "aria-live": "polite" } });

        const door = side.createDiv({ cls: c("learn-door") });
        setIcon(door.createSpan({ cls: c("learn-door-icon") }), "door-open");
        const doorText = door.createDiv({ cls: c("learn-door-text") });
        doorText.createDiv({ cls: c("learn-door-label"), text: t("learn_where") });
        doorText.createDiv({ text: pick(tutorial.door, lang) });

        const list = side.createEl("ol", { cls: c("learn-steps") });
        tutorial.steps.forEach((step, i) => {
            const item = list.createEl("li");
            const button = item.createEl("button", { cls: c("learn-step"), attr: { type: "button", "data-step": String(i) } });
            button.createSpan({ cls: c("learn-step-num"), text: String(i + 1), attr: { "aria-hidden": "true" } });
            const text = button.createSpan({ cls: c("learn-step-text") });
            text.createSpan({ cls: c("learn-step-title"), text: pick(step.title, lang) });
            text.createSpan({ cls: c("learn-step-body"), text: pick(step.body, lang) });
            button.addEventListener("click", () => this.go(i));
            this.steps.push(button);
        });

        if (tutorial.tip) {
            const tip = side.createDiv({ cls: c("learn-tip") });
            setIcon(tip.createSpan({ cls: c("learn-tip-icon") }), "lightbulb");
            tip.createSpan({ text: pick(tutorial.tip, lang) });
        }

        const nav = side.createDiv({ cls: c("learn-lesson-nav") });
        this.prev = nav.createEl("button", { cls: c("learn-prev"), text: t("learn_previous"), attr: { type: "button" } });
        this.prev.addEventListener("click", () => this.go(this.current - 1));
        this.next = nav.createEl("button", { cls: ["mod-cta", c("learn-next-step")], text: t("learn_next_step"), attr: { type: "button" } });
        this.next.addEventListener("click", () => this.go(this.current + 1));

        const end = side.createDiv({ cls: c("learn-end") });
        const row = end.createDiv({ cls: c("learn-end-row") });
        this.done = row.createEl("button", { cls: c("learn-mark-done"), attr: { type: "button" } });
        this.done.addEventListener("click", () => {
            const on = !ctx.isDone(tutorial.id);
            ctx.onToggleDone(tutorial.id, on);
            this.paintDone();
        });
        this.paintDone();
        const run = tutorial.tryIt ? resolveDoor(tutorial.tryIt.capability) : null;
        if (run && tutorial.tryIt) {
            const doIt = row.createEl("button", { cls: c("learn-do-it"), attr: { type: "button" } });
            setIcon(doIt.createSpan({ cls: c("learn-button-icon") }), "play");
            doIt.createSpan({ text: pick(tutorial.tryIt.label, lang) });
            doIt.addEventListener("click", () => ctx.onDoIt(run));
        }
        const url = tutorial.doc ? docUrl(tutorial.doc) : null;
        if (url) {
            const read = row.createEl("button", { cls: c("learn-read-doc"), attr: { type: "button" } });
            setIcon(read.createSpan({ cls: c("learn-button-icon") }), "external-link");
            read.createSpan({ text: t("learn_read_full_page") });
            read.addEventListener("click", () => ctx.onReadDoc(url));
        }
        const following = upNext(ctx.catalog, tutorial.id);
        if (following) {
            const up = end.createEl("button", { cls: c("learn-up-next"), attr: { type: "button", "data-tutorial": following.id } });
            const words = up.createSpan({ cls: c("learn-up-next-text") });
            words.createSpan({ cls: c("learn-up-next-label"), text: t("learn_up_next") });
            words.createSpan({ cls: c("learn-up-next-title"), text: pick(following.title, lang) });
            setIcon(up.createSpan({ cls: c("learn-button-icon") }), "arrow-right");
            up.addEventListener("click", () => ctx.onOpen(following.id));
        }
        const related = tutorial.related.map((id) => ctx.catalog.tutorials[id]).filter((one): one is Tutorial => !!one);
        if (related.length > 0) {
            const box = end.createDiv({ cls: c("learn-related") });
            box.createSpan({ cls: c("learn-related-label"), text: t("learn_related") });
            for (const one of related) {
                const chip = box.createEl("button", { cls: c("learn-related-chip"), text: pick(one.title, lang), attr: { type: "button", "data-tutorial": one.id } });
                chip.addEventListener("click", () => ctx.onOpen(one.id));
            }
        }
        this.paintSteps();
    }

    /** The step in view, from 0. */
    get step(): number {
        return this.current;
    }

    /** The stage's box: what the picture flies onto, and home from. */
    stageBox(): Box {
        return boxOf(this.stage);
    }

    /** The picture has arrived: the film is the stage now. */
    landed(): void {
        this.stage.removeClass("is-waiting");
    }

    /** Go to step `i` — the camera moves only when its picture is another one (FR-10). */
    go(i: number): void {
        const to = Math.max(0, Math.min(this.tutorial.steps.length - 1, i));
        if (to === this.current) return;
        const fromFrame = this.film.at[this.current] ?? 0;
        const toFrame = this.film.at[to] ?? 0;
        this.current = to;
        this.paintSteps();
        if (fromFrame === toFrame) return;
        try {
            this.moving?.finish();
        } catch {
            // Already gone.
        }
        this.moving = filmStep(this.track, fromFrame, toFrame).animation;
    }

    private paintSteps(): void {
        const n = this.tutorial.steps.length;
        this.steps.forEach((button, i) => {
            button.toggleClass("is-active", i === this.current);
            button.toggleClass("is-past", i < this.current);
            if (i === this.current) button.setAttribute("aria-current", "step");
            else button.removeAttribute("aria-current");
        });
        this.stepOf.setText(t("learn_step_of", String(this.current + 1), String(n)));
        this.prev.disabled = this.current === 0;
        this.next.disabled = this.current === n - 1;
    }

    private paintDone(): void {
        const on = this.ctx.isDone(this.tutorial.id);
        this.done.empty();
        setIcon(this.done.createSpan({ cls: c("learn-button-icon") }), on ? "check-circle-2" : "circle");
        this.done.createSpan({ text: on ? t("learn_done") : t("learn_mark_done") });
        this.done.setAttribute("aria-pressed", on ? "true" : "false");
        this.done.toggleClass("mod-cta", !on);
        this.done.toggleClass("is-done", on);
    }

    dispose(): void {
        try {
            this.moving?.finish();
        } catch {
            // Already gone.
        }
        this.moving = null;
    }
}
