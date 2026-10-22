import { Component, setIcon } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { normalise } from "application/thinking/thread";
import type { LabSource, SourceKind } from "application/thinking/labSource";

/** The icon each kind of source is shown with, in the picker, the chips and the header. */
export const SOURCE_ICON: Record<SourceKind, string> = { book: "book-open", pdf: "file", note: "file-text" };

export interface SourcePickerParts {
    /** The sources to choose from, recent first. Read each time the picker opens. */
    sources: () => LabSource[];
    /** What is picked now, so a row can say so. */
    picked: () => readonly string[];
    /** A row was chosen: add it, or take it away. The picker stays open. */
    toggle: (path: string, from: HTMLElement) => void;
    /** A quiet *when* for a source's newest thought — a time, never a number of thoughts. */
    when: (at: number) => string;
}

/**
 * **From…** (#874 FR-5): the sources your thoughts came from, recent first, each with its kind and
 * its name — and **no number of thoughts on any row** (#469: you find, you are never told how much).
 * A type-ahead narrows by name, accents and case aside. A row toggles its source and the picker
 * stays open, so two books are two clicks.
 */
export class SourcePicker {
    private panel: HTMLElement | null = null;
    private rowsEl: HTMLElement | null = null;
    private field: HTMLInputElement | null = null;
    /** The open picker's own listeners: they go when it closes, however often it is painted. */
    private listeners: Component | null = null;

    constructor(
        private readonly host: HTMLElement,
        private readonly parts: SourcePickerParts
    ) {}

    isOpen(): boolean {
        return this.panel !== null;
    }

    /** Whether `node` is inside the open picker — an outside press closes it. */
    contains(node: Node | null): boolean {
        return Boolean(node && this.panel?.contains(node));
    }

    open(): void {
        if (this.panel) return;
        const panel = this.host.createDiv({ cls: c("lab-source-picker"), attr: { role: "dialog", "aria-label": t("lab_source_from_label") } });
        this.panel = panel;
        const field = panel.createEl("input", {
            type: "text",
            cls: c("lab-source-find"),
            attr: { placeholder: t("lab_source_find"), "aria-label": t("lab_source_find") },
        });
        this.field = field;
        const rows = panel.createDiv({ cls: c("lab-source-rows"), attr: { role: "listbox", "aria-multiselectable": "true" } });
        this.rowsEl = rows;
        const listeners = new Component();
        listeners.load();
        this.listeners = listeners;
        listeners.registerDomEvent(field, "input", () => this.paint());
        // One listener for every row, however many times the rows are drawn.
        listeners.registerDomEvent(rows, "click", (event: MouseEvent) => {
            const row = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-source]") ?? null;
            const path = row?.getAttribute("data-source");
            if (row && path) this.parts.toggle(path, row);
        });
        listeners.registerDomEvent(field, "keydown", (event: KeyboardEvent) => {
            if (event.key !== "Enter") return;
            const first = this.rowsEl?.querySelector<HTMLElement>(`.${c("lab-source-row")}`);
            if (!first) return;
            event.preventDefault();
            first.click();
        });
        this.paint();
        // Drops in from its control (MF-6), on the shared fast beat; CSS keeps it still under reduced motion.
        panel.addClass(c("lab-source-picker--in"));
        field.focus();
    }

    close(): void {
        this.listeners?.unload();
        this.listeners = null;
        this.panel?.remove();
        this.panel = null;
        this.rowsEl = null;
        this.field = null;
    }

    toggleOpen(): void {
        if (this.panel) this.close();
        else this.open();
    }

    /** Draw the rows again — after a toggle, so a row says it is picked, without moving the picker. */
    paint(): void {
        const rows = this.rowsEl;
        if (!rows) return;
        rows.empty();
        const all = this.parts.sources();
        if (all.length === 0) {
            rows.createDiv({ cls: c("lab-source-empty"), text: t("lab_source_empty") });
            return;
        }
        const needle = normalise(this.field?.value ?? "");
        const shown = needle ? all.filter((source) => normalise(source.name).includes(needle)) : all;
        if (shown.length === 0) {
            rows.createDiv({ cls: c("lab-source-empty"), text: t("lab_source_none_match") });
            return;
        }
        rows.createDiv({ cls: c("lab-source-label"), text: t("lab_source_recent") });
        const picked = this.parts.picked();
        for (const source of shown) {
            const on = picked.includes(source.path);
            const row = rows.createEl("button", {
                cls: [c("lab-source-row"), ...(on ? ["is-active"] : [])].join(" "),
                attr: { type: "button", role: "option", "aria-selected": on ? "true" : "false", "data-source": source.path },
            });
            setIcon(row.createSpan({ cls: c("lab-source-icon") }), SOURCE_ICON[source.kind]);
            row.createSpan({ cls: c("lab-source-name"), text: source.name });
            const mark = row.createSpan({ cls: c("lab-source-when") });
            if (on) setIcon(mark, "check");
            else mark.setText(this.parts.when(source.newest));
        }
    }
}
