import { Modal, setIcon, type App } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import { SELECTION_CAP, type ReadingPathOption } from "architecture/knowledge/state";
import { openReader } from "./openReader";
import { optionsFor, selectionFor } from "./readerPaths";
import { readerHost, type ReaderHost } from "./readerHost";
import { normalizeResume, readingKey, resumeOf, type ResumeEntry } from "./readerResume";
import { KIND_KEY } from "./readerLabels";
import { deleteReading, normalizeSaved, renameReading, savedThrough, type SavedReading } from "./readerSaved";

type LocaleKey = Parameters<typeof t>[0];

/** What each seeded way through a note promises, under its name. */
const DESC_KEY: Record<ReadingPathOption["kind"], LocaleKey> = {
    around: "reader_kind_around_desc",
    argument: "reader_kind_argument_desc",
    story: "reader_kind_story_desc",
    essentials: "reader_kind_essentials_desc",
    region: "reader_kind_region_desc",
};

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** The most recent reading of this note left part-way, among the ways the chooser offers. */
export function pendingResume(
    host: ReaderHost | null,
    seed: string,
    options: readonly ReadingPathOption[]
): { kind: ReadingPathOption["kind"]; entry: ResumeEntry } | null {
    const map = normalizeResume(host?.settings?.readerResume);
    let best: { kind: ReadingPathOption["kind"]; entry: ResumeEntry } | null = null;
    for (const option of options) {
        const entry = resumeOf(map, readingKey(option.kind, seed));
        if (entry && (!best || entry.at > best.entry.at)) best = { kind: option.kind, entry };
    }
    return best;
}

/**
 * **How do you want to read it?** (#669) — the ways through a note, side by side.
 *
 * Each shows a small picture of its shape, what it promises and the chapters it would read, so the
 * choice is made on what you will actually read. Only the ways the vault gives substance to are
 * offered; one already started can be resumed. Nothing is written by choosing.
 */
export class ReadingPathModal extends Modal {
    private selected: ReadingPathOption["kind"];

    constructor(
        app: App,
        private readonly seed: string,
        private readonly options: readonly ReadingPathOption[],
        private readonly host: ReaderHost | null = readerHost()
    ) {
        super(app);
        this.selected = options[0]?.kind ?? "around";
    }

    onOpen(): void {
        this.setTitle(t("reader_choose_title"));
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass(c("reader-chooser"));
        contentEl.createDiv({ cls: c("reader-chooser-intro"), text: t("reader_choose_intro", noteName(this.seed)) });

        const resume = pendingResume(this.host, this.seed, this.options);
        if (resume) {
            const line = contentEl.createEl("button", {
                cls: c("reader-chooser-resume"),
                attr: { type: "button" },
                text: `${t(KIND_KEY[resume.kind])} · ${t("reader_resume", String(resume.entry.chapter + 1), String(resume.entry.total))}`,
            });
            line.addEventListener("click", () => this.start(resume.kind, resume.entry.chapter));
        }

        this.renderSaved(contentEl);

        if (this.options.length === 0) return;
        const grid = contentEl.createDiv({ cls: c("reader-chooser-grid"), attr: { role: "radiogroup" } });
        for (const option of this.options) {
            const on = option.kind === this.selected;
            const card = grid.createEl("button", {
                cls: [c("reader-chooser-card"), ...(on ? ["is-active"] : [])].join(" "),
                attr: { type: "button", role: "radio", "aria-checked": String(on) },
            });
            drawDiagram(card, option.kind);
            card.createDiv({ cls: c("reader-chooser-name"), text: t(KIND_KEY[option.kind]) });
            card.createDiv({ cls: c("reader-chooser-desc"), text: t(DESC_KEY[option.kind]) });
            card.createDiv({
                cls: c("reader-chooser-count"),
                text: tCount(option.path.chapters.length, "reader_choose_chapters", String(option.path.chapters.length)),
            });
            card.addEventListener("click", () => {
                this.selected = option.kind;
                this.render();
            });
            card.addEventListener("dblclick", () => this.start(option.kind, 0));
        }

        const chosen = this.options.find((option) => option.kind === this.selected) ?? this.options[0];
        const foot = contentEl.createDiv({ cls: c("reader-chooser-foot") });
        const preview = foot.createEl("ol", { cls: c("reader-chooser-preview") });
        chosen?.path.chapters.forEach((chapter) => {
            preview.createEl("li", { cls: c("reader-chooser-chip"), text: noteName(chapter.path) });
        });
        const go = foot.createEl("button", {
            cls: ["mod-cta", c("reader-chooser-start")].join(" "),
            attr: { type: "button" },
            text: t("reader_choose_start"),
        });
        go.addEventListener("click", () => this.start(this.selected, 0));
    }

    /**
     * **Your saved paths** (#672) through this note — kept from an end card, in the order they were
     * read. Each reads again, renames in place, or goes; all of it lives in plugin data, never a note.
     */
    private renderSaved(contentEl: HTMLElement): void {
        const saved = savedThrough(normalizeSaved(this.host?.settings?.readerSaved), this.seed);
        if (saved.length === 0) return;
        const section = contentEl.createDiv({ cls: c("reader-saved") });
        section.createDiv({ cls: c("reader-saved-heading"), text: t("reader_saved_heading") });
        const list = section.createDiv({ cls: c("reader-saved-list") });
        for (const entry of saved) {
            const row = list.createDiv({ cls: c("reader-saved-row") });
            const open = row.createEl("button", { cls: c("reader-saved-open"), attr: { type: "button" } });
            open.createSpan({ cls: c("reader-saved-name"), text: entry.name });
            open.createSpan({
                cls: c("reader-saved-meta"),
                text: tCount(entry.paths.length, "reader_choose_chapters", String(entry.paths.length)),
            });
            open.addEventListener("click", () => {
                this.close();
                void openSavedReading(this.app, entry);
            });
            const rename = row.createEl("button", {
                cls: "clickable-icon",
                attr: { type: "button", "aria-label": t("reader_saved_rename") },
            });
            setIcon(rename, "pencil");
            rename.addEventListener("click", () => this.renameInPlace(row, entry));
            const remove = row.createEl("button", {
                cls: "clickable-icon",
                attr: { type: "button", "aria-label": t("reader_saved_delete") },
            });
            setIcon(remove, "trash-2");
            remove.addEventListener("click", () => void this.updateSaved((list) => deleteReading(list, entry.id)));
        }
    }

    private renameInPlace(row: HTMLElement, entry: SavedReading): void {
        row.empty();
        const input = row.createEl("input", {
            cls: c("reader-saved-input"),
            attr: { type: "text", "aria-label": t("reader_save_name_label"), value: entry.name },
        });
        input.value = entry.name;
        const keep = row.createEl("button", { cls: "mod-cta", attr: { type: "button" }, text: t("reader_save_confirm") });
        const commit = () => void this.updateSaved((list) => renameReading(list, entry.id, input.value));
        keep.addEventListener("click", commit);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                commit();
            } else if (event.key === "Escape") {
                // Put the row back; the modal stays open.
                event.preventDefault();
                event.stopPropagation();
                this.render();
            }
        });
        input.focus();
        input.select();
    }

    private async updateSaved(change: (list: SavedReading[]) => SavedReading[]): Promise<void> {
        const settings = this.host?.settings;
        if (!settings) return;
        settings.readerSaved = change(normalizeSaved(settings.readerSaved));
        await this.host?.saveSettings?.();
        this.render();
    }

    private start(kind: ReadingPathOption["kind"], chapter: number): void {
        this.close();
        void openReader(this.app, { seed: this.seed, kind, chapter });
    }
}

/**
 * A small picture of each way's shape — dots and lines, coloured by class on the theme's own
 * colours. Each `cls` is one token or an array: Obsidian's `createSvg` adds it with `classList.add`.
 */
function drawDiagram(host: HTMLElement, kind: ReadingPathOption["kind"]): void {
    const svg = host.createSvg("svg", { cls: c("reader-diagram"), attr: { viewBox: "0 0 120 44", "aria-hidden": "true" } });
    const node = (x: number, y: number, r: number, tone: string) =>
        svg.createSvg("circle", { cls: [c("reader-diagram-node"), c(`reader-diagram-node--${tone}`)], attr: { cx: x, cy: y, r } });
    const edge = (x1: number, y1: number, x2: number, y2: number) =>
        svg.createSvg("line", { cls: c("reader-diagram-edge"), attr: { x1, y1, x2, y2 } });
    switch (kind) {
        case "around":
            for (const [x, y] of [[30, 10], [30, 34], [90, 10], [90, 34], [60, 6]]) edge(60, 22, x, y);
            for (const [x, y] of [[30, 10], [30, 34], [90, 10], [90, 34], [60, 6]]) node(x, y, 4, "plain");
            node(60, 22, 7, "accent");
            return;
        case "argument":
            edge(20, 22, 60, 10);
            edge(20, 22, 60, 34);
            edge(60, 10, 100, 22);
            edge(60, 34, 100, 22);
            node(20, 22, 6, "accent");
            node(60, 10, 5, "support");
            node(60, 34, 5, "counter");
            node(100, 22, 6, "synthesis");
            return;
        case "story":
            svg.createSvg("path", { cls: c("reader-diagram-curve"), attr: { d: "M10 38 C30 38 32 8 58 8 S86 32 110 18" } });
            for (const [x, y] of [[10, 38], [58, 8], [110, 18]]) node(x, y, 4, "accent");
            return;
        case "essentials":
            edge(26, 22, 94, 22);
            node(26, 22, 4, "plain");
            node(94, 22, 4, "plain");
            node(60, 6, 2.5, "faint");
            node(60, 38, 2.5, "faint");
            node(60, 22, 8, "accent");
            return;
        case "region":
            svg.createSvg("ellipse", { cls: c("reader-diagram-region"), attr: { cx: 60, cy: 22, rx: 46, ry: 18 } });
            for (const [x1, y1, x2, y2] of [[36, 16, 56, 28], [56, 28, 80, 14], [80, 14, 88, 30], [36, 16, 80, 14]]) edge(x1, y1, x2, y2);
            for (const [x, y] of [[36, 16], [80, 14], [88, 30]]) node(x, y, 4, "plain");
            node(56, 28, 6, "accent");
            return;
    }
}

/**
 * **Read from here** (#669): the chooser when there is a choice — several ways through the note, or
 * a reading of it left part-way — and straight into the reading when there is only one way.
 */
export function readFrom(app: App, seed: string, host: ReaderHost | null = readerHost()): void {
    const options = optionsFor(app, seed);
    const saved = savedThrough(normalizeSaved(host?.settings?.readerSaved), seed);
    if (options.length > 1 || saved.length > 0 || pendingResume(host, seed, options)) {
        new ReadingPathModal(app, seed, options, host).open();
        return;
    }
    void openReader(app, { seed });
}

/** A saved path (#672), read again in the order it was kept, under its name. */
export function openSavedReading(app: App, entry: SavedReading): Promise<void> {
    return openReader(app, { seed: entry.seed, kind: "selection", paths: entry.paths, name: entry.name });
}

/**
 * **Read these** (#669): notes you picked — files, a folder, an Explore selection — read in the
 * order their links suggest, and resumed where you left that same set. Nothing to read reads
 * nothing.
 */
export function readSelection(app: App, paths: readonly string[], host: ReaderHost | null = readerHost()): void {
    const notes = [...new Set(paths)].filter((path) => path.toLowerCase().endsWith(".md"));
    if (notes.length === 0) return;
    const built = selectionFor(notes);
    const ordered = built ? built.chapters.map((chapter) => chapter.path) : [...notes].sort().slice(0, SELECTION_CAP);
    const resumed = resumeOf(normalizeResume(host?.settings?.readerResume), readingKey("selection", ordered[0], ordered));
    void openReader(app, { seed: ordered[0], kind: "selection", paths: ordered, chapter: resumed?.chapter ?? 0 });
}
