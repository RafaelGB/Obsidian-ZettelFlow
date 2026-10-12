import { Component, setIcon } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import {
    CITE_FORMS,
    citationFields,
    citeLink,
    formatCitation,
    missingFor,
    type CiteForm,
    type CiteInput,
    type CiteSource,
    type MissingField,
} from "application/library/citation";
import { MOTION, motionWelcome } from "./readerMotion";
import { panelClose } from "./readerPanelHead";

type LocaleKey = Parameters<typeof t>[0];

/**
 * **Cite this passage** (#768, epic #742): a small panel grown from where you asked — the selection's
 * popover, a highlight, a book's detail — that shows a passage in the form you need and copies it.
 *
 * It is not a modal (FR-10): the page stays where it is, and Esc, a click outside or a page turn put
 * it away, shrinking back to where it came from. It writes nothing anywhere (FR-7): the only thing it
 * touches outside itself is the clipboard, and only when you press *Copy* — with exactly the text it
 * shows (FR-8). What a form lacks is said in one quiet line, with a way to add it where it lives.
 */

/** A box on screen: where Cite was asked from. */
export type CiteBox = { left: number; top: number; width: number; height: number };

/** One citation asked for: what is cited, from where. */
export interface CiteRequest {
    /** What the vault holds about the source (the book's note, the article's frontmatter). */
    source: CiteSource;
    /** The source's vault path, for the link back. */
    file: string;
    /** The chapter's identity in the file (#751), for the link back. */
    chapterKey?: string;
    /** Where the passage is. */
    place?: CiteInput["place"];
    /** The words cited; absent for a whole book. */
    passage?: string;
    from: CiteBox;
}

/** What the panel lives in and reaches through. */
export interface CiteHost {
    /** The positioned element it floats in. */
    host(): HTMLElement | null;
    /** The form chosen last (`settings.citeForm`). */
    form(): CiteForm;
    saveForm(form: CiteForm): void;
    /** Open the source's details at `field` (FR-4). Absent: the line names what is missing, nothing more. */
    addIt?(file: string, field: MissingField): void;
    /** A seam for tests: the clipboard. */
    copy?(host: HTMLElement, text: string): Promise<void> | void;
}

/** The chips' names: a literal map, so the locale guardrail sees every key. */
const FORM_LABEL: Record<CiteForm, LocaleKey> = {
    markdown: "reader_cite_form_markdown",
    inline: "reader_cite_form_inline",
    key: "reader_cite_form_key",
    bibtex: "reader_cite_form_bibtex",
    csl: "reader_cite_form_csl",
};

/** A missing field's name, as the line says it — the Details field's own name (#743). */
const FIELD_LABEL: Record<MissingField, LocaleKey> = {
    author: "shelf_details_field_author",
    year: "shelf_details_field_year",
    publisher: "shelf_details_field_publisher",
};

const MISSING_LINE: Record<CiteSource["kind"], LocaleKey> = {
    book: "reader_cite_missing_book",
    paper: "reader_cite_missing_paper",
    article: "reader_cite_missing_article",
};

/** How long *Copied* stays before the button says *Copy* again (FR-12). */
export const COPIED_MS = 1200;

/** The panel's least distance from the edges of what it floats over. */
const GAP_PX = 8;

function writeClipboard(host: HTMLElement, text: string): Promise<void> | void {
    const win = (host as HTMLElement & { win?: Window }).win ?? window;
    return win.navigator?.clipboard?.writeText(text);
}

/** `author`, `author or year`, `author, year or publisher` — in the language spoken. */
function namedFields(fields: readonly MissingField[]): string {
    const names = fields.map((field) => t(FIELD_LABEL[field]).toLocaleLowerCase());
    if (names.length === 1) return names[0];
    return t("reader_cite_or", names.slice(0, -1).join(", "), names[names.length - 1]);
}

interface Open {
    el: HTMLElement;
    scope: Component;
    gone: boolean;
}

export class CitePanel {
    private open: Open | null = null;

    constructor(private readonly view: CiteHost) {}

    isOpen(): boolean {
        return Boolean(this.open && !this.open.gone);
    }

    /** Whether `target` is inside the panel (a click there does not close it). */
    contains(target: Node | null): boolean {
        return Boolean(this.open && target && this.open.el.contains(target));
    }

    /** The panel, for `request`, grown from where it was asked (FR-10). */
    show(request: CiteRequest): HTMLElement | null {
        const host = this.view.host();
        if (!host) return null;
        this.close(false);
        const fields = citationFields(request.source);
        const input: CiteInput = {
            fields,
            ...(request.place ? { place: request.place } : {}),
            ...(request.passage?.trim() ? { passage: request.passage } : {}),
            link: citeLink(request.file, fields.title, request.chapterKey),
        };
        const title = request.passage?.trim() ? t("reader_cite_title") : t("shelf_cite_book");
        const el = host.createDiv({ cls: c("reader-cite"), attr: { role: "region", "aria-label": title } });
        const scope = new Component();
        scope.load();
        const open: Open = { el, scope, gone: false };
        this.open = open;
        // A click inside is not a new selection in the chapter, nor a click outside the panel.
        scope.registerDomEvent(el, "mousedown", (event: MouseEvent) => event.stopPropagation());
        // A click anywhere else puts it away (FR-10): over the page, in another pane, in the sidebar.
        // Caught on the way down: a pane that keeps its own clicks to itself still puts it away.
        const away = (event: MouseEvent) => {
            if (!el.contains(event.target as Node | null)) this.close();
        };
        const doc = host.ownerDocument as Document | null | undefined;
        if (doc) scope.registerDomEvent(doc, "mousedown", away, { capture: true });
        else scope.registerDomEvent(host, "mousedown", away, { capture: true });
        scope.registerDomEvent(el, "keydown", (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            this.close();
        });

        const head = el.createDiv({ cls: c("reader-cite-head") });
        head.createDiv({ cls: c("reader-cite-title"), text: title });
        panelClose(head, { label: "reader_cite_close", onClose: () => this.close(), scope });

        let form = this.view.form();
        const chips = el.createDiv({ cls: c("reader-cite-forms"), attr: { role: "group", "aria-label": t("reader_cite_forms") } });
        const text = el.createEl("pre", { cls: c("reader-cite-text"), attr: { "aria-live": "polite", tabindex: "0" } });
        const missing = el.createDiv({ cls: c("reader-cite-missing") });
        const actions = el.createDiv({ cls: c("reader-cite-actions") });
        const copy = actions.createEl("button", { cls: ["mod-cta", c("reader-cite-copy")], attr: { type: "button", "data-zf-cite-copy": "" } });
        const copyLabel = copy.createSpan({ text: t("reader_cite_copy") });
        const check = copy.createSpan({ cls: c("reader-cite-check"), attr: { "aria-hidden": "true" } });
        setIcon(check, "check");

        const buttons = new Map<CiteForm, HTMLElement>();
        const draw = (fade: boolean) => {
            for (const [each, button] of buttons) {
                const on = each === form;
                button.toggleClass("is-active", on);
                button.setAttribute("aria-pressed", String(on));
            }
            text.setText(formatCitation(form, input));
            missing.empty();
            const lacking = missingFor(form, fields);
            if (lacking.length > 0) {
                missing.createSpan({ text: t(MISSING_LINE[request.source.kind], namedFields(lacking)) });
                // An article's details are its own frontmatter: nothing here to add them in.
                if (this.view.addIt && request.source.kind !== "article") {
                    missing.createSpan({ cls: c("reader-cite-dot"), text: " · " });
                    const add = missing.createEl("button", {
                        cls: c("reader-cite-add"),
                        text: t(lacking.length > 1 ? "reader_cite_add_them" : "reader_cite_add_it"),
                        attr: { type: "button", "data-zf-cite-add": lacking[0] },
                    });
                    scope.registerDomEvent(add, "click", () => {
                        this.close(false);
                        this.view.addIt?.(request.file, lacking[0]);
                    });
                }
            }
            // The text alone crossfades (FR-11): the panel keeps its place and its width.
            if (fade && motionWelcome(text)) text.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: MOTION.ease });
        };
        for (const each of CITE_FORMS) {
            const button = chips.createEl("button", {
                cls: c("reader-cite-form"),
                text: t(FORM_LABEL[each]),
                attr: { type: "button", "data-form": each },
            });
            buttons.set(each, button);
            scope.registerDomEvent(button, "click", () => {
                if (form === each) return;
                form = each;
                this.view.saveForm(each);
                draw(true);
            });
        }
        draw(false);

        let back: number | undefined;
        const win = (el as HTMLElement & { win?: Window }).win ?? window;
        scope.register(() => win.clearTimeout(back));
        scope.registerDomEvent(copy, "click", () => {
            // Exactly what is shown (FR-8), and only now (FR-7).
            const shown = text.textContent ?? "";
            void Promise.resolve(this.view.copy ? this.view.copy(host, shown) : writeClipboard(host, shown)).catch((error: unknown) =>
                log.warn(`[Reader] a citation could not be copied: ${error instanceof Error ? error.name : "error"}`)
            );
            this.acknowledge(copy, copyLabel, check);
            win.clearTimeout(back);
            back = win.setTimeout(() => {
                if (open.gone) return;
                copyLabel.setText(t("reader_cite_copy"));
                copy.removeClass(c("reader-cite-copy--done"));
                if (motionWelcome(check)) check.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fast, easing: MOTION.ease });
            }, COPIED_MS);
        });

        this.place(host, el, request.from);
        if (motionWelcome(el)) {
            el.animate(
                [
                    { transform: "scale(0.96)", opacity: 0 },
                    { transform: "scale(1)", opacity: 1 },
                ],
                { duration: MOTION.fast, easing: MOTION.ease }
            );
        }
        (buttons.get(form) ?? copy).focus?.();
        return el;
    }

    /** *Copied*, with a check that fades in, in place (FR-12). No Notice. */
    private acknowledge(button: HTMLElement, label: HTMLElement, check: HTMLElement): void {
        label.setText(t("reader_cite_copied"));
        button.addClass(c("reader-cite-copy--done"));
        if (motionWelcome(check)) check.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: MOTION.ease });
    }

    /** Esc, a click outside, a page turn: the panel shrinks back to where it came from (FR-10). */
    close(animated = true): void {
        const open = this.open;
        if (!open || open.gone) return;
        open.gone = true;
        this.open = null;
        open.scope.unload();
        open.el.addClass(c("reader-cite--leaving"));
        if (!animated || !motionWelcome(open.el)) {
            open.el.remove();
            return;
        }
        const out = open.el.animate(
            [
                { transform: "scale(1)", opacity: 1 },
                { transform: "scale(0.96)", opacity: 0 },
            ],
            { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" }
        );
        const drop = () => open.el.remove();
        out.onfinish = drop;
        ((open.el as HTMLElement & { win?: Window }).win ?? window).setTimeout(drop, MOTION.fast + 300);
    }

    dispose(): void {
        this.close(false);
    }

    /**
     * Where the panel sits: where it was asked from — the popover it takes the place of, the button —
     * kept inside what it floats over, and growing from that point (FR-10).
     */
    private place(host: HTMLElement, el: HTMLElement, from: CiteBox): void {
        const box = host.getBoundingClientRect();
        const size = el.getBoundingClientRect();
        const width = size.width || 0;
        const height = size.height || 0;
        const centre = from.left + from.width / 2 - box.left;
        const top = from.top - box.top;
        const x = Math.max(GAP_PX, Math.min(centre - width / 2, box.width - width - GAP_PX));
        const y = Math.max(GAP_PX, Math.min(top, box.height - height - GAP_PX));
        el.setCssProps({
            "--zf-cite-x": `${Math.round(x)}px`,
            "--zf-cite-y": `${Math.round(y)}px`,
            "--zf-origin-x": `${Math.round(centre - x)}px`,
            "--zf-origin-y": `${Math.round(top - y)}px`,
        });
    }
}
