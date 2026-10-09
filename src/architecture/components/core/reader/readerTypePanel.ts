import { setIcon, type Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { flightTransform, MOTION, motionWelcome } from "./readerMotion";
import { READER_FONTS, READER_LAYOUTS, READER_SIZES, READER_THEMES, type ReaderPrefs } from "./readerPrefs";

/**
 * **The Type panel** (#668, extracted in #753): how you set the page — its layout, face, size and
 * look — where you read. Every choice is one **segmented row**: a visible label, its answers, and a
 * marker under the current one that slides to the next when you pick (FR-14). #757 adds its finer
 * rows and #767 the PDF's Page view rows with the same `segmentedRow`; nobody builds a second control.
 */

type LocaleKey = Parameters<typeof t>[0];

interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** One answer of a row: its value and the words it is shown with. */
export interface SegmentedRow<T extends string> {
    /** Names the row across redraws, so its marker can slide from where it was. */
    id: string;
    label: LocaleKey;
    options: readonly T[];
    current: T;
    key: (option: T) => LocaleKey;
    onPick: (option: T) => void;
}

/** Where each row's marker was, read before the panel redraws: the start of its slide. */
export type MarkerSnapshot = Map<string, { value: string; box: Box }>;

const ROW_ATTR = "data-zf-row";
const VALUE_ATTR = "data-zf-value";

/** Literal maps, so the locale guardrail sees every key the panel draws. */
const LAYOUT_KEY: Record<ReaderPrefs["layout"], LocaleKey> = {
    scroll: "reader_layout_scroll",
    page: "reader_layout_page",
    spread: "reader_layout_spread",
};
const FONT_KEY: Record<ReaderPrefs["font"], LocaleKey> = { sans: "reader_font_sans", serif: "reader_font_serif" };
const SIZE_KEY: Record<ReaderPrefs["size"], LocaleKey> = {
    small: "reader_size_small",
    medium: "reader_size_medium",
    large: "reader_size_large",
};
const THEME_KEY: Record<ReaderPrefs["theme"], LocaleKey> = {
    auto: "reader_theme_auto",
    light: "reader_theme_light",
    sepia: "reader_theme_sepia",
    dark: "reader_theme_dark",
};

/** Read every row's marker before the panel is emptied. */
export function snapshotMarkers(host: HTMLElement): MarkerSnapshot {
    const snapshot: MarkerSnapshot = new Map();
    for (const marker of Array.from(host.querySelectorAll<HTMLElement>(`.${c("reader-type-marker")}`))) {
        const option = marker.parentElement;
        const row = option?.closest?.<HTMLElement>(`.${c("reader-type-row")}`);
        const id = row?.getAttribute(ROW_ATTR);
        const value = option?.getAttribute(VALUE_ATTR);
        if (!id || value === null || value === undefined) continue;
        const r = marker.getBoundingClientRect();
        snapshot.set(id, { value, box: { left: r.left, top: r.top, width: r.width, height: r.height } });
    }
    return snapshot;
}

/**
 * A row of answers with a label. The current answer wears Obsidian's `is-active` and the marker; when
 * `before` says another answer had it, the marker flies from that one's box to this one's — transform
 * only, `MOTION.fast`, and not at all under reduced motion.
 */
export function segmentedRow<T extends string>(host: HTMLElement, row: SegmentedRow<T>, scope: Component, before?: MarkerSnapshot): HTMLElement {
    const el = host.createDiv({ cls: c("reader-type-row"), attr: { [ROW_ATTR]: row.id } });
    const labelId = `zf-reader-type-${row.id}`;
    el.createDiv({ cls: c("reader-type-label"), text: t(row.label), attr: { id: labelId } });
    const group = el.createDiv({ cls: [c("reader-type-group"), c("reader-type-seg")], attr: { role: "group", "aria-labelledby": labelId } });
    for (const option of row.options) {
        const active = option === row.current;
        const button = group.createEl("button", {
            cls: [c("reader-type-option"), ...(active ? ["is-active"] : [])],
            attr: { type: "button", "aria-pressed": String(active), [VALUE_ATTR]: option },
            text: t(row.key(option)),
        });
        if (active) {
            const marker = button.createSpan({ cls: c("reader-type-marker"), attr: { "aria-hidden": "true" } });
            slideMarker(marker, before?.get(row.id), option);
        }
        scope.registerDomEvent(button, "click", () => row.onPick(option));
    }
    return el;
}

function slideMarker(marker: HTMLElement, was: { value: string; box: Box } | undefined, value: string): void {
    if (!was || was.value === value || !motionWelcome(marker)) return;
    const r = marker.getBoundingClientRect();
    const now: Box = { left: r.left, top: r.top, width: r.width, height: r.height };
    marker.animate([{ transform: flightTransform(now, was.box) }, { transform: "translate(0px, 0px) scale(1, 1)" }], {
        duration: MOTION.fast,
        easing: MOTION.ease,
    });
}

/** A switch kept with the type: focus mode, the time left. */
function toggleRow(host: HTMLElement, icon: string, key: LocaleKey, on: boolean, scope: Component, flip: () => void): void {
    const button = host.createDiv({ cls: c("reader-type-group") }).createEl("button", {
        cls: [c("reader-type-option"), c("reader-focus-toggle"), ...(on ? ["is-active"] : [])],
        attr: { type: "button", "aria-pressed": String(on) },
    });
    setIcon(button.createSpan({ cls: c("reader-focus-icon") }), icon);
    button.createSpan({ text: t(key) });
    scope.registerDomEvent(button, "click", flip);
}

/**
 * The whole panel: **Layout** first (Scroll · Page · Spread, #753), then the face, the size and the
 * look, then focus mode and the time left. Every pick hands the next prefs to `onPick`.
 */
export function renderTypePanel(host: HTMLElement, prefs: ReaderPrefs, scope: Component, onPick: (next: ReaderPrefs) => void, before?: MarkerSnapshot): void {
    host.createDiv({ cls: c("reader-panel-title"), text: t("reader_type") });
    segmentedRow(host, { id: "layout", label: "reader_layout", options: READER_LAYOUTS, current: prefs.layout, key: (o) => LAYOUT_KEY[o], onPick: (layout) => onPick({ ...prefs, layout }) }, scope, before);
    segmentedRow(host, { id: "font", label: "reader_type_font", options: READER_FONTS, current: prefs.font, key: (o) => FONT_KEY[o], onPick: (font) => onPick({ ...prefs, font }) }, scope, before);
    segmentedRow(host, { id: "size", label: "reader_type_size", options: READER_SIZES, current: prefs.size, key: (o) => SIZE_KEY[o], onPick: (size) => onPick({ ...prefs, size }) }, scope, before);
    segmentedRow(host, { id: "theme", label: "reader_type_theme", options: READER_THEMES, current: prefs.theme, key: (o) => THEME_KEY[o], onPick: (theme) => onPick({ ...prefs, theme }) }, scope, before);
    toggleRow(host, "focus", "reader_focus", prefs.focus, scope, () => onPick({ ...prefs, focus: !prefs.focus }));
    toggleRow(host, "hourglass", "reader_time_left_toggle", prefs.timeLeft, scope, () => onPick({ ...prefs, timeLeft: !prefs.timeLeft }));
}
