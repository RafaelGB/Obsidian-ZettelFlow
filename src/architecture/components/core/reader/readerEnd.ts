import { setIcon, type Component } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";

type LocaleKey = Parameters<typeof t>[0];

/** What a reading added up to — what the end card says, and nothing that grades it. */
export interface EndStats {
    minutes: number;
    notes: number;
    detours: number;
    highlights: number;
    marginNotes: number;
}

/** What the end card can do — each one a click you make, never something done for you. */
export interface EndActions {
    /** Keep the path; resolves once saved. */
    save(name: string): Promise<void>;
    exportDocument(): void;
    cultivate(): void;
    again(): void;
    /** Another way through the same note; absent for a picked set, which has no other way. */
    another?: () => void;
}

export interface EndCard {
    title: string;
    /** How it was read, e.g. "Around this note". */
    kindLabel: string;
    /** The note Cultivate would open — the thesis, or the note it started from. */
    thesis: string;
    /** The name a save proposes. */
    defaultName: string;
    /** Already saved under this name, if so. */
    savedAs?: string;
    stats: EndStats;
    actions: EndActions;
    /** A line to show under the actions — an export's outcome, with its Open and Undo. */
    status?: { text: string; open?: () => void; undo?: () => void };
}

const STAT: [keyof EndStats, LocaleKey][] = [
    ["minutes", "reader_end_stat_minutes"],
    ["notes", "reader_end_stat_notes"],
    ["detours", "reader_end_stat_detours"],
    ["highlights", "reader_end_stat_highlights"],
    ["marginNotes", "reader_end_stat_margin_notes"],
];

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/**
 * **The end of a path** (#672). Facts about the reading — minutes, notes, detours, highlights and
 * margin notes — and what to do next: keep the path, export it, cultivate its thesis, or read it
 * again. Every action is explicit; the card itself writes nothing.
 */
export function renderEndCard(page: HTMLElement, card: EndCard, owner: Component): void {
    page.empty();
    const root = page.createDiv({ cls: c("reader-end") });
    root.createDiv({ cls: c("reader-count"), text: t("reader_end_kicker") });
    root.createEl("h1", { cls: c("reader-chapter-title"), text: card.title });
    root.createDiv({ cls: c("reader-end-lede"), text: t("reader_end_lede", card.kindLabel) });

    const stats = root.createDiv({ cls: c("reader-end-stats") });
    for (const [key, label] of STAT) {
        const value = card.stats[key];
        // Only facts there is something to say about: no "0 detours" scoreboard.
        if (key !== "minutes" && key !== "notes" && value === 0) continue;
        const cell = stats.createDiv({ cls: c("reader-end-stat") });
        cell.createDiv({ cls: c("reader-end-stat-value"), text: String(value) });
        cell.createDiv({ cls: c("reader-end-stat-label"), text: tCount(value, label) });
    }

    const grid = root.createDiv({ cls: c("reader-end-actions") });
    const action = (icon: string, name: string, desc: string, run: () => void, extraCls?: string) => {
        const button = grid.createEl("button", {
            cls: [c("reader-end-action"), ...(extraCls ? [c(extraCls)] : [])].join(" "),
            attr: { type: "button" },
        });
        setIcon(button.createSpan({ cls: c("reader-end-action-icon") }), icon);
        const text = button.createDiv({ cls: c("reader-end-action-text") });
        text.createDiv({ cls: c("reader-end-action-name"), text: name });
        text.createDiv({ cls: c("reader-end-action-desc"), text: desc });
        owner.registerDomEvent(button, "click", run);
        return button;
    };

    const saveButton = action(
        card.savedAs ? "bookmark-check" : "bookmark-plus",
        card.savedAs ? t("reader_end_saved", card.savedAs) : t("reader_end_save"),
        t("reader_end_save_desc"),
        () => openSaveForm()
    );
    action("file-output", t("reader_end_export"), t("reader_end_export_desc"), () => card.actions.exportDocument());
    action("sprout", t("reader_end_cultivate"), t("reader_end_cultivate_desc", noteName(card.thesis)), () => card.actions.cultivate());
    action("rotate-ccw", t("reader_end_again"), t("reader_end_again_desc"), () => card.actions.again());

    if (card.actions.another) {
        const another = root.createEl("button", { cls: c("reader-end-another"), attr: { type: "button" }, text: t("reader_end_another") });
        owner.registerDomEvent(another, "click", () => card.actions.another?.());
    }

    if (card.status) {
        const line = root.createDiv({ cls: c("reader-end-status"), attr: { role: "status" } });
        line.createSpan({ text: card.status.text });
        const link = (key: LocaleKey, run: () => void) => {
            const b = line.createEl("button", { cls: c("reader-end-status-link"), attr: { type: "button" }, text: t(key) });
            owner.registerDomEvent(b, "click", run);
        };
        if (card.status.open) link("reader_export_open", card.status.open);
        if (card.status.undo) link("changes_undo", card.status.undo);
    }

    /** Name the path in place: Enter or Save keeps it, Esc puts the form away. */
    function openSaveForm(): void {
        if (root.querySelector(`.${c("reader-end-save-form")}`)) return;
        const form = root.createDiv({ cls: c("reader-end-save-form") });
        saveButton.after(form);
        const input = form.createEl("input", {
            attr: { type: "text", "aria-label": t("reader_save_name_label"), value: card.savedAs ?? card.defaultName },
        });
        input.value = card.savedAs ?? card.defaultName;
        const keep = form.createEl("button", { cls: "mod-cta", attr: { type: "button" }, text: t("reader_save_confirm") });
        const cancel = form.createEl("button", { attr: { type: "button" }, text: t("reader_save_cancel") });
        const commit = async () => {
            const name = input.value.trim();
            if (!name) return;
            keep.disabled = true;
            await card.actions.save(name);
        };
        owner.registerDomEvent(keep, "click", () => void commit());
        owner.registerDomEvent(cancel, "click", () => form.remove());
        owner.registerDomEvent(input, "keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                void commit();
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                form.remove();
            }
        });
        input.focus();
        input.select();
    }
}
