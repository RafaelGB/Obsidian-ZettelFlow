/**
 * What a rule is made of, picked from what the vault holds (#713, FR-9) — never typed. A cloud of
 * chips for tags, a list of property names, a checklist of a property's values; each with the
 * number of notes that carry it.
 */
import { setIcon } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import type { VocabularyEntry } from "architecture/knowledge/scope/scopeCensus";

/** Entries whose name contains the search, case-insensitively. */
export function filtered(entries: readonly VocabularyEntry[], search: string): VocabularyEntry[] {
    const needle = search.trim().toLowerCase().replace(/^#/, "");
    return needle ? entries.filter((entry) => entry.name.toLowerCase().includes(needle)) : [...entries];
}

/** A search box for a picker; it calls back on every keystroke without redrawing itself. */
export function searchBox(host: HTMLElement, placeholder: string, value: string, onInput: (value: string) => void): HTMLInputElement {
    const wrap = host.createDiv({ cls: c("scope-search") });
    setIcon(wrap.createSpan({ cls: c("scope-search-icon") }), "search");
    const input = wrap.createEl("input", {
        cls: c("scope-search-input"),
        attr: { type: "search", placeholder, "aria-label": placeholder, spellcheck: "false" },
    });
    input.value = value;
    input.addEventListener("input", () => onInput(input.value));
    return input;
}

/** Tags as chips with their counts; a picked chip is active. */
export function renderChipCloud(
    host: HTMLElement,
    entries: readonly VocabularyEntry[],
    picked: readonly string[],
    onToggle: (name: string) => void,
    label: (name: string) => string = (name) => `#${name}`
): void {
    host.empty();
    const cloud = host.createDiv({ cls: c("scope-cloud") });
    for (const entry of entries) {
        const on = picked.includes(entry.name);
        const chip = cloud.createEl("button", {
            cls: [c("scope-pick"), ...(on ? ["is-active"] : [])],
            attr: { type: "button", "aria-pressed": String(on) },
        });
        if (on) setIcon(chip.createSpan({ cls: c("scope-pick-check") }), "check");
        chip.createSpan({ cls: c("scope-pick-name"), text: label(entry.name) });
        chip.createSpan({ cls: c("scope-pick-count"), text: entry.count.toLocaleString() });
        chip.addEventListener("click", () => onToggle(entry.name));
    }
}

/** Property names to choose from, each saying how many notes carry it. */
export function renderNameList(host: HTMLElement, entries: readonly VocabularyEntry[], onPick: (name: string) => void): void {
    host.empty();
    const list = host.createDiv({ cls: c("scope-names") });
    for (const entry of entries) {
        const row = list.createEl("button", { cls: c("scope-name"), attr: { type: "button" } });
        row.createSpan({ cls: c("scope-name-label"), text: entry.name });
        row.createSpan({
            cls: c("scope-name-count"),
            text: tCount(entry.count, "settings_scope_property_in", entry.count.toLocaleString()),
        });
        row.addEventListener("click", () => onPick(entry.name));
    }
}

/** A property's values as a checklist: tick what the rule matches. There is no box to type into. */
export function renderChecklist(
    host: HTMLElement,
    entries: readonly VocabularyEntry[],
    picked: readonly string[],
    onToggle: (value: string) => void
): void {
    host.empty();
    host.createDiv({ cls: c("scope-subheading"), text: t("settings_scope_values_heading") });
    const list = host.createDiv({ cls: c("scope-checklist") });
    for (const entry of entries) {
        const on = picked.includes(entry.name);
        const row = list.createEl("label", { cls: [c("scope-check"), ...(on ? ["is-active"] : [])] });
        const box = row.createEl("input", { cls: "task-list-item-checkbox", attr: { type: "checkbox" } });
        box.checked = on;
        box.addEventListener("change", () => onToggle(entry.name));
        row.createSpan({ cls: c("scope-check-name"), text: entry.name });
        row.createSpan({ cls: c("scope-check-count"), text: entry.count.toLocaleString() });
    }
    host.createDiv({ cls: c("scope-hint"), text: t("settings_scope_values_hint") });
}
