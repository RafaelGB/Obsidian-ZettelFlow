import { Platform, TFile, type App } from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { FileService } from "architecture/plugin/services/FileService";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { openPdfData } from "architecture/components/core/library/sources/pdfjs";
import { classifyMarks } from "application/reader/share/shareMarks";
import type { SharePen } from "application/reader/share/shareInk";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { freeCopyPath } from "application/reader/share/shareFill";
import type { Thought } from "application/thinking/thought";
import { panelClose } from "./readerPanelHead";
import { closeFloating, growFloating, openFloating, placeFloating, type FloatBox, type Floating } from "./readerFloat";
import { shareCopy, type ShareDeps, type ShareOutcome, type ShareStep } from "./readerShareRun";

/**
 * **Share a copy with your notes** (#842, epic #836): the sheet that makes it. It grows from the
 * control that asked for it, as Cite does (#768), and says what goes on the copy before anything is
 * written; *Make the copy* is the only write, create-only, beside the original — which is only read.
 * Undo sends the copy to the trash. Nothing of it runs until it is asked.
 */

export interface ShareHost {
    app: App;
    /** The positioned element it floats in. */
    host(): HTMLElement | null;
    /** The name the comments were signed with last (`settings.shareAuthor`). */
    author(): string;
    saveAuthor(name: string): void;
    /** Whether your pen went on the last copy (`settings.sharePen`): on until you say otherwise (#843). */
    pen?(): boolean;
    savePen?(include: boolean): void;
    /** How an Undo runs where the sheet is: through the Reader's own guard, or as it is. */
    undoWith?(undo: () => Promise<boolean>): () => Promise<boolean>;
    /** A seam for tests: the run's app. */
    deps?: ShareDeps;
}

export interface ShareRequest {
    /** The PDF's path. */
    path: string;
    /** Every thought about it: the sheet keeps the marks. */
    thoughts: readonly Thought[];
    /** Your pen on it (#843), and the turn you read each page at. */
    pen?: SharePen;
    turns?: Readonly<Record<number, number>>;
    from: FloatBox;
}

/** How long a run must take before its line shows (FR-15): a quick copy never flickers one. */
const STEP_DELAY_MS = 300;

/** The run's app, for real: Obsidian's own pdf.js, the vault, a create that never overwrites. */
export function shareDepsFor(app: App): ShareDeps {
    return {
        open: (data) => openPdfData(data),
        readBinary: async (path) => {
            const file = app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) throw new Error(`no file at ${path}`);
            return app.vault.readBinary(file);
        },
        exists: (path) => app.vault.getAbstractFileByPath(path) !== null,
        create: (path, data) => FileService.createBinaryFileOnce(path, data),
        drawingOf: (thought) => ThoughtStore.getInstance().drawingOf(thought),
        frame: () => new Promise((resolve) => (typeof activeWindow === "undefined" ? window : activeWindow).requestAnimationFrame(() => resolve())),
    };
}

/** How many drawings of your pen go on the copy (#843). */
const drawn = (pen?: SharePen) => (pen ? pen.drawings.length + pen.notes.length : 0);

/** The counts line (FR-22): what goes on the copy, each count a phrase of its own — your pen's too. */
export function shareCounts(thoughts: readonly Thought[], drawings = 0): string {
    const marks = classifyMarks(thoughts);
    const noted = marks.highlights.filter((thought) => thought.text.trim()).length;
    const phrases = [
        marks.highlights.length > 0 ? tCount(marks.highlights.length, "reader_share_highlights", String(marks.highlights.length)) : "",
        noted > 0 ? tCount(noted, "reader_share_with_note", String(noted)) : "",
        marks.notes.length > 0 ? tCount(marks.notes.length, "reader_share_margin_notes", String(marks.notes.length)) : "",
        drawings > 0 ? tCount(drawings, "reader_share_drawings", String(drawings)) : "",
    ];
    return phrases.filter(Boolean).join(" · ");
}

/** Whether a PDF has anything to share (FR-21): a door with nothing behind it is disabled. A PDF marked only with the pen has (#843). */
export function hasMarks(thoughts: readonly Thought[], pen?: SharePen): boolean {
    const marks = classifyMarks(thoughts);
    return marks.highlights.length + marks.notes.length + drawn(pen) > 0;
}

const nameOf = (path: string) => path.split("/").pop() ?? path;

interface Open extends Floating {
    working: boolean;
    abort: { aborted: boolean };
}

export class SharePanel {
    private open: Open | null = null;

    constructor(private readonly view: ShareHost) {}

    isOpen(): boolean {
        return Boolean(this.open && !this.open.gone);
    }

    show(request: ShareRequest): HTMLElement | null {
        const host = this.view.host();
        if (!host) return null;
        this.close(false);
        // Esc or a click outside puts it away — never while it works: Cancel is the way out then.
        const open: Open = Object.assign(
            openFloating(host, "reader-share", t("reader_share_copy"), () => this.close(), () => open.working),
            { working: false, abort: { aborted: false } }
        );
        const { el, scope } = open;
        this.open = open;

        const head = el.createDiv({ cls: c("reader-share-head") });
        head.createDiv({ cls: c("reader-share-title"), text: t("reader_share_copy") });
        panelClose(head, { label: "reader_share_cancel", onClose: () => this.close(), scope });
        el.createDiv({ cls: c("reader-share-intro"), text: t("reader_share_intro") });
        let include = drawn(request.pen) > 0 && (this.view.pen?.() ?? true);
        const counts = el.createDiv({ cls: c("reader-share-counts"), text: shareCounts(request.thoughts, include ? drawn(request.pen) : 0) });
        // Your pen (#843): a choice only when there is page ink to share; only its phrase changes.
        if (drawn(request.pen) > 0) {
            const row = el.createEl("label", { cls: c("reader-share-pen") });
            const box = row.createEl("input", { attr: { type: "checkbox" } });
            box.checked = include;
            row.createSpan({ text: t("reader_share_pen") });
            scope.registerDomEvent(box, "change", () => {
                include = box.checked;
                counts.setText(shareCounts(request.thoughts, include ? drawn(request.pen) : 0));
            });
        }
        // What the pen drew beside the text stays behind, and says so; its line kept, so nothing moves.
        const beside = request.pen?.beside ?? 0;
        el.createDiv({ cls: [c("reader-share-hint"), ...(beside > 0 ? [] : [c("reader-share-hint--none")])], text: beside > 0 ? tCount(beside, "reader_share_text_ink", String(beside)) : "" });

        const field = el.createEl("label", { cls: c("reader-share-author") });
        field.createSpan({ cls: c("reader-share-author-name"), text: t("reader_share_author") });
        const input = field.createEl("input", { attr: { type: "text", autocomplete: "name", spellcheck: "false" } });
        input.value = this.view.author();
        field.createSpan({ cls: c("reader-share-hint"), text: t("reader_share_author_desc") });

        const cut = request.path.lastIndexOf("/");
        const folder = cut >= 0 ? request.path.slice(0, cut) : "";
        const stem = nameOf(request.path).replace(/\.pdf$/i, "");
        const where = freeCopyPath(folder, stem, t("reader_share_suffix"), (p) => this.view.app.vault.getAbstractFileByPath(p) !== null);
        el.createDiv({ cls: c("reader-share-where"), text: t("reader_share_where", nameOf(where)) });

        // One line of fixed height for what is happening, and its hairline: nothing below it moves.
        const status = el.createDiv({ cls: c("reader-share-status"), attr: { "aria-live": "polite" } });
        const actions = el.createDiv({ cls: c("reader-share-actions") });
        const cancel = actions.createEl("button", { text: t("reader_share_cancel"), attr: { type: "button" } });
        const make = actions.createEl("button", { cls: "mod-cta", text: t("reader_share_confirm"), attr: { type: "button" } });

        scope.registerDomEvent(cancel, "click", () => {
            if (open.working) open.abort.aborted = true;
            else this.close();
        });
        scope.registerDomEvent(make, "click", () => {
            if (open.working) return;
            const author = input.value.trim();
            this.view.saveAuthor(author);
            if (drawn(request.pen) > 0) this.view.savePen?.(include);
            void this.run(open, request, author, include, { status, actions, make, input });
        });

        placeFloating(host, open, request.from, "share", true);
        growFloating(open);
        make.focus?.();
        return el;
    }

    private async run(open: Open, request: ShareRequest, author: string, include: boolean, parts: { status: HTMLElement; actions: HTMLElement; make: HTMLElement; input: HTMLInputElement }): Promise<void> {
        open.working = true;
        open.el.addClass(c("reader-share--working"));
        parts.make.setAttribute("disabled", "");
        parts.input.setAttribute("disabled", "");
        const { status } = parts;
        status.empty();
        const say = status.createDiv({ cls: c("reader-share-step") });
        const bar = status.createDiv({ cls: c("reader-share-bar") });
        // The line shows only once the run is slow, faded in by the stylesheet's own delay (FR-15).
        status.setCssProps({ "--zf-share-delay": `${STEP_DELAY_MS}ms` });
        const onStep = (step: ShareStep) => {
            if (step.step === "place") {
                say.setText(t("reader_share_step_place", String(step.page), String(step.of)));
                bar.setCssProps({ "--zf-share-progress": String((0.8 * step.page) / step.of) });
            } else {
                say.setText(t(step.step === "write" ? "reader_share_step_write" : "reader_share_step_check"));
                bar.setCssProps({ "--zf-share-progress": step.step === "write" ? "0.9" : "1" });
            }
        };
        let outcome: ShareOutcome;
        try {
            const pen = request.pen ? { pen: { of: request.pen, include, ...(request.turns ? { turns: request.turns } : {}) } } : {};
            outcome = await shareCopy(this.view.deps ?? shareDepsFor(this.view.app), { path: request.path, thoughts: request.thoughts, author, suffix: t("reader_share_suffix"), ...pen }, open.abort, onStep);
        } catch (error) {
            log.error(`[Reader] the shared copy failed: ${String(error)}`);
            outcome = { ok: false, reason: "failed" };
        }
        if (open.gone) return;
        open.working = false;
        open.el.removeClass(c("reader-share--working"));
        if (!outcome.ok && outcome.reason === "cancelled") {
            this.close();
            return;
        }
        status.empty();
        parts.actions.empty();
        if (!outcome.ok) {
            const line = outcome.reason === "protected" ? "reader_share_protected" : outcome.reason === "check" ? "reader_share_check_failed" : outcome.reason === "empty" ? "reader_share_empty" : "reader_share_failed";
            status.createDiv({ cls: c("reader-share-said"), text: t(line) });
            const close = parts.actions.createEl("button", { text: t("reader_share_cancel"), attr: { type: "button" } });
            open.scope.registerDomEvent(close, "click", () => this.close());
            return;
        }
        this.done(open, outcome, status, parts.actions);
    }

    /** The copy is there: where, and the ways on — show it, open it, or take it back (FR-19). */
    private done(open: Open, outcome: Extract<ShareOutcome, { ok: true }>, status: HTMLElement, actions: HTMLElement): void {
        const app = this.view.app;
        status.createDiv({ cls: c("reader-share-said"), text: t("reader_share_done", nameOf(outcome.path)) });
        if (outcome.unplaced > 0) status.createDiv({ cls: c("reader-share-hint"), text: tCount(outcome.unplaced, "reader_share_unplaced", String(outcome.unplaced)) });
        if (outcome.inkUnreadable) status.createDiv({ cls: c("reader-share-hint"), text: t("reader_share_ink_unreadable") });
        open.el.addClass(c("reader-share--done"));
        const shell = app as App & { showInFolder?: (path: string) => void };
        const canShow = !Platform.isMobile && typeof shell.showInFolder === "function";
        const openIt = () => {
            const file = app.vault.getAbstractFileByPath(outcome.path);
            if (file instanceof TFile) void app.workspace.getLeaf("tab").openFile(file);
        };
        const undo = actions.createEl("button", { cls: c("reader-share-undo"), text: t("reader_share_undo"), attr: { type: "button" } });
        // On a desktop the copy is shown in its folder, ready to attach; on a phone or a tablet, opened.
        const openButton = actions.createEl("button", { text: t("reader_share_open"), attr: { type: "button" } });
        open.scope.registerDomEvent(openButton, "click", openIt);
        let primary = openButton;
        if (canShow) {
            primary = actions.createEl("button", { text: t("reader_share_show"), attr: { type: "button" } });
            open.scope.registerDomEvent(primary, "click", () => shell.showInFolder?.(outcome.path));
        }
        primary.addClass("mod-cta");
        primary.focus?.();
        const takeBack = async (): Promise<boolean> => {
            if (!outcome.batch) return false;
            const result = await undoBatch(outcome.batch);
            return result.hadWork && result.failed.length === 0;
        };
        const guarded = this.view.undoWith ? this.view.undoWith(takeBack) : takeBack;
        open.scope.registerDomEvent(undo, "click", () => {
            void guarded().then((ok) => {
                if (open.gone) return;
                status.empty();
                actions.empty();
                status.createDiv({ cls: c("reader-share-said"), text: t(ok ? "reader_share_removed" : "reader_share_undo_failed") });
            });
        });
    }

    /** Esc, a click outside, a page turn: the sheet shrinks back to where it came from. */
    close(animated = true): void {
        const open = this.open;
        if (!open || open.gone) return;
        open.abort.aborted = true;
        this.open = null;
        closeFloating(open, "reader-share--leaving", animated);
    }

    dispose(): void {
        this.close(false);
    }
}
