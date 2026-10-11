import { Component, Platform, type App } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { aiMaxInputChars } from "architecture/ai/aiGate";
import { AiService } from "architecture/ai/AiService";
import type { ReaderAiFailure, ReaderAiJob, ReaderAiQueue } from "architecture/plugin/thinking/readerAiQueue";
import { DictionaryShelf, type DictionaryFiles, type DictionaryInfo, type OpenResult, type OpenedDictionary } from "architecture/plugin/library/DictionaryShelf";
import { openZettelFlowSettings } from "architecture/components/core/surface/openSettings";
import { DICTIONARY_PROFILE, sanitizeNodes, type ChapterBuilder, type SourceNode } from "application/library/epubSanitize";
import { dictionariesFor, findWord, lookupOffered, lookupQuery, primaryLanguage, shownParts, splitEntry, type ShownPart } from "application/library/stardict";
import { translateChoices, type DictionarySettings } from "application/library/dictionarySettings";
import { buildTranslatePrompt, cleanTranslation } from "application/thinking/readerMovePrompts";
import { MOTION, motionWelcome } from "./readerMotion";
import { languageName } from "./readerLanguage";
import { nextProposalSeq, type ProposalOwner } from "./readerProposal";
import { panelClose } from "./readerPanelHead";
import { readGate, type ReaderAi } from "./readerAiMoves";
import type { ScreenBox } from "./readerHighlights";

/**
 * **Look up and Translate** (#766, epic #741) — the last two buttons of the selection popover, and
 * the card they open, grown from the words (FR-12).
 *
 * - **Look up** reads **your** StarDict dictionaries — the open format of KOReader and GoldenDict —
 *   from the folder chosen in Settings → Reading, on this device, with **no network at all** (FR-4).
 *   The dictionaries for the book's language answer, each under its name: monolingual first, then
 *   bilingual — a word's translation, as Kindle's translation dictionaries give (FR-5). A definition
 *   is read, never kept: nothing is written.
 * - **Translate** a passage: on iPhone and iPad the system's own, in its callout — ours is hidden;
 *   elsewhere through **your** AI provider, only while AI is turned on, one request per click,
 *   through the Reader's AI queue (#759) — the passage and the target language, and nothing else.
 *
 * The shelf and the StarDict readers import no AI layer and make no network call, and this card
 * calls the AI layer only for *Translate*; a structural test holds both.
 */

/** A dictionary opening for longer than this says so, as text (FR-13). */
export const OPENING_MS = 150;
/** How long *Opening …* stays once it is said, so the entry never chases it off as a flash. */
export const OPENING_DWELL_MS = 300;

/** *Where to find free dictionaries*: the docs page that lists them (nothing is bundled). */
export const DICTIONARIES_DOCS_URL = "https://rafaelgb.github.io/Obsidian-ZettelFlow/development/reader-dictionaries/";

/** How many records of one dictionary a word shows: a homograph's few, never a page of them. */
const MAX_RECORDS = 4;
/** The gap between the words and the card, in px: the 4-grid's first step. */
const GAP_PX = 4;

/** The shelf, as the card reads it. */
export interface LookupShelf {
    list(folder: string): DictionaryFiles[];
    info(set: DictionaryFiles, saved?: { from?: string; to?: string }): Promise<DictionaryInfo>;
    open(set: DictionaryFiles, languages: DictionaryInfo["languages"]): Promise<OpenResult>;
    isOpen(set: DictionaryFiles): boolean;
}

/** What the Reader lends the card. */
export interface LookupView {
    app: App;
    /** Where the card floats: the Reader's root, positioned. */
    host(): HTMLElement | null;
    /** The language of what is on screen (#757), or `null` for Obsidian's. */
    bookLanguage(): string | null;
    /** Obsidian's language, as a tag. */
    uiLanguage(): string;
    settings(): DictionarySettings;
    /** The language chosen in the card, kept in Settings → Reading › Translate into (§XIII). */
    saveTranslateInto(tag: string): Promise<void>;
    /** The Reader's AI queue (#759): every request it sends waits there. */
    queue(): ReaderAiQueue | null;
}

/** Seams for tests: the shelf, the AI layer, Settings, the docs, the clipboard, the markup parser. */
export interface LookupDeps {
    shelf?: LookupShelf;
    ai?: ReaderAi;
    openSettings?: (app: App, section: "reading" | "ai") => void;
    openDocs?: (url: string) => void;
    copy?: (text: string) => void;
    parse?: (markup: string) => SourceNode | null;
}

/** What the popover offers for a selection (FR-1, FR-9). */
export interface LookupOffer {
    lookUp: boolean;
    translate: boolean;
}

/** An entry rebuilt in the card: `createEl` and `appendText`, never `innerHTML` (AC-3). */
const cardBuilder: ChapterBuilder<HTMLElement> = {
    element(parent, tag, attrs) {
        return parent.createEl(tag as keyof HTMLElementTagNameMap, { attr: attrs });
    },
    text(parent, text) {
        parent.appendText(text);
    },
};

/** The platform's forgiving parser: markup as data, never assigned as HTML. */
function domParse(markup: string): SourceNode | null {
    try {
        return new DOMParser().parseFromString(markup, "text/html").body;
    } catch {
        return null;
    }
}

function failureLine(failure: ReaderAiFailure): string {
    if (failure.kind === "timeout") return t("reader_ai_no_answer");
    if (failure.kind === "status") return t("reader_ai_status", String(failure.status));
    return t("reader_ai_failed");
}

/** Names as a sentence says them, in Obsidian's language: *A, B and C*. */
function listOf(names: readonly string[], ui: string): string {
    try {
        const Ctor = (Intl as unknown as { ListFormat?: new (locale?: string, options?: { style: string; type: string }) => { format(list: readonly string[]): string } }).ListFormat;
        if (Ctor) return new Ctor(ui || undefined, { style: "long", type: "conjunction" }).format(names);
    } catch {
        // An unknown locale: a plain list below.
    }
    return names.join(", ");
}

interface Card {
    el: HTMLElement;
    body: HTMLElement;
    seq: number;
    scope: Component;
    /** What it answers: `lookup:<query>` or `translate:<target>:<passage>`. */
    key: string;
    copyText: string | null;
    copy: HTMLElement;
    job: ReaderAiJob | null;
    gone: boolean;
}

export class ReaderLookup implements ProposalOwner {
    private card: Card | null = null;
    private readonly shelf: LookupShelf;
    private readonly ai: () => ReaderAi;
    private readonly openSettings: NonNullable<LookupDeps["openSettings"]>;
    private readonly openDocs: NonNullable<LookupDeps["openDocs"]>;
    private readonly copyOut: NonNullable<LookupDeps["copy"]>;
    private readonly parse: NonNullable<LookupDeps["parse"]>;
    private disposed = false;

    constructor(
        private readonly view: LookupView,
        deps: LookupDeps = {}
    ) {
        this.shelf = deps.shelf ?? DictionaryShelf.getInstance();
        this.ai = () => deps.ai ?? AiService.getInstance();
        this.openSettings = deps.openSettings ?? ((app, section) => openZettelFlowSettings(app, section));
        this.openDocs = deps.openDocs ?? ((url) => void (this.view.host()?.win ?? window).open(url));
        this.copyOut = deps.copy ?? ((text) => void (this.view.host()?.win ?? window).navigator?.clipboard?.writeText(text));
        this.parse = deps.parse ?? domParse;
    }

    /** The AI layer — `AiService` unless a test gives another — read only by *Translate*. */
    private aiLayer(): ReaderAi | null {
        try {
            return this.ai();
        } catch {
            return null;
        }
    }

    /** What the popover offers for `text` (FR-1, FR-9) — read each time the popover opens. */
    offers(text: string): LookupOffer {
        return { lookUp: lookupOffered(text, this.view.bookLanguage() ?? undefined), translate: this.translateOffered(text) };
    }

    /**
     * *Translate* where an honest path exists, and only there (FR-9): hidden on iPhone and iPad, where
     * the system's is in its callout; hidden while AI is off; offered up to the AI input limit.
     */
    private translateOffered(text: string): boolean {
        if (Platform.isIosApp) return false;
        const ai = this.aiLayer();
        if (!ai || !text.trim()) return false;
        const gate = readGate(() => ai);
        if (gate === "disabled") return false;
        try {
            return text.length <= aiMaxInputChars(ai.config());
        } catch {
            return false;
        }
    }

    // ── the first Esc step: the card is the newest thing on the page ─────────

    hasCards(): boolean {
        return Boolean(this.card && !this.card.gone);
    }

    newestSeq(): number {
        return this.card && !this.card.gone ? this.card.seq : 0;
    }

    dismissNewest(): void {
        this.close();
    }

    isOpen(): boolean {
        return this.hasCards();
    }

    /** Whether `target` is inside the card (a click there does not close it). */
    contains(target: Node | null): boolean {
        return Boolean(this.card && target && this.card.el.contains(target));
    }

    /** Esc, a click outside, a page turn: the card goes back into the words, nothing kept (FR-7, FR-12). */
    close(): void {
        const card = this.card;
        if (!card || card.gone) return;
        card.gone = true;
        this.card = null;
        card.job?.cancel();
        card.scope.unload();
        card.el.addClass(c("reader-lookup-card--leaving"));
        if (!motionWelcome(card.el)) {
            card.el.remove();
            return;
        }
        // The same grow, backwards: into the words it came from.
        const out = card.el.animate(
            [
                { transform: "scale(1)", opacity: 1 },
                { transform: "scale(0.96)", opacity: 0 },
            ],
            { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" }
        );
        const drop = () => card.el.remove();
        out.onfinish = drop;
        (card.el.win ?? window).setTimeout(drop, MOTION.fast + 300);
    }

    dispose(): void {
        this.disposed = true;
        this.close();
    }

    // ── Look up ──────────────────────────────────────────────────────────────

    /** Look `text` up in your dictionaries, from the words at `from` (FR-1 … FR-8, FR-13). */
    async lookUp(text: string, from: ScreenBox): Promise<void> {
        const query = lookupQuery(text);
        if (this.disposed || !query) return;
        const card = this.openCard(from, `lookup:${query}`, query, t("reader_lookup_offline"));
        if (!card) return;
        const settings = this.view.settings();
        const ui = this.view.uiLanguage();
        const sets = this.shelf.list(settings.folder).filter((set) => !set.missing);
        if (sets.length === 0) return this.empty(card, t("reader_lookup_none_installed"));
        const infos = (await Promise.all(sets.map((set) => this.shelf.info(set, settings.languages[set.base])))).filter((info) => info.ifo && !info.reason);
        if (card.gone) return;
        const book = this.view.bookLanguage() || ui;
        const candidates = dictionariesFor(book, infos);
        if (candidates.length === 0) return this.empty(card, t("reader_lookup_none_for_language", languageName(primaryLanguage(book), ui)));
        // FR-13: an opened dictionary answers at once; one being opened says so after a beat, as text.
        const closed = candidates.filter((info) => !this.shelf.isOpen(info.files));
        const win = card.el.win ?? window;
        // Once *Opening …* is said it stays a moment: an entry that follows it at once read as a flash (walk).
        const said: { dwell: Promise<void> | null } = { dwell: null };
        const opening = closed.length
            ? win.setTimeout(() => {
                  if (card.gone || this.card !== card) return;
                  said.dwell = new Promise((resolve) => win.setTimeout(resolve, OPENING_DWELL_MS));
                  card.body.empty();
                  card.body.createDiv({ cls: c("reader-lookup-opening"), text: t("reader_lookup_opening", listOf(closed.map((info) => info.name), ui)) });
              }, OPENING_MS)
            : undefined;
        const results = await Promise.all(candidates.map(async (info) => ({ info, result: await this.shelf.open(info.files, info.languages) })));
        win.clearTimeout(opening);
        if (said.dwell) await said.dwell;
        if (card.gone || this.card !== card) return;
        const opened: OpenedDictionary[] = [];
        const refused: { name: string; key: "reader_lookup_too_large" | "reader_lookup_unreadable" }[] = [];
        for (const { info, result } of results) {
            if (result.ok) opened.push(result.dictionary);
            else {
                if (result.reason !== "too-large") log.warn(`[reader] a dictionary could not be opened: ${result.reason}`);
                refused.push({ name: info.name, key: result.reason === "too-large" ? "reader_lookup_too_large" : "reader_lookup_unreadable" });
            }
        }
        const hits = findWord(opened, query, ui);
        const sections: { name: string; translation: boolean; parts: { headword: string; shown: ShownPart[] }[] }[] = [];
        for (const hit of hits) {
            const parts: { headword: string; shown: ShownPart[] }[] = [];
            for (const record of hit.records.slice(0, MAX_RECORDS)) {
                const bytes = await hit.dictionary.entry(record);
                const shown = bytes ? shownParts(splitEntry(bytes, hit.dictionary.sametypesequence)) : [];
                if (shown.length) parts.push({ headword: hit.dictionary.headword(record), shown });
            }
            if (parts.length) sections.push({ name: hit.dictionary.name, translation: hit.translation, parts });
        }
        if (card.gone || this.card !== card) return;
        this.settle(card, () => {
            const copied: string[] = [];
            for (const section of sections) {
                const entry = card.body.createDiv({ cls: c("reader-lookup-entry") });
                const source = entry.createDiv({ cls: c("reader-lookup-source") });
                source.createSpan({ text: section.name });
                if (section.translation) source.createSpan({ cls: c("reader-lookup-kind"), text: t("reader_lookup_translation") });
                const lines: string[] = [section.name];
                for (const part of section.parts) {
                    // A synonym's headword is said: *corrió* answered by *correr*.
                    if (part.headword && part.headword.toLowerCase() !== query.toLowerCase()) {
                        entry.createDiv({ cls: c("reader-lookup-headword"), text: part.headword });
                        lines.push(part.headword);
                    }
                    for (const shown of part.shown) lines.push(this.renderPart(entry, shown));
                }
                copied.push(lines.filter(Boolean).join("\n"));
            }
            for (const { name, key } of refused) {
                const entry = card.body.createDiv({ cls: [c("reader-lookup-entry"), c("reader-lookup-entry--refused")] });
                entry.createDiv({ cls: c("reader-lookup-source"), text: name });
                entry.createDiv({ cls: c("reader-lookup-line"), text: t(key) });
            }
            if (sections.length === 0 && opened.length > 0) {
                card.body.createDiv({ cls: c("reader-lookup-line"), text: t("reader_lookup_no_entry", query, listOf(opened.map((d) => d.name), ui)) });
            }
            card.copyText = copied.length ? `${query}\n\n${copied.join("\n\n")}` : null;
            card.copy.toggleClass(c("reader-hidden"), !card.copyText);
        });
    }

    /** One part of an entry: text as text, markup rebuilt by the dictionary profile. Its text, for *Copy*. */
    private renderPart(entry: HTMLElement, part: ShownPart): string {
        if (part.kind === "text") {
            const el = entry.createDiv({ cls: [c("reader-lookup-def"), ...(part.phonetic ? [c("reader-lookup-def--phonetic")] : [])], text: part.text });
            return el.textContent ?? part.text;
        }
        const el = entry.createDiv({ cls: c("reader-lookup-def") });
        // Pango and XDXF mark lines with newlines; HTML with its own elements.
        const markup = part.markup === "html" ? part.text : part.text.replace(/\n/g, "<br/>");
        const root = this.parse(markup);
        if (root) sanitizeNodes(root, el, cardBuilder, DICTIONARY_PROFILE);
        return el.textContent ?? "";
    }

    /** An empty state (FR-8): one line, *Open settings* and *Where to find free dictionaries*. */
    private empty(card: Card, line: string): void {
        if (card.gone || this.card !== card) return;
        this.settle(card, () => {
            card.body.createDiv({ cls: c("reader-lookup-line"), text: line });
            const links = card.body.createDiv({ cls: c("reader-lookup-links") });
            const settings = links.createEl("button", { text: t("reader_lookup_open_settings"), attr: { type: "button" } });
            card.scope.registerDomEvent(settings, "click", () => {
                this.close();
                this.openSettings(this.view.app, "reading");
            });
            const where = links.createEl("button", { text: t("reader_lookup_where"), attr: { type: "button" } });
            card.scope.registerDomEvent(where, "click", () => this.openDocs(DICTIONARIES_DOCS_URL));
            card.copy.addClass(c("reader-hidden"));
        });
    }

    // ── Translate ────────────────────────────────────────────────────────────

    /** Translate `text`, from the words at `from` (FR-9, FR-14): one request, on this click. */
    translate(text: string, from: ScreenBox): void {
        const ai = this.aiLayer();
        if (this.disposed || !ai || Platform.isIosApp) return;
        const gate = readGate(() => ai);
        if (gate === "disabled") return;
        const ui = this.view.uiLanguage();
        const chosen = this.view.settings().translateInto || ui;
        const book = this.view.bookLanguage();
        const asks = Boolean(book) && primaryLanguage(chosen) === primaryLanguage(book);
        const key = `translate:${asks ? "?" : chosen}:${text}`;
        // The same passage clicked again while it waits: nothing more is sent (FR-9).
        if (this.card && !this.card.gone && this.card.key === key) return;
        const card = this.openCard(from, key, asks ? t("reader_hl_translate") : t("reader_translate_into_title", languageName(chosen, ui)), t("reader_translate_byline"));
        if (!card) return;
        card.copy.addClass(c("reader-hidden"));
        // On, not set up: the card says so and points to Settings › AI; nothing is sent.
        if (gate !== "ready") return this.problem(card, t("reader_ai_setup"), { label: t("reader_ai_open_settings"), run: () => this.openSettings(this.view.app, "ai") });
        if (asks) return this.askTarget(card, text, book ?? "");
        this.send(card, text, chosen);
    }

    /** The target is the book's own language (FR-9): the card asks, and the choice is kept (§XIII). */
    private askTarget(card: Card, text: string, book: string): void {
        const ui = this.view.uiLanguage();
        this.settle(card, () => {
            const ask = card.body.createDiv({ cls: c("reader-lookup-ask") });
            ask.createEl("label", { cls: c("reader-lookup-line"), text: t("reader_translate_which") });
            const select = ask.createEl("select", { cls: "dropdown", attr: { "aria-label": t("reader_translate_which") } });
            const choices = translateChoices(ui).filter((tag) => primaryLanguage(tag) !== primaryLanguage(book));
            for (const tag of choices) select.createEl("option", { text: languageName(tag, ui), attr: { value: tag } });
            select.value = choices[0] ?? "en";
            const go = ask.createEl("button", { cls: "mod-cta", text: t("reader_hl_translate"), attr: { type: "button" } });
            card.scope.registerDomEvent(go, "click", () => {
                const target = select.value || choices[0];
                if (!target) return;
                void this.view.saveTranslateInto(target);
                card.el.querySelector(`.${c("reader-lookup-word")}`)?.setText(t("reader_translate_into_title", languageName(target, ui)));
                this.send(card, text, target);
            });
        });
    }

    /** One request through the Reader's queue (#759): the ink waits, the translation lands in place. */
    private send(card: Card, text: string, target: string): void {
        const ai = this.aiLayer();
        const queue = this.view.queue();
        if (!ai || !queue || card.gone) return;
        let prompt: string;
        try {
            prompt = buildTranslatePrompt(text, target, { maxChars: aiMaxInputChars(ai.config()) });
        } catch {
            this.problem(card, t("reader_ai_failed"));
            return;
        }
        const job = queue.ask(`translate:${target}:${text}`, prompt);
        if (!job) return;
        card.job = job;
        this.waiting(card);
        void job.result.then((outcome) => {
            if (card.gone || card.job !== job || outcome.kind === "discarded") return;
            card.job = null;
            // *Try again* is a new click: a new request, never one sent by itself.
            const again = { label: t("reader_ai_try_again"), run: () => this.send(card, text, target) };
            if (outcome.kind === "failed") return this.problem(card, failureLine(outcome.failure), again);
            const answer = cleanTranslation(outcome.text);
            if (!answer) {
                log.warn("[reader] a translation came back empty");
                return this.problem(card, t("reader_ai_failed"), again);
            }
            this.settle(card, () => {
                card.body.createDiv({ cls: [c("reader-lookup-def"), c("reader-lookup-translation")], text: answer });
                card.copyText = answer;
                card.copy.removeClass(c("reader-hidden"));
            });
        });
    }

    /** #759's ink, breathing where the translation will be: three faint lines, opacity only (FR-14). */
    private waiting(card: Card): void {
        card.body.empty();
        const ink = card.body.createDiv({ cls: c("reader-ink-wait"), attr: { "aria-hidden": "true" } });
        for (let i = 0; i < 3; i++) ink.createSpan();
    }

    private problem(card: Card, message: string, action?: { label: string; run(): void }): void {
        this.settle(card, () => {
            card.body.createDiv({ cls: [c("reader-lookup-line"), c("reader-lookup-line--problem")], text: message });
            if (!action) return;
            const links = card.body.createDiv({ cls: c("reader-lookup-links") });
            const button = links.createEl("button", { cls: "mod-cta", text: action.label, attr: { type: "button" } });
            card.scope.registerDomEvent(button, "click", () => action.run());
        });
    }

    // ── the card ─────────────────────────────────────────────────────────────

    /**
     * The card, grown from the words (FR-12): scale 0.96 → 1 and a fade, the fast beat, its origin the
     * selection's centre. Under the words, or over them when there is no room below.
     */
    private openCard(from: ScreenBox, key: string, title: string, byline: string): Card | null {
        const host = this.view.host();
        if (!host) return null;
        this.close();
        const el = host.createDiv({ cls: c("reader-lookup-card"), attr: { role: "dialog", "aria-label": title } });
        const scope = new Component();
        scope.load();
        // A click inside the card is not a new selection in the chapter, nor a click outside it.
        scope.registerDomEvent(el, "mousedown", (event: MouseEvent) => event.stopPropagation());
        const head = el.createDiv({ cls: c("reader-lookup-head") });
        head.createDiv({ cls: c("reader-lookup-word"), text: title });
        panelClose(head, { label: "reader_lookup_close", onClose: () => this.close(), scope });
        el.createDiv({ cls: c("reader-lookup-byline"), text: byline });
        const body = el.createDiv({ cls: c("reader-lookup-body"), attr: { "aria-live": "polite" } });
        const actions = el.createDiv({ cls: c("reader-lookup-actions") });
        const copy = actions.createEl("button", { cls: c("reader-hidden"), text: t("reader_lookup_copy"), attr: { type: "button" } });
        const card: Card = { el, body, seq: nextProposalSeq(), scope, key, copyText: null, copy, job: null, gone: false };
        scope.registerDomEvent(copy, "click", () => {
            if (card.copyText) this.copyOut(card.copyText);
            copy.setText(t("reader_hl_copied"));
        });
        scope.registerDomEvent(el, "keydown", (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            this.close();
        });
        this.place(host, el, from);
        if (motionWelcome(el)) {
            el.animate(
                [
                    { transform: "scale(0.96)", opacity: 0 },
                    { transform: "scale(1)", opacity: 1 },
                ],
                { duration: MOTION.fast, easing: MOTION.ease }
            );
        }
        this.card = card;
        return card;
    }

    /** Where the card sits, inside the host, and the point it grows from: the selection's centre. */
    private place(host: HTMLElement, card: HTMLElement, from: ScreenBox): void {
        const box = host.getBoundingClientRect();
        const size = card.getBoundingClientRect();
        const width = size.width || 0;
        const height = size.height || 0;
        const centre = from.left + from.width / 2 - box.left;
        const x = Math.max(GAP_PX, Math.min(centre - width / 2, box.width - width - GAP_PX));
        const below = from.top + from.height - box.top + GAP_PX;
        const above = height > 0 && below + height > box.height && from.top - box.top - GAP_PX - height >= 0;
        const y = above ? from.top - box.top - GAP_PX - height : below;
        card.setCssProps({
            "--zf-lookup-x": `${Math.round(x)}px`,
            "--zf-lookup-y": `${Math.round(y)}px`,
            "--zf-origin-x": `${Math.round(centre - x)}px`,
            "--zf-origin-y": above ? `${Math.round(height + GAP_PX)}px` : `${-GAP_PX}px`,
        });
    }

    /** What the card's body says next, in the same box: it fades in, and nothing above it moves (FR-13). */
    private settle(card: Card, draw: () => void): void {
        if (card.gone) return;
        const was = card.body.children.length > 0;
        card.body.empty();
        draw();
        if (was && motionWelcome(card.body)) card.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: MOTION.ease });
    }
}
