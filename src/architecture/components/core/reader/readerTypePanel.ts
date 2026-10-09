import { setIcon, type Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { flightTransform, MOTION, motionWelcome } from "./readerMotion";
import { READER_FONTS, READER_LAYOUTS, READER_MARGINS, READER_SIZES, READER_SPACINGS, READER_THEMES, READER_WIDTHS, type ReaderPrefs } from "./readerPrefs";

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

const SPACING_KEY: Record<ReaderPrefs["spacing"], LocaleKey> = {
    tight: "reader_spacing_tight",
    normal: "reader_spacing_normal",
    airy: "reader_spacing_airy",
};
const WIDTH_KEY: Record<ReaderPrefs["width"], LocaleKey> = {
    narrow: "reader_width_narrow",
    medium: "reader_width_medium",
    wide: "reader_width_wide",
};
const MARGINS_KEY: Record<ReaderPrefs["margins"], LocaleKey> = {
    small: "reader_margins_small",
    medium: "reader_margins_medium",
    large: "reader_margins_large",
};

/** Page view's own rows (#767 FR-13): its framing, its zoom, its direction and the page's turn. */
export interface PageViewControls {
    /** *Fit width*, *Fit page*, or `null` at a level of its own. */
    fit: "width" | "page" | null;
    /** The zoom level, a share of *Fit width* (1 = 100 %). */
    level: number;
    across: boolean;
    /** Down · Across is a row of *Scroll* only. */
    scroll: boolean;
    onFit(fit: "width" | "page"): void;
    onZoom(dir: 1 | -1): void;
    onAcross(across: boolean): void;
    onRotate(): void;
}

/** What the panel says about the page, besides the choices (#757). */
export interface TypePanelContext {
    /** The name of the language the words are hyphenated in, said while *Justify* is on (FR-7). */
    hyphenatedAs?: string;
    /** A PDF in Page view: drawn as printed, so the rows shape only the reading view (the empty state). */
    pageView?: boolean;
    /** Page view's group, shown in Page view only — in Reading view none of it is (#767 FR-13). */
    pageRun?: PageViewControls;
}

const FIT_KEY: Record<"width" | "page", LocaleKey> = { width: "reader_pv_fit_width", page: "reader_pv_fit_page" };
const DIRECTION_KEY: Record<"down" | "across", LocaleKey> = { down: "reader_pv_down", across: "reader_pv_across" };

/** The zoom level as the bar and the panel say it: `150%`. */
export function zoomLabel(level: number): string {
    return t("reader_pv_zoom_level", String(Math.round(level * 100)));
}

/**
 * **Page view's group** (#767 FR-13), under Layout — whose *Scroll · Page · Spread* it reads, never a
 * second control: *Fit width · Fit page*, the zoom (−, the level, +), *Down · Across* in Scroll, and
 * *Rotate page*. Built from the same rows as the rest of the panel.
 */
function pageViewGroup(host: HTMLElement, controls: PageViewControls, scope: Component, before?: MarkerSnapshot): void {
    host.createDiv({ cls: c("reader-type-section"), text: t("reader_pv_group") });
    segmentedRow(
        host,
        { id: "pv-fit", label: "reader_pv_fit", options: ["width", "page"] as const, current: (controls.fit ?? "") as "width" | "page", key: (o) => FIT_KEY[o], onPick: (fit) => controls.onFit(fit) },
        scope,
        before
    );
    const row = host.createDiv({ cls: c("reader-type-row"), attr: { "data-zf-row": "pv-zoom" } });
    row.createDiv({ cls: c("reader-type-label"), text: t("reader_pv_zoom"), attr: { id: "zf-reader-type-pv-zoom" } });
    const group = row.createDiv({ cls: [c("reader-type-group"), c("reader-pv-zoom-row")], attr: { role: "group", "aria-labelledby": "zf-reader-type-pv-zoom" } });
    const step = (icon: string, key: LocaleKey, dir: 1 | -1) => {
        const button = group.createEl("button", { cls: [c("reader-type-option"), c("reader-pv-zoom-step")], attr: { type: "button", "aria-label": t(key) } });
        setIcon(button, icon);
        scope.registerDomEvent(button, "click", () => controls.onZoom(dir));
    };
    step("minus", "reader_pv_zoom_out", -1);
    group.createSpan({ cls: c("reader-pv-zoom-level"), text: zoomLabel(controls.level), attr: { "aria-live": "polite" } });
    step("plus", "reader_pv_zoom_in", 1);
    if (controls.scroll) {
        segmentedRow(
            host,
            {
                id: "pv-direction",
                label: "reader_pv_direction",
                options: ["down", "across"] as const,
                current: controls.across ? "across" : "down",
                key: (o) => DIRECTION_KEY[o],
                onPick: (direction) => controls.onAcross(direction === "across"),
            },
            scope,
            before
        );
    }
    const rotate = host.createDiv({ cls: c("reader-type-group") }).createEl("button", { cls: [c("reader-type-option"), c("reader-focus-toggle")], attr: { type: "button" } });
    setIcon(rotate.createSpan({ cls: c("reader-focus-icon") }), "rotate-cw");
    rotate.createSpan({ text: t("reader_pv_rotate") });
    scope.registerDomEvent(rotate, "click", () => controls.onRotate());
}

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
 * The whole panel, read top to bottom (#757 FR-10): **Layout** first (Scroll · Page · Spread, #753),
 * then the look, the face and the size, then the finer type — line spacing, width, margins, justify —
 * then focus mode and the time left. Every pick hands the next prefs to `onPick`.
 */
export function renderTypePanel(
    host: HTMLElement,
    prefs: ReaderPrefs,
    scope: Component,
    onPick: (next: ReaderPrefs) => void,
    before?: MarkerSnapshot,
    context: TypePanelContext = {}
): void {
    host.createDiv({ cls: c("reader-panel-title"), text: t("reader_type") });
    segmentedRow(host, { id: "layout", label: "reader_layout", options: READER_LAYOUTS, current: prefs.layout, key: (o) => LAYOUT_KEY[o], onPick: (layout) => onPick({ ...prefs, layout }) }, scope, before);
    // A paper in Page view: the layout above is read for its printed pages, and its own rows follow (#767).
    if (context.pageRun) pageViewGroup(host, context.pageRun, scope, before);
    segmentedRow(host, { id: "theme", label: "reader_type_theme", options: READER_THEMES, current: prefs.theme, key: (o) => THEME_KEY[o], onPick: (theme) => onPick({ ...prefs, theme }) }, scope, before);
    segmentedRow(host, { id: "font", label: "reader_type_font", options: READER_FONTS, current: prefs.font, key: (o) => FONT_KEY[o], onPick: (font) => onPick({ ...prefs, font }) }, scope, before);
    segmentedRow(host, { id: "size", label: "reader_type_size", options: READER_SIZES, current: prefs.size, key: (o) => SIZE_KEY[o], onPick: (size) => onPick({ ...prefs, size }) }, scope, before);
    // A PDF in Page view is drawn as printed: what follows shapes the reading view (the empty state).
    if (context.pageView) host.createDiv({ cls: c("reader-type-note"), text: t("reader_type_page_view_note") });
    segmentedRow(host, { id: "spacing", label: "reader_spacing", options: READER_SPACINGS, current: prefs.spacing, key: (o) => SPACING_KEY[o], onPick: (spacing) => onPick({ ...prefs, spacing }) }, scope, before);
    segmentedRow(host, { id: "width", label: "reader_width", options: READER_WIDTHS, current: prefs.width, key: (o) => WIDTH_KEY[o], onPick: (width) => onPick({ ...prefs, width }) }, scope, before);
    segmentedRow(host, { id: "margins", label: "reader_margins", options: READER_MARGINS, current: prefs.margins, key: (o) => MARGINS_KEY[o], onPick: (margins) => onPick({ ...prefs, margins }) }, scope, before);
    toggleRow(host, "align-justify", "reader_justify", prefs.justify, scope, () => onPick({ ...prefs, justify: !prefs.justify }));
    // Quietly, which language the words break by, so a wrong guess can be seen (FR-7).
    if (prefs.justify && context.hyphenatedAs) host.createDiv({ cls: c("reader-type-hint"), text: t("reader_hyphenated_as", context.hyphenatedAs) });
    toggleRow(host, "focus", "reader_focus", prefs.focus, scope, () => onPick({ ...prefs, focus: !prefs.focus }));
    toggleRow(host, "hourglass", "reader_time_left_toggle", prefs.timeLeft, scope, () => onPick({ ...prefs, timeLeft: !prefs.timeLeft }));
}
