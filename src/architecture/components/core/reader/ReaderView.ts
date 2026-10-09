import {
    Component,
    ItemView,
    Keymap,
    MarkdownRenderer,
    Platform,
    Scope,
    TFile,
    getLanguage,
    setIcon,
    type Modifier,
    type ViewStateResult,
    type WorkspaceLeaf,
} from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import { buildEvidenceMap, type ChapterRole, type ReadingPath } from "architecture/knowledge/state";
import { READER_VIEW, parseReaderState, type ReaderBack, type ReaderKind } from "./readerContract";
import { pathFor } from "./readerPaths";
import { isNoteLink, noteExcerpt, ReaderTrail, type TrailReason } from "./readerJumps";
import { addBookmark, bookmarkAt, bookmarkSnippet, inReadingOrder, landingOffset, removeBookmarks, wordStart, type Bookmark } from "./readerBookmarks";
import { markHereAt } from "./readerHere";
import { relativeLabel } from "architecture/components/core/noteCompanion/storyFormat";
import { MOTION, motionWelcome } from "./readerMotion";
import { beginCloseShot, landOpenShot, shotIncoming } from "./readerShot";
import { adoptChapterScrub, beginChapterScrub, endChapterTurn, playChapterTurn, type ChapterScrub } from "./readerTurn";
import { canFullscreen, isApple, panelShape, tooLarge, touchPointer } from "./readerDevice";
import { escapeStep, isReadingKey, movedEnough } from "./readerDeep";
import { completionRate, edgeZone, isThing, releaseTurn, rubberBand, startGesture, twoFingerBack, type Gesture, SYSTEM_EDGE_PX } from "./readerGestures";
import { placeAt, scrollFor, type Box as PlaceBox, type Place } from "./readerPlace";
import { dragSheet, settleDuration, settleSheet, sheetSnaps, type SheetSnaps } from "./readerSheet";
import { sourceFormat } from "application/library/sourceMeta";
import { readingMotion } from "./readingMotion";
import { matchesIn, searchBook, type SearchResult } from "./readerSearch";
import { chapterText, offsetAt, pointAt, readableText, readableWithMap, unwrapMark, wrapSpan, type NodeLike } from "./readerMarks";
import { stripFrontmatter } from "./readerDocument";
import { KIND_KEY } from "./readerLabels";
import { renderEndCard, renderSourceEnd, type EndCard } from "./readerEnd";
import { ReadingExportModal, type ExportResult } from "./readerExport";
import { normalizeSaved, saveReading, savedId } from "./readerSaved";
import { readFrom } from "./readingChooser";
import { undoBatch } from "architecture/plugin/writes/undoNotice";
import { activateSurface } from "architecture/plugin/services/ViewActivation";
import { normalizeResume, readingKey, recordResume } from "./readerResume";
import type { ReaderHost } from "./readerHost";
import { adoptHeldSides, coverApp, deepCover, exitReader, heldSides, restoreWorkspace } from "./openReader";
import { addToReading, placeInPath, plainExcerpt, popDetour, pushDetour } from "./readerDetours";
import { hoverPreview } from "architecture/components/core/a11y";
import { ReaderHighlights, type HighlightDeps } from "./readerHighlights";
import {
    chapterOfHighlight,
    keptPageView,
    keptScroll,
    rememberPageView,
    rememberSourceBookmarks,
    rememberSourceFacts,
    rememberSourcePlace,
    rememberSourceScroll,
    sourceBookmarks,
    sourceMetaOf,
    sourceReading,
} from "./readerSource";
import { resumeScroll } from "application/library/sourceMeta";
import { openSourceDocument, type SourceDocument, type SourceView } from "architecture/components/core/library/sources/sourceDocument";
import { openLibrary } from "architecture/components/core/library/openLibrary";
import { END_OF_CHAPTER, bookMinutesLeft, learnPace, minutesFor, minutesLeft, normalizePace, paceWpm, readFraction, scrolls, splitMinutes, wordCount, type Pace } from "./readerPace";
import { normalizeReaderPrefs, readerClassNames, type ReaderLayout, type ReaderPrefs } from "./readerPrefs";
import { ReaderPager, stageScale, type Landing, type PageAnchor } from "./readerPager";
import { dragDirection, edgeTurn, keyIntent, type BookDirection, type KeyIntent } from "./readerPages";
import { LAYOUT_SETTLE, settleAround, TYPE_SETTLE } from "./readerSettle";
import { languageName, readingLanguage } from "./readerLanguage";
import { pageShape } from "./readerPages";
import { renderTypePanel, snapshotMarkers, zoomLabel } from "./readerTypePanel";
import { PdfPageRun } from "./readerPageRun";
import { renderThumbs, type Thumbs } from "./readerThumbs";
import { fly } from "./readerMotion";

type LocaleKey = Parameters<typeof t>[0];

/** The bar fades after this long without a pointer move or a key. */
const IDLE_MS = 2000;

/** A source longer than this reads without the chapter dots: three hundred pages are not dots. */
const DOTS_LIMIT = 40;

/** The leaving fade (`reader--leaving` in reader.scss); the workspace comes back when it ends. */
const EXIT_MS = 220;
/** How long the way back from a jump stays on screen before it fades (#718); Alt+← keeps working. */
const JUMP_PILL_MS = 8000;
/** Where your reading pace is kept — Obsidian's per-device local storage, never synced (#722). */
const PACE_STORAGE_KEY = "zettelflow-reader-pace";
/** How long after you stop scrolling the place inside a chapter is kept. */
const SCROLL_SAVE_MS = 800;
/** A second landing on a resumed chapter, once its pictures have moved the page. */
const RESUME_SETTLE_MS = 600;
/** A pause in typing before the book is searched (#719). */
const SEARCH_DEBOUNCE_MS = 150;
/** Results listed under the search bar; the bar counts them all. */
const SEARCH_LIST_LIMIT = 60;

/**
 * The keys, as the shortcuts sheet lists them. A cap is a locale key (a word: Space, Esc) or the
 * literal glyph on the key (→, H, ?). The turning keys say what they do in the layout you read in
 * (#753 FR-11): in pages → and Space are the next page, then the next chapter — ← in a book that
 * reads right to left.
 */
function shortcutsFor(layout: ReaderLayout, direction: BookDirection, pageRun = false): { keys: string[]; label: LocaleKey }[] {
    const turning: { keys: string[]; label: LocaleKey }[] =
        layout === "scroll"
            ? [
                  { keys: ["→"], label: "reader_key_next" },
                  { keys: ["←"], label: "reader_key_previous" },
                  { keys: ["reader_kbd_space"], label: "reader_key_page" },
                  { keys: ["reader_kbd_shift", "reader_kbd_space"], label: "reader_key_page_back" },
              ]
            : [
                  { keys: [direction === "rtl" ? "←" : "→"], label: "reader_key_page_next" },
                  { keys: [direction === "rtl" ? "→" : "←"], label: "reader_key_page_previous" },
                  { keys: ["reader_kbd_space"], label: "reader_key_page_next" },
                  { keys: ["reader_kbd_shift", "reader_kbd_space"], label: "reader_key_page_previous" },
              ];
    // Page view zooms (#767 FR-16): Ctrl/⌘ with + − 0, which Obsidian's own app zoom gives way to here.
    const zoom: { keys: string[]; label: LocaleKey }[] = pageRun ? [{ keys: ["reader_kbd_ctrl", "+", "−", "0"], label: "reader_key_zoom" }] : [];
    return [...turning, ...zoom, ...SHORTCUTS];
}

const SHORTCUTS: { keys: string[]; label: LocaleKey }[] = [
    { keys: ["reader_kbd_home", "reader_kbd_end"], label: "reader_key_ends" },
    { keys: ["H"], label: "reader_key_highlight" },
    { keys: ["1–4"], label: "reader_key_meaning" },
    { keys: ["reader_kbd_shift", "H"], label: "reader_key_note" },
    { keys: ["B"], label: "reader_key_bookmark" },
    { keys: ["F"], label: "reader_key_deep" },
    { keys: ["V"], label: "reader_key_layout" },
    { keys: ["reader_kbd_ctrl", "F"], label: "reader_key_search" },
    { keys: ["reader_kbd_alt", "←"], label: "reader_key_back" },
    { keys: ["?"], label: "reader_key_help" },
    { keys: ["reader_kbd_esc"], label: "reader_key_exit" },
];

/** Literal map, so the locale guardrail sees every key cap the sheet draws. */
const KBD_KEY: Record<string, LocaleKey> = {
    reader_kbd_space: "reader_kbd_space",
    reader_kbd_shift: "reader_kbd_shift",
    reader_kbd_home: "reader_kbd_home",
    reader_kbd_end: "reader_kbd_end",
    reader_kbd_esc: "reader_kbd_esc",
    reader_kbd_ctrl: "reader_kbd_ctrl",
    reader_kbd_alt: "reader_kbd_alt",
};

/** On a Mac or an iPad the key caps are the glyphs on the keys themselves (FR-12). */
const APPLE_CAPS: Record<string, string> = { reader_kbd_ctrl: "⌘", reader_kbd_alt: "⌥" };

/** A key cap as this device's keyboard prints it: ⌘ and ⌥ on Apple, Ctrl and Alt elsewhere. */
function kbdCap(key: string): string {
    if (isApple() && APPLE_CAPS[key]) return APPLE_CAPS[key];
    return KBD_KEY[key] ? t(KBD_KEY[key]) : key;
}

/** How long a tap's synthetic click is waited for, to be swallowed (#750): a tap is not also a click. */
const TAP_CLICK_MS = 600;
/** The page springs back from the end of the book in the shared beat (FR-18). */
const SPRING_MS = MOTION.base;
/** A finger's place is noted a moment after the scroll stops, for a rotation to keep (FR-11). */
const PLACE_SAVE_MS = 150;

/** Whether a key went to something you type in — a margin note, a save name — and is not ours. */
function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable === true;
}

const ROLE_KEY: Record<ChapterRole, LocaleKey> = {
    thesis: "reader_role_thesis",
    support: "reader_role_support",
    counter: "reader_role_counter",
    synthesis: "reader_role_synthesis",
    context: "reader_role_context",
};

export type { ReaderHost };


type Panel = "contents" | "type" | "context" | null;

/** The Contents panel of a book or a paper (#761 FR-4): its contents, its bookmarks, where you've been. */
type ContentsTab = "contents" | "pages" | "bookmarks" | "trail";
const CONTENTS_TABS: { id: ContentsTab; label: LocaleKey }[] = [
    { id: "contents", label: "reader_contents" },
    // A paper in Page view (#767 FR-10): its pages, at a glance.
    { id: "pages", label: "reader_pages_tab" },
    { id: "bookmarks", label: "reader_tab_bookmarks" },
    { id: "trail", label: "reader_tab_trail" },
];

/** Two taps this close in time are a double tap in Page view (#767 FR-2); a single one waits as long. */
const DOUBLE_TAP_MS = 280;
/** …and this close on the page. */
const DOUBLE_TAP_PX = 32;
/** The place in a paper scrolled in Page view is kept a moment after the page most on screen changes. */
const RUN_PLACE_MS = 400;

/** What took you away, as *Where you've been* says it (FR-7). */
const TRAIL_KEY: Record<TrailReason, LocaleKey> = {
    link: "reader_trail_link",
    contents: "reader_trail_contents",
    search: "reader_trail_search",
    note: "reader_trail_note",
    bookmark: "reader_trail_bookmark",
    passage: "reader_trail_passage",
};

/** How far a list slides in when its tab is chosen (FR-16). */
const TAB_SLIDE_PX = 24;
/** A bookmark made less than a minute ago was made *now*. */
const NOW_MS = 60_000;

/**
 * A place in a book (#761): its chapter, where its first line on screen is in the chapter's text,
 * and — where the text cannot be read — how far through the chapter it is and its scroll.
 */
interface Spot {
    chapter: number;
    /** An offset into `chapterText` of the chapter, or `null` where it has no text. */
    offset: number | null;
    share: number | null;
    top: number | null;
    /** A bookmark is found again by its words, in the chapter as it is drawn now (FR-3). */
    bookmark?: Bookmark;
}

/** A place on the trail, with what took you away from it (FR-6, FR-7). */
interface TrailEntry extends Spot {
    label: string;
    reason: TrailReason;
}

/** A finger or a pen on the page (#750): the gesture, the stage where it began, and what it drives. */
interface TouchState {
    gesture: Gesture;
    stage: { left: number; top: number; width: number; height: number };
    /** The way the turn goes once the swipe has locked: 1 forward (swipe left), -1 back. */
    dir: 1 | -1 | 0;
    /** The chapter's turn, held under the finger. */
    scrub: ChapterScrub | null;
    /** The page resisting at an end of the book. */
    rubber: boolean;
    /** In pages (#753): the strip itself is under the finger, a page — not a chapter — at a time. */
    paging: boolean;
    /** A frame is already asked for. */
    frame: boolean;
}

/** A note's body without its frontmatter: the properties are not part of what you read. */
export const readableBody = stripFrontmatter;

function noteName(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/**
 * **The Reader** (#668, epic #667) — read a path across your notes, the way you read a book.
 *
 * Its own view, opened in the main area while the sidebars fold away (see `openReader`), and closed
 * with the workspace given back. A chapter is a note rendered by Obsidian's own Markdown renderer,
 * so embeds, callouts and the theme behave as they do everywhere else.
 *
 * **It writes no note.** Reading is the whole job; a structural test holds the line.
 */
export class ReaderView extends ItemView {
    private path: ReadingPath | null = null;
    /** How the reading was chosen, and a picked set's order — what the view state keeps. */
    private kind: ReaderKind = "around";
    private paths: string[] | undefined;
    private index = 0;
    private prefs: ReaderPrefs;
    private panel: Panel = null;
    private root: HTMLElement | null = null;
    private els: {
        title: HTMLElement;
        page: HTMLElement;
        dots: HTMLElement;
        label: HTMLElement;
        progress: HTMLProgressElement;
        panel: HTMLElement;
        stage: HTMLElement;
        margin: HTMLElement;
        hairline: HTMLElement;
        minutes: HTMLElement;
        /** Page view ↔ reading view, shown for a PDF that has text (#681). */
        view: HTMLElement;
        /** Search inside the book (#719), shown for a book or a paper. */
        search: HTMLElement;
        /** Page view's zoom level, beside the Page view button (#767 FR-13): a click is *Fit width*. */
        zoom: HTMLElement;
    } | null = null;
    /** Words in the chapter on screen, for the minutes left. */
    private chapterWords = 0;
    /** Your reading pace, learned on this device only (#722). */
    private pace: Pace | null = null;
    /** When the chapter on screen opened, and whether you reached its end: one sample of your pace. */
    private chapterOpenedAt = Date.now();
    private reachedEnd = false;
    /** Words of the chapters drawn in this reading, for the time left in the book. */
    private readonly seenWords = new Map<number, number>();
    /** The end-of-chapter card: the next chapter's name and length, lit when you reach it. */
    private nextCard: HTMLElement | null = null;
    /** Which way the next page turns: forward, back, or 0 for a reading that just opened. */
    private turn: 1 | -1 | 0 = 0;
    /** The leaving fade is playing; a second Esc or × does not start another. */
    private leaving = false;
    /** Opened from the Library in its leaf (#733): the shelf to give the leaf back to. Never cleared. */
    private back: ReaderBack | null = null;
    /** The keyboard shortcuts sheet, while it is open. */
    private shortcuts: HTMLElement | null = null;
    /** Highlights and margin notes (#671): drawn over each chapter, kept as thoughts in Think. */
    private highlights: ReaderHighlights | null = null;
    /** A highlight a deep link asked to land on — consumed by the next chapter that holds it. */
    private pendingHighlight: string | null = null;
    /** The listeners and renders of the chapter on screen; replaced with it. */
    private chapter: Component | null = null;
    /** The listeners of the dots and the rest of one render — dropped with the next (#667 audit). */
    private renderScope: Component | null = null;
    /** The listeners of the open panel's rows, replaced when it redraws. */
    private panelScope: Component | null = null;
    /** The listeners of the open peek, gone with it. */
    private peekScope: Component | null = null;
    /**
     * A restored reading that waits for the index (#667 audit): before layout-ready the model is
     * empty, so its path would be the seed alone and its place would be lost. Kept until it can be read.
     */
    private pending: { seed: string; chapter: number } | null = null;
    private idleTimer: number | undefined;
    /** Deep reading (#764): the page and nothing else. Never saved — each reading opens without it (FR-8). */
    private deep = false;
    /** Whether deep reading put the window in fullscreen, so leaving gives back only what it took (FR-6). */
    private deepFullscreen = false;
    /** The document whose fullscreen changes are watched — once per document. */
    private deepWatched: Document | null = null;
    /** Where the pointer last woke the chrome in deep reading: a jitter from here wakes nothing (FR-3). */
    private deepPointer: { x: number; y: number } | null = null;
    /** The last pointer on the page, so the hint speaks to a finger or to a mouse (FR-7). */
    private lastPointerType: string | null = null;
    private deepHint: HTMLElement | null = null;
    private deepButton: HTMLElement | null = null;
    private deepTimer: number | undefined;
    /** The column travelling with the cover (#764 FR-10): one animation at a time. */
    private deepTravel: Animation | null = null;
    private deepHintTimer: number | undefined;
    /** Bumped on every chapter change, so a slow read never draws over a newer chapter. */
    private generation = 0;
    /**
     * Notes read as detours from the chapter, deepest last (#670). Session only: a reload returns
     * you to the chapter, which is where the reading is.
     */
    private detours: string[] = [];
    /** Chapters you have been on in this reading, for the contents' ticks. */
    private readonly visited = new Set<string>();
    /** The open peek, if any — drawn inline under the block holding the link. */
    private peek: HTMLElement | null = null;
    /** Bumped on every peek, so a slow excerpt never lands in a newer one. */
    private peekGeneration = 0;
    private pill: HTMLElement | null = null;
    /**
     * Where you've been in a book (#718, #761): the place before each jump, and why you left it. One
     * trail for the pill, Alt+←, a two-finger swipe and the *Where you've been* list.
     */
    private readonly trail = new ReaderTrail<TrailEntry>();
    /** The jump pill goes away by itself; the way back stays on Alt+← and in the list. */
    private jumpPillTimer: number | undefined;
    private jumpPillShown = false;
    /** A place to land on once the chapter it is in is drawn (#761). */
    private pendingLanding: Spot | null = null;
    /** The Contents panel's tab, and the way its list slides in when it changes (FR-16). */
    private contentsTab: ContentsTab = "contents";
    private tabSlide: 1 | -1 | 0 = 0;
    /** The bookmark ribbon at the page's corner (#761 FR-1). */
    private ribbon: HTMLElement | null = null;
    private ribbonLifting = false;
    /** This search already left its mark on the trail: stepping through its hits is one detour. */
    private searchLeft = false;
    /** Fingers on the page (#761 FR-10): two swiping right go back one step along the trail. */
    private readonly fingers = new Map<number, { x0: number; y0: number; x: number; y: number }>();
    private twoFinger: { dx: number; dy: number }[] | null = null;
    /** When the chapter turn now playing lands: a mark waits for it. */
    private turnLandsAt = 0;
    /** How far into the chapter a resume lands, once it is drawn (a share of it, 0–1). */
    private pendingShare: number | null = null;
    private scrollSaveTimer: number | undefined;
    /** The footnote read in place (#718), and its listeners. */
    private notePop: HTMLElement | null = null;
    private notePopScope: Component | null = null;
    /** Search inside the book (#719): the bar, the book's text read once, and the results. */
    private searchEl: HTMLElement | null = null;
    private searchInput: HTMLInputElement | null = null;
    private searchCount: HTMLElement | null = null;
    private searchList: HTMLElement | null = null;
    private searchScope: Component | null = null;
    private searchTexts: string[] | null = null;
    private searchBuilding: Promise<string[] | null> | null = null;
    private searchResult: SearchResult | null = null;
    private searchAt = -1;
    private searchMarks: HTMLElement[] = [];
    /** Equations and drawings a match is in (#770): tinted whole, since no mark goes inside one. */
    private searchTints: HTMLElement[] = [];
    /** The current match is brought into view: a travel in the chapter on screen, or landed in a new one. */
    private searchReveal: "travel" | "land" | null = null;
    private searchTimer: number | undefined;
    /** The reading is over and its end card is on screen (#672). */
    private ended = false;
    /** When this reading began, for the end card's minutes. */
    private startedAt = Date.now();
    /** Detours taken in this reading — counted, never kept. */
    private detourCount = 0;
    /** A saved reading's name, or the name it was just saved under (#672). */
    private name: string | undefined;
    private savedId: string | undefined;
    /** The last export's outcome, with its Open and Undo, while the end card is up. */
    private endStatus: EndCard["status"];
    /**
     * A PDF or an EPUB being read (#681, #682): its chapters are its pages or spine items. The path
     * is known at once; the document once it has been opened.
     */
    private sourcePath: string | null = null;
    private source: SourceDocument | null = null;
    private sourceFailed = false;
    private sourceView: SourceView = "reading";
    /** The language the chapter on screen declares (#757), or `null` when it keeps Obsidian's. */
    private pageLanguage: string | null = null;
    /** Bumped on every source opened, so a slow open never lands in a newer reading. */
    private sourceGeneration = 0;
    /** A source too large for this device (#750 FR-13): not opened, and the page says so. */
    private sourceTooLarge = false;
    /**
     * A finger or a pen on the page (#750): the gesture being decided, where the stage was when it
     * began, and what it drives — a turn held under the finger, or the page resisting at an end.
     */
    private touch: TouchState | null = null;
    /** Until then, the click a tap leaves behind is the tap's, and swallowed. */
    private swallowClickUntil = 0;
    /** The line you were reading, as a block and a share of it — kept for a rotation (FR-11). */
    private place: Place | null = null;
    private placeTimer: number | undefined;
    /** The reading's size, last seen by the resize observer. */
    private shape = { width: 0, height: 0 };
    /** The panel as a bottom sheet (#750 D5): its height from the bottom, and the dim behind it. */
    private sheet: { height: number; snaps: SheetSnaps } | null = null;
    private scrim: HTMLElement | null = null;
    /**
     * The chapter in pages (#753): *Page* or *Spread*. Built with the shell; in *Scroll* it does
     * nothing, and the stage scrolls as it always has.
     */
    private pager: ReaderPager | null = null;
    /** Where the next chapter drawn in pages lands: its first page, or — turned back into — its last. */
    private landing: "start" | "end" = "start";
    /** A chapter is being drawn: a place asked for now is landed on once its pages are laid out. */
    private pagesPending = false;
    private pendingReveal: PageAnchor | null = null;
    /**
     * A paper in Page view (#767): its run of printed pages, kept across the chapter's redraws so its
     * pictures are not drawn twice. Let go when Page view is.
     */
    private pageRun: PdfPageRun | null = null;
    /** The *Pages* tab's thumbnails, while it is open. */
    private thumbs: Thumbs | null = null;
    /** A tap waiting to see whether a second makes it a double tap (Page view only). */
    private lastTap: { at: number; x: number; y: number } | null = null;
    private tapTimer: number | undefined;
    private runPlaceTimer: number | undefined;
    /** The highlights of the page most on screen, drawn again when it changes in Scroll. */
    private runHighlightScope: Component | null = null;
    /** The next `show` is a thumbnail's flight, not a turn. */
    private flight = false;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin?: ReaderHost,
        /** Seams for tests: the thought store, the selection, the mark factory. */
        private readonly highlightDeps: HighlightDeps = {}
    ) {
        super(leaf);
        this.prefs = normalizeReaderPrefs(plugin?.settings?.readerPrefs);
        this.pace = normalizePace(this.app?.loadLocalStorage?.(PACE_STORAGE_KEY));
        // Obsidian's way (#667): the active leaf's scope gets the keys, wherever focus is, and only
        // the keys it registers — Ctrl/Cmd/Alt combinations fall through to the app's hotkeys.
        this.scope = new Scope(this.app?.scope);
        this.registerKeys(this.scope);
    }

    /** A literal: `ItemView` calls this from its own constructor, before any field exists (#278). */
    getViewType(): string {
        return "zettelflow-reader";
    }

    getDisplayText(): string {
        if (this.sourcePath) return `${t("reader_title")} · ${this.source?.title ?? noteName(this.sourcePath)}`;
        return this.path ? `${t("reader_title")} · ${noteName(this.path.seed)}` : t("reader_title");
    }

    getIcon(): string {
        return "book-open";
    }

    getState(): Record<string, unknown> {
        const base = super.getState();
        const sides = heldSides();
        if (this.sourcePath) {
            return {
                ...base,
                source: this.sourcePath,
                chapter: this.index,
                ...(this.sourceView === "page" ? { layout: "page" } : {}),
                ...(sides ? { restore: sides } : {}),
                ...(this.back ? { back: this.back } : {}),
            };
        }
        return {
            ...base,
            ...(this.pending
                ? { seed: this.pending.seed, chapter: this.pending.chapter }
                : this.path
                  ? { seed: this.path.seed, chapter: this.index }
                  : {}),
            ...(this.path && this.kind !== "around" ? { kind: this.kind } : {}),
            ...(this.paths ? { paths: this.paths } : {}),
            ...(this.name ? { name: this.name } : {}),
            ...(sides ? { restore: sides } : {}),
            ...(this.back ? { back: this.back } : {}),
        };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const parsed = parseReaderState(state);
        if (parsed.restore) adoptHeldSides(parsed.restore);
        // Kept when another note is read in the same leaf: the leaf is still the Library's.
        if (parsed.back) this.back = parsed.back;
        if (parsed.highlight) this.pendingHighlight = parsed.highlight;
        if (parsed.source) {
            // A passage opened from Think or *This note* while the book is open is a jump (#761 FR-6):
            // where you were is kept first, and the camera moves there — never a fresh draw.
            const passage = Boolean(parsed.highlight) && parsed.source === this.sourcePath && Boolean(this.source) && this.leaveTrail("passage");
            const before = this.index;
            await this.readSource(parsed.source, parsed.chapter ?? 0, parsed.layout === "page" ? "page" : "reading", parsed.highlight);
            if (!this.els) return;
            if (passage && this.index === before && parsed.highlight && this.highlights?.reveal(parsed.highlight, true)) {
                this.pendingHighlight = null;
                return;
            }
            // In another chapter: the chapter turns towards it, the way it turns today (#735).
            if (passage && this.index !== before) this.turn = this.index > before ? 1 : -1;
            this.render();
            return;
        }
        if (parsed.seed && this.sourcePath) this.leaveSource();
        if (parsed.seed) {
            // A new reading: its own clock, counts and end.
            if (parsed.seed !== this.path?.seed || (parsed.kind ?? "around") !== this.kind) {
                this.startedAt = Date.now();
                this.detourCount = 0;
                this.visited.clear();
            this.seenWords.clear();
            this.chapterOpenedAt = Date.now();
            this.reachedEnd = false;
                this.savedId = undefined;
                this.endStatus = undefined;
            }
            this.ended = false;
            // Whatever was on screen belongs to the previous reading: its detour and its peek too.
            this.detours = [];
            this.closePeek();
            this.name = parsed.name;
            this.kind = parsed.kind ?? "around";
            this.paths = parsed.kind === "selection" ? parsed.paths : undefined;
            this.path = pathFor(this.app, parsed.seed, this.kind, this.paths);
            const chapter = parsed.chapter ?? 0;
            if (this.kind !== "selection" && KnowledgeIndex.getInstance().status !== "ready") {
                // Restored before the index is built: keep the place, read it once the model is there.
                this.pending = { seed: parsed.seed, chapter };
                this.index = 0;
            } else {
                this.pending = null;
                this.index = Math.max(0, Math.min(chapter, this.path.chapters.length - 1));
            }
        }
        if (this.els) this.render();
    }

    /**
     * Read a PDF or an EPUB (#681, #682). The reading is the source; its place is kept by the
     * Library. A highlight a deep link names is landed on, whichever page it is on.
     */
    private async readSource(path: string, chapter: number, view: SourceView, highlight?: string): Promise<void> {
        const fresh = path !== this.sourcePath;
        if (fresh) {
            this.leaveSource();
            this.startedAt = Date.now();
            this.detourCount = 0;
            this.visited.clear();
            this.savedId = undefined;
            this.endStatus = undefined;
            this.sourcePath = path;
            // A new reading: its own trail (FR-9), and Contents opens on its contents.
            this.trail.clear();
            this.jumpPillShown = false;
            this.pendingLanding = null;
            this.contentsTab = "contents";
            this.searchLeft = false;
            // Back where you were inside the chapter, not at its top — unless a highlight was asked for.
            this.pendingShare = highlight ? null : keptScroll(this.plugin, path, chapter);
        }
        this.ended = false;
        this.detours = [];
        this.closePeek();
        this.pending = null;
        this.name = undefined;
        this.kind = "around";
        this.paths = undefined;
        this.sourceView = view;
        this.index = Math.max(0, chapter);
        if (!this.source) {
            // Something to show at once: the source, opening.
            this.path = { seed: path, kind: "selection", chapters: [{ path, role: "context" }] };
            // A source past what this device can hold is not attempted — not even read (FR-13).
            const file = this.app.vault.getAbstractFileByPath(path);
            const format = sourceFormat(path);
            const size = file instanceof TFile ? file.stat?.size : undefined;
            if (format && tooLarge(size, format)) {
                log.info(`[Reader] ${path} is too large to open on this device (${size} bytes)`);
                this.sourceTooLarge = true;
                return;
            }
            this.sourceTooLarge = false;
            const generation = ++this.sourceGeneration;
            try {
                const doc = await openSourceDocument(this.app, path, sourceMetaOf(this.plugin, path)?.imageOnly);
                if (generation !== this.sourceGeneration || this.sourcePath !== path) {
                    doc.close();
                    return;
                }
                this.source = doc;
                this.sourceFailed = false;
                this.path = sourceReading(doc);
                rememberSourceFacts(this.app, this.plugin, doc);
            } catch (error) {
                log.error(`[Reader] could not open ${path}: ${error instanceof Error ? error.message : String(error)}`);
                this.sourceFailed = true;
            }
        }
        if (highlight) {
            const at = await chapterOfHighlight(path, highlight, this.highlightDeps.store);
            if (at !== null) this.index = at;
        }
        this.index = Math.max(0, Math.min(this.index, (this.path?.chapters.length ?? 1) - 1));
    }

    /** Close the source being read, before another reading takes its place. */
    private leaveSource(): void {
        this.closeSearch();
        this.searchTexts = null;
        this.searchBuilding = null;
        this.sourceGeneration++;
        this.source?.close();
        this.source = null;
        this.sourcePath = null;
        this.sourceFailed = false;
        this.sourceTooLarge = false;
        this.sourceView = "reading";
        this.dropRun();
    }

    /** Page view ↔ reading view, for a PDF (#681). The place is kept. */
    private toggleView(): void {
        if (!this.source?.hasPageView) return;
        this.sourceView = this.sourceView === "page" ? "reading" : "page";
        this.app.workspace.requestSaveLayout();
        this.render();
    }

    /** Read a reading that waited for the index, now that the model can say what its path is. */
    private resolvePending(): void {
        const pending = this.pending;
        if (!pending || KnowledgeIndex.getInstance().status !== "ready") return;
        this.pending = null;
        this.path = pathFor(this.app, pending.seed, this.kind, this.paths);
        this.index = Math.max(0, Math.min(pending.chapter, this.path.chapters.length - 1));
        if (this.els) this.render();
    }

    /**
     * Obsidian focuses a leaf by asking it for focus here — reused or restored, the reader must
     * take the keys itself, or ← → Space and Esc reach nothing until you click the page.
     */
    setEphemeralState(state: unknown): void {
        super.setEphemeralState(state);
        if ((state as { focus?: boolean } | null)?.focus) this.contentEl.focus({ preventScroll: true });
    }

    async onOpen(): Promise<void> {
        this.buildShell();
        // The end of a shot from the Library (#734): out of sight until the page lands on the column.
        if (this.root && shotIncoming()) {
            const root = this.root;
            root.addClass(c("reader--in-shot"));
            // Whatever happens to the shot, the Reader is never left invisible.
            window.setTimeout(() => root.removeClass(c("reader--in-shot")), MOTION.shotPatience + MOTION.shotLand);
        }
        this.contentEl.setAttribute("tabindex", "-1");
        // A mouse moving shows the bar. A finger's taps do not: iOS follows every tap with emulated
        // mouse events, which would wake the bar on each page turn (#750).
        this.registerDomEvent(this.contentEl, "pointermove", (event: PointerEvent) => {
            if (event.pointerType !== "mouse") return;
            this.lastPointerType = "mouse";
            if (!this.deep) {
                this.wake();
                return;
            }
            // In deep reading a jitter is not a movement: the chrome comes back past a few pixels (FR-3).
            const from = this.deepPointer;
            if (from && !movedEnough(event.clientX - from.x, event.clientY - from.y)) return;
            this.deepPointer = { x: event.clientX, y: event.clientY };
            if (from) this.wake();
        });
        // Deep reading belongs to the tab you read in: another tab taking the focus ends it (#764).
        const away = this.app.workspace.on?.("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
            if (this.deep && leaf && leaf !== this.leaf) this.leaveDeep();
        });
        if (away) this.registerEvent(away);
        // On mobile the Reader covers Obsidian's chrome while it is the tab you read in (#750 D6).
        if (Platform.isMobile) {
            coverApp(true);
            const changed = this.app.workspace.on?.("active-leaf-change", () => coverApp(this.app.workspace.getMostRecentLeaf?.() === this.leaf));
            if (changed) this.registerEvent(changed);
        }
        // A reading restored before the index is ready is read as soon as the model is built.
        this.app.workspace.onLayoutReady?.(() => this.resolvePending());
        const resolved = this.app.metadataCache.on?.("resolved", () => this.resolvePending());
        if (resolved) this.registerEvent(resolved);
        this.render();
        this.contentEl.focus({ preventScroll: true });
    }

    async onClose(): Promise<void> {
        // Closing the tab in deep reading still gives the window back as it was.
        this.leaveDeep(true);
        window.clearTimeout(this.idleTimer);
        window.clearTimeout(this.placeTimer);
        this.touch = null;
        endChapterTurn();
        this.pager?.dispose();
        this.pager = null;
        this.dropSheet();
        this.leaveSource();
        this.highlights?.dispose();
        this.chapter?.unload();
        this.chapter = null;
        this.renderScope?.unload();
        this.renderScope = null;
        this.panelScope?.unload();
        this.panelScope = null;
        this.peekScope?.unload();
        this.peekScope = null;
        // Closing the tab any other way still gives the workspace back.
        restoreWorkspace(this.app);
        this.contentEl.empty();
        this.els = null;
        this.root = null;
    }

    // ── shell ────────────────────────────────────────────────────────────────

    private buildShell(): void {
        this.contentEl.empty();
        this.contentEl.addClass(c("reader-host"));
        const root = this.contentEl.createDiv();
        this.root = root;
        this.applyPrefs();

        const top = root.createDiv({ cls: c("reader-top") });
        const title = top.createDiv({ cls: c("reader-path-title") });
        const close = top.createEl("button", {
            cls: ["clickable-icon", c("reader-exit")].join(" "),
            attr: { type: "button", "aria-label": t("reader_exit") },
        });
        setIcon(close, "x");
        this.registerDomEvent(close, "click", () => this.exit());
        // How far through the chapter you are: a hairline across the top, filled by the scroll.
        const hairline = root.createDiv({ cls: c("reader-hairline"), attr: { "aria-hidden": "true" } });
        hairline.createDiv({ cls: c("reader-hairline-fill") });

        // The way back from a detour (#670): one press pops one level.
        const pill = root.createEl("button", {
            cls: [c("reader-detour-pill"), c("reader-hidden")].join(" "),
            attr: { type: "button" },
        });
        // The same pill is the way back from a jump inside a book (#718).
        this.registerDomEvent(pill, "click", () => (this.detours.length > 0 ? this.backFromDetour() : this.backFromJump()));
        this.pill = pill;

        // The bookmark ribbon at the page's top-right corner (#761 FR-1): a book's or a paper's only.
        const ribbon = root.createEl("button", {
            cls: ["clickable-icon", c("reader-ribbon"), c("reader-hidden")].join(" "),
            attr: { type: "button", "aria-pressed": "false", "aria-label": t("reader_bookmark_add") },
        });
        setIcon(ribbon.createSpan({ cls: c("reader-ribbon-mark") }), "bookmark");
        this.registerDomEvent(ribbon, "click", () => void this.toggleBookmark());
        this.ribbon = ribbon;

        const stage = root.createDiv({ cls: c("reader-stage") });
        // A selection popover belongs to the words it floats over; scrolling them away puts it away.
        this.registerDomEvent(stage, "scroll", () => {
            this.highlights?.onScroll();
            this.closeNote();
            this.onStageScroll();
            this.notePlace();
        });
        this.wireTouch(stage);
        // A peek is read in place; clicking elsewhere puts it away.
        this.registerDomEvent(root, "mousedown", (event) => {
            const target = event.target as HTMLElement | null;
            if (this.peek && target && !this.peek.contains(target) && !target.closest?.("a.internal-link")) this.closePeek();
            if (this.notePop && target && !this.notePop.contains(target)) this.closeNote();
        });
        const page = stage.createEl("article", { cls: c("reader-page") });
        // Kindle's margin (#671): the chapter's highlights and notes, beside the page on a wide pane.
        const margin = stage.createEl("aside", { cls: c("reader-margin"), attr: { "aria-label": t("reader_hl_margin") } });
        // Pages or scroll (#753): a turn moves the strip; the popovers, the hairline and the time left follow.
        this.pager = new ReaderPager(stage, page, {
            onTurn: () => {
                this.highlights?.onScroll();
                this.closeNote();
                this.onStageScroll();
                // The ribbon says whether the page you turned to holds a bookmark.
                this.notePlace();
            },
        });
        this.pager.configure(this.effectiveLayout(), this.bookDirection(), this.pageShape());
        // A picture arrives after the text and moves it: the pages are counted again, your line kept.
        this.registerDomEvent(page, "load", () => this.pager?.contentChanged(), { capture: true });
        const dots = root.createDiv({ cls: c("reader-dots"), attr: { role: "tablist", "aria-label": t("reader_contents") } });

        const bar = root.createDiv({ cls: c("reader-bar"), attr: { role: "toolbar", "aria-label": t("reader_title") } });
        this.iconButton(bar, "chevron-left", "reader_previous", () => this.go(-1));
        const label = bar.createSpan({ cls: c("reader-bar-label") });
        const progress = bar.createEl("progress", { cls: c("reader-progress") });
        const minutes = bar.createSpan({ cls: [c("reader-bar-minutes"), c("reader-hidden")].join(" ") });
        this.iconButton(bar, "chevron-right", "reader_next", () => this.go(1));
        bar.createSpan({ cls: c("reader-bar-sep") });
        this.iconButton(bar, "list", "reader_contents", () => this.toggle("contents"));
        const search = this.iconButton(bar, "search", "reader_search", () => void this.openSearch());
        search.addClass(c("reader-hidden"));
        this.iconButton(bar, "type", "reader_type", () => this.toggle("type"));
        this.iconButton(bar, "git-fork", "reader_context", () => this.toggle("context"));
        const view = this.iconButton(bar, "file-image", "reader_source_page_view", () => this.toggleView());
        view.addClass(c("reader-hidden"));
        // The zoom level, beside it (#767 FR-13): the camera goes back to the width of the screen.
        const zoom = bar.createEl("button", {
            cls: [c("reader-bar-zoom"), c("reader-hidden")].join(" "),
            attr: { type: "button", "aria-label": t("reader_pv_zoom_reset") },
        });
        this.registerDomEvent(zoom, "click", () => this.pageRun?.frame("width"));
        // Deep reading (#764 FR-1), where Fullscreen was and on every platform: the page alone does not
        // need the window's fullscreen, so it is never a dead control.
        const deep = this.iconButton(bar, "glasses", "reader_deep", () => this.toggleDeep());
        deep.setAttribute("aria-pressed", "false");
        deep.setAttribute("data-deep", "true");
        this.deepButton = deep;
        this.iconButton(bar, "keyboard", "reader_shortcuts", () => this.toggleShortcuts());

        const panel = root.createDiv({ cls: c("reader-panel") });
        this.els = { title, page, dots, label, progress, panel, stage, margin, hairline, minutes, view, search, zoom };
        this.highlights = new ReaderHighlights(
            {
                app: this.app,
                host: root,
                owner: this,
                scrollTo: (el, travel) => this.scrollToEl(el, travel),
                onChange: () => {
                    if (this.panel === "context") this.renderPanel();
                },
            },
            this.highlightDeps
        );
        this.watchShape(root);
        this.wake();
    }

    private iconButton(parent: HTMLElement, icon: string, key: LocaleKey, onClick: () => void): HTMLElement {
        const button = parent.createEl("button", {
            cls: ["clickable-icon", c("reader-bar-button")].join(" "),
            attr: { type: "button", "aria-label": t(key) },
        });
        setIcon(button, icon);
        this.registerDomEvent(button, "click", onClick);
        return button;
    }

    private applyPrefs(): void {
        if (!this.root) return;
        // The layout as it applies now: a PDF's Page view and the end card are never paged (#753).
        const { plugin, obsidian } = readerClassNames({ ...this.prefs, layout: this.effectiveLayout() });
        // A shot's states survive a change of type or theme: taking them off would replay an entrance.
        const kept = ["reader--idle", "reader--in-shot", "reader--arrived", "reader--deep", "reader--deep-entering", "reader--deep-leaving", "reader--page-run"].filter((name) => this.root?.hasClass?.(c(name)) ?? false);
        this.root.className = [...plugin.map((name) => c(name)), ...obsidian, ...kept.map((name) => c(name))].join(" ");
    }

    private savePrefs(next: ReaderPrefs): void {
        const before = this.prefs;
        if (next.theme !== before.theme) this.crossFadeTheme();
        // A new shape for the chapter keeps the line you were reading where your eyes are (FR-6, FR-14):
        // noted before the change, landed on after it, and the text around it settles.
        const coarse = next.layout !== before.layout || next.font !== before.font || next.size !== before.size;
        // The finer type (#757 FR-13) keeps your line the same way, with a quicker, fainter settle.
        const fine = next.spacing !== before.spacing || next.width !== before.width || next.margins !== before.margins || next.justify !== before.justify;
        const reshapes = coarse || fine;
        // A paper in Page view (#767): its printed pages take the new layout, the page you were on kept.
        if (this.runMode() && this.pageRun) {
            this.prefs = next;
            this.applyPrefs();
            this.applyLayout();
            if (next.layout !== before.layout) this.pageRun.reshape();
            this.renderZoom();
            if (this.plugin?.settings) {
                this.plugin.settings.readerPrefs = next;
                void this.plugin.saveSettings?.();
            }
            if (this.panel === "type") this.renderPanel();
            return;
        }
        const pager = this.pager;
        const anchor = reshapes && pager && !this.ended ? pager.firstVisible() : null;
        const tops = anchor && pager ? pager.blockTops() : null;
        this.prefs = next;
        this.applyPrefs();
        if (pager && anchor && tops) {
            pager.configure(this.effectiveLayout(), this.bookDirection(), this.pageShape());
            if (pager.paged) pager.relayout({ anchor });
            else pager.reveal(anchor);
            const keep = pager.blockOf(anchor);
            settleAround(keep, pager.visibleBlocks().map((el) => ({ el, oldTop: tops.get(el) ?? null })), coarse ? LAYOUT_SETTLE : TYPE_SETTLE);
            this.onStageScroll();
        } else if (reshapes) {
            this.applyLayout();
            this.pager?.relayout("keep");
        }
        if (this.plugin?.settings) {
            this.plugin.settings.readerPrefs = next;
            void this.plugin.saveSettings?.();
        }
        if (next.timeLeft !== before.timeLeft) this.onStageScroll();
        if (this.panel === "type") this.renderPanel();
    }

    /** What the type asks of a page in *Page* and *Spread* (#757): its measure and its margins. */
    private pageShape() {
        return pageShape(this.prefs.width, this.prefs.margins);
    }

    /** *Scroll*, *Page* or *Spread* as it applies now: a PDF's Page view and the end card always scroll. */
    private effectiveLayout(): ReaderLayout {
        if (this.ended || this.sourceView === "page" || this.runMode() || (this.sourcePath && !this.source)) return "scroll";
        return this.prefs.layout;
    }

    /** The chapter is in pages now. */
    private pagedNow(): boolean {
        return Boolean(this.pager?.paged);
    }

    /** Which way the book reads: a right-to-left book turns the other way (FR-10). */
    private bookDirection(): BookDirection {
        return this.source?.direction ?? "ltr";
    }

    /** The layout's classes and the pager, as they apply to what is on screen now. */
    private applyLayout(): void {
        const root = this.root;
        if (!root) return;
        const layout = this.effectiveLayout();
        root.toggleClass(c("reader--layout-page"), layout === "page");
        root.toggleClass(c("reader--layout-spread"), layout === "spread");
        // A paper read as printed (#767): the run of pages takes the whole reading, not the column.
        root.toggleClass(c("reader--page-run"), this.runMode());
        this.pager?.configure(layout, this.bookDirection(), this.pageShape());
    }

    /**
     * The chapter just drawn, laid out in pages (#753): on its first page, on its last when you turned
     * back into it, or on the place a resume, a jump back, a search hit or a highlight asked for.
     */
    private layPages(): void {
        const pager = this.pager;
        const reveal = this.pendingReveal;
        const share = this.pendingShare;
        const landing = this.landing;
        this.pagesPending = false;
        this.pendingReveal = null;
        this.landing = "start";
        if (!pager || !this.pagedNow()) return;
        this.pendingShare = null;
        const land: Landing = reveal ? { anchor: reveal } : share !== null ? { share } : landing;
        pager.relayout(land);
    }

    /** What a key asks for (#753): a page in pages, a screen or a chapter in a scroll — as today. */
    private runIntent(intent: KeyIntent | null): void {
        if (intent === "chapter+") this.go(1);
        else if (intent === "chapter-") this.go(-1);
        else if (intent === "page+" || intent === "screen+") this.page(1);
        else if (intent === "page-" || intent === "screen-") this.page(-1);
    }

    /** How far through the chapter you are: the page on show, or the scroll. */
    private currentShare(): number {
        const stage = this.els?.stage;
        if (this.pagedNow() && this.pager) return this.pager.fraction();
        return stage ? readFraction(stage.scrollTop, stage.scrollHeight, stage.clientHeight) : 0;
    }

    /**
     * Day, sepia, night (#724): the new theme fades in under a veil of the old one, instead of
     * snapping. Only opacity moves; the text never does.
     */
    private crossFadeTheme(): void {
        const root = this.root;
        if (!root || !motionWelcome(root)) return;
        const background = root.win.getComputedStyle?.(root).backgroundColor;
        if (!background) return;
        const veil = root.createDiv({ cls: c("reader-theme-veil"), attr: { "aria-hidden": "true" } });
        veil.setCssProps({ "--zf-veil": background });
        const done = () => veil.remove();
        veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" }).onfinish = done;
        root.win.setTimeout(done, MOTION.base + 300);
    }

    // ── chapters ─────────────────────────────────────────────────────────────

    private render(): void {
        if (!this.els) return;
        const els = this.els;
        const path = this.path;
        if (this.sourcePath) {
            const doc = this.source;
            els.title.setText(doc ? [doc.title, doc.author].filter(Boolean).join(" · ") : noteName(this.sourcePath));
        } else {
            els.title.setText(path ? (this.name ?? `${noteName(path.seed)} · ${t(KIND_KEY[this.kind])}`) : t("reader_title"));
        }
        this.applyLayout();
        const pageView = this.sourceView === "page";
        els.view.toggleClass(c("reader-hidden"), !this.source?.hasPageView);
        els.search.toggleClass(c("reader-hidden"), !this.sourcePath);
        els.view.toggleClass("is-active", Boolean(this.source?.hasPageView) && pageView);
        els.view.setAttribute("aria-label", t(pageView ? "reader_source_reading_view" : "reader_source_page_view"));
        els.view.setAttribute("aria-pressed", String(pageView));
        this.renderZoom();
        const total = path?.chapters.length ?? 0;
        this.renderBarPlace();

        els.dots.empty();
        // A book of three hundred pages is not three hundred dots: the bar's count says where you are.
        els.dots.toggleClass(c("reader-hidden"), Boolean(this.sourcePath) && total > DOTS_LIMIT);
        this.renderScope?.unload();
        const scope = new Component();
        scope.load();
        this.renderScope = scope;
        if (!this.sourcePath || total <= DOTS_LIMIT) path?.chapters.forEach((chapter, i) => {
            const dot = els.dots.createEl("button", {
                cls: [c("reader-dot"), ...(i < this.index || this.ended ? [c("reader-dot--done")] : []), ...(i === this.index && !this.ended ? [c("reader-dot--current")] : [])].join(" "),
                attr: {
                    type: "button",
                    role: "tab",
                    "aria-selected": String(i === this.index),
                    "aria-label": t("reader_dot_label", String(i + 1), this.source?.chapters[i]?.label ?? noteName(chapter.path)),
                },
            });
            scope.registerDomEvent(dot, "click", () => this.show(i));
        });
        this.renderPill();
        this.refreshRibbon();
        if (this.ended) this.renderEnd();
        else void this.renderChapter();
        if (this.panel) this.renderPanel();
    }

    /** Where you are, in the bar: its label, its progress, the current dot. Nothing else is drawn. */
    private renderBarPlace(): void {
        const els = this.els;
        if (!els) return;
        const total = this.path?.chapters.length ?? 0;
        els.label.setText(this.ended ? t("reader_finished") : total ? t("reader_chapter_label", String(this.index + 1), String(total)) : "");
        els.progress.max = Math.max(1, total);
        els.progress.value = this.ended ? total : total ? this.index + 1 : 0;
        Array.from(els.dots.children).forEach((dot, i) => {
            dot.toggleClass(c("reader-dot--done"), i < this.index || this.ended);
            dot.toggleClass(c("reader-dot--current"), i === this.index && !this.ended);
            dot.setAttribute("aria-selected", String(i === this.index));
        });
    }

    private async renderChapter(): Promise<void> {
        if (this.sourcePath) return this.renderSourceChapter();
        if (!this.els || !this.path) return;
        const generation = ++this.generation;
        const { page, stage } = this.els;
        const chapter = this.path.chapters[this.index];
        const detour = this.detours[this.detours.length - 1];
        const reading = detour ?? chapter.path;
        if (!detour) this.visited.add(chapter.path);
        this.closePeek();
        // The last chapter's highlights must not show in a panel while this one renders.
        this.highlights?.reset();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;

        this.turnFrom(page);
        page.empty();
        // In pages the strip goes back to its start before the next chapter is drawn on it (#753).
        this.pager?.reset();
        this.pagesPending = this.pagedNow();
        this.turnPage(page);
        this.chapterWords = 0;
        this.nextCard = null;
        const total = this.path.chapters.length;
        page.removeAttribute("dir");
        page.createDiv({
            cls: c("reader-count"),
            text: detour ? t("reader_detour") : `${String(this.index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
        });
        page.createDiv({ cls: c("reader-role") }).createSpan({
            cls: [c("reader-role-tag"), c(`reader-role-tag--${detour ? "detour" : chapter.role}`)].join(" "),
            text: detour ? t("reader_detour") : t(ROLE_KEY[chapter.role]),
        });
        page.createEl("h1", { cls: c("reader-chapter-title"), text: noteName(reading) });
        const body = page.createDiv({ cls: ["markdown-rendered", c("reader-body")].join(" ") });
        // A note reading keeps Obsidian's language, as it always has (#757 FR-6).
        this.pageLanguage = null;
        stage.scrollTop = 0;
        this.onStageScroll();
        // Before the render, and in the capture phase: an embed's own link handler would otherwise
        // open the note in another tab — or create it, when the link is unresolved — before ours ran.
        component.registerDomEvent(body, "click", (event) => this.onLink(event), { capture: true });
        component.registerDomEvent(body, "auxclick", (event) => this.onLink(event), { capture: true });

        const file = this.app.vault.getAbstractFileByPath(reading);
        if (!(file instanceof TFile)) {
            body.createDiv({ cls: c("reader-missing"), text: t("reader_missing") });
        } else {
            try {
                const markdown = await this.app.vault.cachedRead(file);
                if (generation !== this.generation) return;
                // Raw: Obsidian's renderer hides the frontmatter itself — stripping it here too would
                // eat a `---` rule that opens the body.
                await MarkdownRenderer.render(this.app, markdown, body, file.path, component);
            } catch (error) {
                log.error(`[Reader] could not render ${reading}: ${error instanceof Error ? error.message : String(error)}`);
                body.createDiv({ cls: c("reader-missing"), text: t("reader_missing") });
            }
        }
        if (generation !== this.generation) return;
        this.chapterWords = wordCount(body.textContent ?? "");
        this.seenWords.set(this.index, this.chapterWords);
        this.landShot();
        this.watchFocus(body, component);
        // The note's highlights, found again by their words; a deep link lands on one (#671).
        void this.highlights?.attach(body, reading, component, this.els?.margin ?? null).then(() => {
            if (generation !== this.generation || !this.pendingHighlight) return;
            if (this.highlights?.reveal(this.pendingHighlight)) this.pendingHighlight = null;
        });
        // Obsidian's own page preview on every link it drew, as on every note name the plugin draws (#594).
        for (const link of Array.from(body.querySelectorAll("a.internal-link"))) {
            const href = link.getAttribute("data-href");
            const target = href ? this.app.metadataCache.getFirstLinkpathDest(href.split("#")[0], reading) : null;
            if (target) hoverPreview(this.app, link as HTMLElement, target.path, component);
        }

        const card = page.createDiv({ cls: c("reader-next") });
        // The chapter's end, quietly (#724): an ornament that fades in as you arrive. No number.
        card.createDiv({ cls: c("reader-ornament"), attr: { "aria-hidden": "true" } }).createSpan({ cls: c("reader-ornament-mark") });
        this.nextCard = card;
        const next = card.createEl("button", {
            cls: c("reader-next-button"),
            attr: { type: "button" },
        });
        const last = this.index === total - 1;
        if (detour) {
            next.setText(t("reader_back_to", this.backName()));
            component.registerDomEvent(next, "click", () => this.backFromDetour());
        } else if (last) {
            next.setText(t("reader_finish"));
            component.registerDomEvent(next, "click", () => this.finish());
        } else {
            // "Next · its name · how long it is": the end of a chapter tells you what the next one asks.
            const upcoming = this.path.chapters[this.index + 1].path;
            next.createSpan({ cls: c("reader-next-label"), text: t("reader_next_named", noteName(upcoming)) });
            component.registerDomEvent(next, "click", () => this.go(1));
            void this.nextMinutes(upcoming).then((minutes) => {
                if (generation !== this.generation || minutes === 0) return;
                next.createSpan({ cls: c("reader-next-sep"), text: "·", attr: { "aria-hidden": "true" } });
                next.createSpan({ cls: c("reader-next-minutes"), text: tCount(minutes, "reader_minutes", String(minutes)) });
                this.pager?.contentChanged();
            });
        }
        // Everything is on the page, the end card too: lay it out in pages (#753), then say where you are.
        this.layPages();
        this.onStageScroll();
    }

    /** How long a chapter takes to read, from its words; 0 when it cannot be read. */
    private async nextMinutes(notePath: string): Promise<number> {
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) return 0;
        try {
            return minutesFor(wordCount(stripFrontmatter(await this.app.vault.cachedRead(file))));
        } catch (error) {
            log.debug(`[Reader] could not measure ${notePath}: ${String(error)}`);
            return 0;
        }
    }

    /**
     * A chapter changes physically (#735): the page you were on is laid over the stage as a sheet and
     * leaves the way Settings → Reading says, before this page is emptied for the next one.
     */
    private turnFrom(page: HTMLElement): void {
        if (this.turn === 0 || !this.root || !this.els) return;
        // A finger let a turn go past its third (#750): that turn is this chapter's, already playing.
        // A place landed on in the new chapter shows itself once the page has turned (#761).
        this.turnLandsAt = this.motionAllowed() ? Date.now() + MOTION.turn : 0;
        if (adoptChapterScrub()) return;
        playChapterTurn(this.root, this.els.stage, page, readingMotion(this.plugin?.settings?.readingMotion).chapter, this.turn > 0 ? 1 : -1);
    }

    /**
     * A reading that just opened rises (#667); a turned chapter is already there under its sheet. The
     * same element is reused, so the class is taken off and the box read once — that restarts the
     * animation instead of leaving it finished.
     */
    private turnPage(page: HTMLElement): void {
        page.removeClass(c("reader-page--enter"));
        void page.offsetWidth;
        if (this.turn === 0) page.addClass(c("reader-page--enter"));
        this.turn = 0;
    }

    /** The hairline, the minutes left and the next card, from where the page is scrolled to. */
    private onStageScroll(): void {
        const els = this.els;
        if (!els) return;
        const { stage } = els;
        // In pages the place is the page on show, filled page by page (#753 FR-7).
        const pager = this.pagedNow() ? this.pager : null;
        const fraction = this.ended ? 1 : pager ? pager.fraction() : readFraction(stage.scrollTop, stage.scrollHeight, stage.clientHeight);
        els.hairline.setCssProps?.({ "--zf-reader-read": String(Math.round(fraction * 1000) / 1000) });
        if (fraction >= END_OF_CHAPTER) this.reachedEnd = true;
        this.keepScroll(fraction);
        const wpm = paceWpm(this.pace);
        const left = this.ended ? 0 : minutesLeft(this.chapterWords, fraction, wpm);
        const book = this.ended ? 0 : this.bookMinutes(fraction, wpm);
        // Quiet (#722): it lives in the bar, which shows only while you move or press a key.
        const text = !this.prefs.timeLeft || left === 0 ? "" : book > left ? `${tCount(left, "reader_minutes_left", String(left))} · ${t("reader_book_left", this.duration(book))}` : tCount(left, "reader_minutes_left", String(left));
        els.minutes.setText(text);
        els.minutes.toggleClass(c("reader-hidden"), text === "");
        const atEnd = pager ? pager.atEnd() : !scrolls(stage.scrollHeight, stage.clientHeight) || fraction >= END_OF_CHAPTER;
        this.nextCard?.toggleClass(c("reader-next--arrived"), atEnd);
    }

    /**
     * One sample of your pace (#722), taken as you leave a chapter you read to its end: its words over
     * the time it was open. A chapter skimmed or left open is not reading, and `learnPace` drops it.
     * Kept on this device only.
     */
    private samplePace(): void {
        const opened = this.chapterOpenedAt;
        this.chapterOpenedAt = Date.now();
        const reached = this.reachedEnd;
        this.reachedEnd = false;
        if (!reached || this.chapterWords <= 0) return;
        const next = learnPace(this.pace, { words: this.chapterWords, ms: Date.now() - opened });
        if (next === this.pace) return;
        this.pace = next;
        this.app?.saveLocalStorage?.(PACE_STORAGE_KEY, next);
    }

    /** How far into the chapter you are, kept a moment after you stop scrolling (a book or a paper). */
    private keepScroll(fraction: number): void {
        const path = this.sourcePath;
        if (!path || !this.source || this.ended) return;
        const chapter = this.index;
        const win = this.root?.win ?? window;
        win.clearTimeout(this.scrollSaveTimer);
        this.scrollSaveTimer = win.setTimeout(() => {
            // In Page view the place is how far down the page most on screen you are (#767 FR-8).
            const share = this.runMode() && this.pageRun ? this.pageRun.shareInPage() : fraction;
            if (this.sourcePath === path && this.index === chapter) rememberSourceScroll(this.app, this.plugin, path, chapter, this.source?.chapters.length ?? chapter + 1, share);
        }, SCROLL_SAVE_MS);
    }

    /** Minutes left in the book: this chapter's remainder and the chapters after it (#722). */
    private bookMinutes(fraction: number, wpm: number): number {
        const total = this.source?.chapters.length ?? this.path?.chapters.length ?? 0;
        const after = Math.max(0, total - this.index - 1);
        const chapterWordsLeft = Math.round(this.chapterWords * (1 - fraction));
        // Read through by a search: the words of each chapter to come. Otherwise, the average so far.
        const texts = this.searchTexts;
        if (texts && texts.length === total) {
            return bookMinutesLeft({ chapterWordsLeft, upcoming: texts.slice(this.index + 1).map(wordCount), wpm });
        }
        const seen = [...this.seenWords.values()].filter((words) => words > 0);
        const averageWords = seen.length > 0 ? seen.reduce((sum, words) => sum + words, 0) / seen.length : this.chapterWords;
        return bookMinutesLeft({ chapterWordsLeft, upcoming: { chapters: after, averageWords }, wpm });
    }

    /** A time as the bar says it: "40 min", "3 h", "3 h 40 min". */
    private duration(total: number): string {
        const { hours, minutes } = splitMinutes(total);
        if (hours === 0) return t("reader_time_min", String(minutes));
        return minutes === 0 ? t("reader_time_h", String(hours)) : t("reader_time_h_min", String(hours), String(minutes));
    }

    /**
     * Focus mode (#667): the block nearest the reading line — a band a little above the middle —
     * is marked, and the stylesheet dims the rest when focus is on. Watched always, so turning focus
     * on mid-chapter lights the right paragraph at once.
     */
    private watchFocus(body: HTMLElement, component: Component): void {
        const stage = this.els?.stage;
        // Obsidian's renderer draws a section per block; the jest fake draws one wrapper of paragraphs.
        const blocks = Array.from(body.children) as HTMLElement[];
        if (!stage || blocks.length === 0) return;
        const mark = c("reader-focus-current");
        let current: HTMLElement = blocks[0];
        current.addClass(mark);
        // The reader's own window's observer: a pop-out window has its own.
        const win = this.viewWindow() as unknown as { IntersectionObserver?: typeof IntersectionObserver } | undefined;
        const Observer = win?.IntersectionObserver;
        if (!Observer) return;
        const observer = new Observer(
            (entries: IntersectionObserverEntry[]) => {
                const hit = entries.find((entry) => entry.isIntersecting)?.target as HTMLElement | undefined;
                if (!hit || hit === current) return;
                current.removeClass(mark);
                current = hit;
                hit.addClass(mark);
            },
            { root: stage, rootMargin: "-38% 0px -56% 0px", threshold: 0 }
        );
        for (const block of blocks) observer.observe(block);
        component.register(() => observer.disconnect());
    }

    /** The note on screen: the deepest detour, or the chapter. */
    private reading(): string | null {
        if (!this.path) return null;
        return this.detours[this.detours.length - 1] ?? this.path.chapters[this.index].path;
    }

    /** Where one step back lands: the previous detour, or the chapter you left from. */
    private backName(): string {
        const previous = this.detours.length > 1 ? this.detours[this.detours.length - 2] : this.path?.chapters[this.index].path;
        return previous ? noteName(previous) : "";
    }

    private renderPill(): void {
        if (!this.pill) return;
        if (this.detours.length > 0) {
            this.pill.toggleClass(c("reader-hidden"), false);
            this.pill.toggleClass(c("reader-jump-pill"), false);
            this.pill.setText(`↩ ${t("reader_back_to", this.backName())}`);
            return;
        }
        // A jump inside a book (#718): where you were, until it fades by itself.
        const back = this.jumpPillShown ? this.trail.peek() : undefined;
        this.pill.toggleClass(c("reader-hidden"), !back);
        this.pill.toggleClass(c("reader-jump-pill"), Boolean(back));
        this.pill.setText(back ? `← ${t("reader_back_to", back.label)}` : "");
    }

    /**
     * Remember where you are before a jump (#718, #761 FR-6) — the first line on screen, by its place
     * in the chapter's text — and why you leave. False where there is no book to leave a trail in.
     */
    private leaveTrail(reason: TrailReason): boolean {
        const stage = this.els?.stage;
        if (!this.sourcePath || !this.path || !stage || this.ended) return false;
        this.trail.push({ ...this.spotHere(), label: this.sourceLabel(this.index), reason });
        this.flashJumpPill();
        if (this.panel === "contents" && this.contentsTab === "trail") this.renderPanel();
        return true;
    }

    /** Where you are now: the first line on screen, as a place in the chapter's text. */
    private spotHere(): Spot {
        // In Page view a place is a page, and how far down it you were (#767 FR-8).
        if (this.runMode() && this.pageRun) return { chapter: this.index, offset: null, share: this.pageRun.shareInPage(), top: null };
        const body = this.chapterBody();
        const anchor = this.pager?.firstVisible() ?? null;
        const offset = body && anchor ? this.offsetOfAnchor(body, anchor) : null;
        return { chapter: this.index, offset, share: this.currentShare(), top: this.els?.stage.scrollTop ?? 0 };
    }

    /**
     * A jump inside a book (#718): a link, Contents, *Go to note*. Where you were is kept first, so
     * the pill — or Alt+← — brings you back to the very line.
     */
    private jumpTo(chapter: number, fragment: string | undefined, reason: TrailReason): void {
        if (!this.path || !this.els) return;
        this.leaveTrail(reason);
        this.closeNote();
        if (chapter !== this.index) {
            this.show(chapter);
            if (fragment) this.scrollToFragment(fragment, false);
        } else if (fragment) {
            this.scrollToFragment(fragment, true);
        } else {
            // This very chapter, from its start: the camera goes back up to it.
            this.landHere({ chapter, offset: 0, share: 0, top: 0 }, true);
        }
    }

    /** Back to where the last jump left from. False when there is nowhere to go back to. */
    private backFromJump(): boolean {
        const back = this.trail.pop();
        if (!back || !this.els) return false;
        this.landOn(back);
        return true;
    }

    /** A row of *Where you've been*: back there, and that place leaves the trail (FR-8). */
    private backTo(index: number): void {
        const back = this.trail.takeAt(index);
        if (!back) return;
        this.landOn(back);
        if (this.panel === "contents") this.renderPanel();
    }

    /**
     * Go to a place (#761 FR-15): in this chapter the camera travels there; in another, the chapter
     * turns towards it the way you chose (#735) — back along the trail that is the reverse of the turn
     * that brought you — and the page lands on it.
     */
    private landOn(spot: Spot): void {
        this.closeNote();
        if (this.runMode() && this.pageRun) {
            // A page of a paper in Page view: travelled to in a scroll, turned to in pages (#767).
            this.goToPage(spot.chapter, spot.share ?? 0);
        } else if (spot.chapter !== this.index) {
            this.pendingLanding = spot;
            this.show(spot.chapter);
        } else {
            this.landHere(spot, true);
        }
        // The next step back stays one press away, for a while; with none left the pill goes.
        if (this.trail.size > 0) this.flashJumpPill();
        else {
            this.jumpPillShown = false;
            this.renderPill();
        }
    }

    /**
     * Put a place of the chapter on screen — travelling there, or at once in a chapter just drawn —
     * and show it with the *you are here* mark once it has landed (FR-17).
     */
    private landHere(spot: Spot, travel: boolean): void {
        if (this.runMode() && this.pageRun) {
            this.goToPage(spot.chapter, spot.share ?? 0, travel);
            return;
        }
        const stage = this.els?.stage;
        const pager = this.pager;
        const body = this.chapterBody();
        if (!stage || !pager) return;
        const offset = body && spot.bookmark ? landingOffset(chapterText(body), spot.bookmark) : spot.offset;
        // The mark first: the caret made for the place is then inside it.
        const here = body && offset !== null ? markHereAt(body, offset) : null;
        const anchor = body && offset !== null ? this.anchorAt(body, offset) : null;
        let ms = 0;
        if (this.pagedNow()) {
            if (this.pagesPending) {
                // Laid out in pages once the chapter is complete: there, on the page that holds it.
                if (anchor) this.pendingReveal = anchor;
                else this.pendingShare = spot.share ?? 0;
            } else if (anchor) ms = pager.reveal(anchor, travel);
            else ms = pager.goToShare(spot.share ?? 0, travel);
        } else if (anchor) {
            ms = pager.reveal(anchor, travel);
        } else {
            const top = spot.top ?? resumeScroll(spot.share ?? 0, stage.scrollHeight, stage.clientHeight);
            if (travel) ms = pager.glideTo(top);
            else stage.scrollTop = top;
        }
        const landed = this.hereDelay(ms);
        here?.after(landed);
        // The ribbon is asked once the move has landed: mid-travel the page is somewhere else.
        if (landed > 0) (this.root?.win ?? window).setTimeout(() => this.refreshRibbon(), landed + 40);
    }

    /** How long a mark waits: for the travel, or for the chapter turn still playing. */
    private hereDelay(ms: number): number {
        return Math.max(0, ms, this.turnLandsAt - Date.now());
    }

    /** The chapter's body on the page, where its text is. */
    private chapterBody(): HTMLElement | null {
        return this.els?.page.querySelector<HTMLElement>(`.${c("reader-body")}`) ?? null;
    }

    /** A place in the chapter's text, as a caret on the page — or the element holding it, where no caret can be made. */
    private anchorAt(body: HTMLElement, offset: number): PageAnchor | null {
        const point = pointAt(body, offset);
        if (!point) return null;
        const node = point.node as unknown as Node;
        const doc = (body as HTMLElement & { doc?: Document }).doc;
        if (doc?.createRange) {
            const range = doc.createRange();
            range.setStart(node, point.offset);
            range.collapse(true);
            return range;
        }
        return (point.node.parentNode as unknown as Element | null) ?? null;
    }

    /** Where a caret or a block is in the chapter's text. */
    private offsetOfAnchor(body: HTMLElement, anchor: PageAnchor): number | null {
        const root = body as unknown as NodeLike;
        if ("startContainer" in anchor) {
            // The caret is asked a few pixels into the line: back to the start of its word, inside its text.
            const node = anchor.startContainer;
            const data = node.nodeType === 3 ? (node as Text).data : "";
            return offsetAt(root, node, data ? wordStart(data, anchor.startOffset) : anchor.startOffset);
        }
        return offsetAt(root, anchor, 0);
    }

    /** The way back, for a while: it goes away by itself, and an ordinary turn puts it away. */
    private flashJumpPill(): void {
        const win = this.root?.win ?? window;
        win.clearTimeout(this.jumpPillTimer);
        this.jumpPillShown = true;
        this.renderPill();
        this.jumpPillTimer = win.setTimeout(() => {
            this.jumpPillShown = false;
            this.renderPill();
        }, JUMP_PILL_MS);
    }

    /** The note a link in the chapter points at, resolved the way Obsidian resolves it. */
    private linkTarget(event: Event): { link: HTMLElement; href: string; file: TFile | null } | null {
        const link = (event.target as HTMLElement | null)?.closest?.("a.internal-link") as HTMLElement | null;
        if (!link || !this.path) return null;
        const href = link.getAttribute("data-href") ?? link.getAttribute("href");
        if (!href) return null;
        const file = this.app.metadataCache.getFirstLinkpathDest(href.split("#")[0], this.reading() ?? "");
        return { link, href, file };
    }

    /**
     * A link inside a chapter is a **peek** (#670): read it in place, take it as a detour, jump to it
     * when it is a chapter, or add it to this reading. Mod-click still opens it in a tab. A link to a
     * note that does not exist yet only says so — following it would create the note, and the Reader
     * writes nothing.
     */
    private onLink(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        // A highlight drawn inside a link answers its own click (its popover), not the link's.
        if (target?.closest?.(`mark.${c("reader-highlight")}`)) return;
        // A tag is not a note to peek at, and following its href would only rewrite the hash.
        if (target?.closest?.("a.tag")) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const found = this.linkTarget(event);
        if (!found) return;
        event.preventDefault();
        event.stopPropagation();
        // A middle click, like a mod-click, is "in a new tab".
        if (event.type === "auxclick" || Keymap.isModEvent(event)) {
            if ((event.type !== "auxclick" || event.button === 1) && found.file) {
                void this.app.workspace.openLinkText(found.file.path, this.reading() ?? "", "tab");
            }
            return;
        }
        const block = found.link.closest<HTMLElement>("p, blockquote, ul, ol, table, h1, h2, h3, h4, h5, h6, .callout") ?? found.link;
        this.openPeek(block, found.file?.path ?? null, found.href);
    }

    /**
     * Draw a peek right under `anchor`'s block — in the chapter, or under a row of the context
     * panel. Inline, not floating: it scrolls with what it explains and needs no coordinates.
     */
    private openPeek(anchor: HTMLElement, notePath: string | null, label: string): void {
        if (!this.path) return;
        this.closePeek();
        const parent = anchor.parentElement;
        if (!parent) return;
        const generation = ++this.peekGeneration;
        const scope = new Component();
        scope.load();
        this.peekScope = scope;
        const card = parent.createDiv({
            cls: c("reader-peek"),
            attr: { role: "dialog", "aria-label": t("reader_peek_label", noteName(notePath ?? label)) },
        });
        anchor.after(card);
        this.peek = card;

        const at = notePath ? placeInPath(this.path.chapters, notePath) : -1;
        card.createDiv({
            cls: c("reader-peek-place"),
            text: !notePath ? t("reader_peek_missing") : at >= 0 ? t("reader_peek_in_path", String(at + 1)) : t("reader_peek_outside"),
        });
        const title = card.createDiv({ cls: c("reader-peek-title"), text: noteName(notePath ?? label) });
        if (notePath) hoverPreview(this.app, title, notePath, scope);
        const excerpt = card.createDiv({ cls: c("reader-peek-excerpt") });
        const actions = card.createDiv({ cls: c("reader-peek-actions") });
        const action = (key: LocaleKey, primary: boolean, run: () => void) => {
            const button = actions.createEl("button", {
                cls: [c("reader-peek-action"), ...(primary ? ["mod-cta"] : [])].join(" "),
                attr: { type: "button" },
                text: t(key),
            });
            scope.registerDomEvent(button, "click", run);
        };

        if (notePath) {
            if (notePath !== this.reading()) action("reader_peek_detour", true, () => this.takeDetour(notePath));
            if (at >= 0) action("reader_peek_jump", false, () => this.show(at));
            else action("reader_peek_add", false, () => this.addToReading(notePath));
            action("reader_peek_tab", false, () => {
                this.closePeek();
                void this.app.workspace.openLinkText(notePath, this.reading() ?? "", "tab");
            });
            const file = this.app.vault.getAbstractFileByPath(notePath);
            if (file instanceof TFile) {
                void this.app.vault
                    .cachedRead(file)
                    .then((markdown) => {
                        if (generation === this.peekGeneration && this.peek === card) excerpt.setText(plainExcerpt(markdown));
                    })
                    .catch((error: unknown) => log.debug(`[Reader] peek excerpt failed: ${String(error)}`));
            }
        }
        action("reader_peek_close", false, () => this.closePeek());
    }

    private closePeek(): void {
        this.peekGeneration++;
        this.peek?.remove();
        this.peek = null;
        this.peekScope?.unload();
        this.peekScope = null;
    }

    private takeDetour(notePath: string): void {
        const reading = this.reading();
        if (!reading) return;
        this.detours = pushDetour(this.detours, notePath, reading);
        this.detourCount++;
        this.closePeek();
        this.render();
    }

    private backFromDetour(): void {
        if (this.detours.length === 0) return;
        this.detours = popDetour(this.detours);
        this.render();
    }

    /** Add a note after this chapter, for this reading only (#670): the reading is not a file. */
    private addToReading(notePath: string): void {
        if (!this.path) return;
        this.path = addToReading(this.path, this.index, notePath);
        this.closePeek();
        this.render();
    }

    /** Open chapter `index` — in pages on its first page, or (`land: "end"`) on its last. */
    private show(index: number, land: "start" | "end" = "start"): void {
        if (!this.path) return;
        this.landing = land;
        this.samplePace();
        this.pending = null;
        this.detours = [];
        const target = Math.max(0, Math.min(index, this.path.chapters.length - 1));
        // A paper scrolled in Page view (#767 FR-19): another page is a camera move along the run,
        // never a redraw.
        if (this.runScrolls()) {
            this.goToPage(target, 0);
            this.app.workspace.requestSaveLayout();
            this.rememberPlace();
            return;
        }
        // A thumbnail flies to its page (FR-22): the flight is the camera, no chapter turn on top.
        const flight = this.flight;
        this.flight = false;
        this.turn = flight ? 0 : this.ended || target < this.index ? -1 : target > this.index ? 1 : 0;
        this.ended = false;
        this.index = target;
        this.render();
        this.app.workspace.requestSaveLayout();
        this.rememberPlace();
    }

    private go(delta: number, land: "start" | "end" = "start"): void {
        if (!this.path) return;
        // An ordinary turn puts the pill away (#718); the trail stays, in *Where you've been* and on
        // Alt+← (#761 G1: a visible trail that vanished on every turn would not be one).
        this.jumpPillShown = false;
        if (this.ended) {
            // Back from the end card lands on the last chapter; forward stays on the end.
            if (delta < 0) this.show(this.index, land);
            return;
        }
        // A paper in Page view, in Page or Spread: a view at a time — page 1 alone, then pairs (#767 FR-6).
        const next = this.runMode() && this.pageRun && this.prefs.layout !== "scroll" ? this.pageRun.stepFrom(this.index, delta > 0 ? 1 : -1) : this.index + delta;
        if (next >= this.path.chapters.length) {
            this.finish();
            return;
        }
        if (next < 0) return;
        this.show(next, land);
    }

    /** The shot from the Library, landed on the page just drawn — once; a Reader with no shot is simply shown. */
    private landShot(): void {
        if (!this.root || !this.els) return;
        if (!this.root.hasClass?.(c("reader--in-shot")) && !shotIncoming()) return;
        void landOpenShot(this.root, this.els.stage, this.els.page);
    }

    /** The next chapter — the palette's *Reader: next chapter*, and →. */
    nextChapter(): void {
        this.go(1);
    }

    /** The previous chapter — the palette's *Reader: previous chapter*, and ←. */
    previousChapter(): void {
        this.go(-1);
    }

    /**
     * Leave the reader (#667) — Esc, ×, or the palette's *Reader: exit*: the page fades, then the
     * sidebars come back as they were, the leaf you were in is active again, and this one closes.
     * With reduced motion (or no window to ask) it goes at once.
     */
    exit(): void {
        if (this.leaving) return;
        this.leaving = true;
        // Leaving the Reader in deep reading gives the window back as it was (FR-6).
        this.leaveDeep(true);
        const root = this.root;
        // Opened from the Library: the shot back to the book on its shelf (#734).
        if (root && this.els && this.back && readingMotion(this.plugin?.settings?.readingMotion).open === "shot") {
            const back = this.back;
            if (beginCloseShot(root, this.els.stage, this.els.page, String(back.focus ?? ""), () => exitReader(this.app, this.leaf, back))) return;
        }
        if (!root || !this.motionAllowed()) {
            exitReader(this.app, this.leaf, this.back);
            return;
        }
        root.addClass(c("reader--leaving"));
        window.setTimeout(() => exitReader(this.app, this.leaf, this.back), EXIT_MS);
    }

    // ── the end of a path (#672) ─────────────────────────────────────────────

    /** Past the last chapter: the end card, and the reading forgotten by resume — it is finished. */
    private finish(): void {
        if (!this.path) return;
        this.detours = [];
        this.closePeek();
        this.ended = true;
        this.rememberPlace();
        this.render();
    }

    /** The chapters of this reading, in the order they were read. */
    private chapterPaths(): string[] {
        return this.path?.chapters.map((chapter) => chapter.path) ?? [];
    }

    private renderEnd(): void {
        if (!this.els || !this.path) return;
        if (this.sourcePath) return this.renderSourceEndCard();
        this.highlights?.hidePopover();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;
        const path = this.path;
        const counts = this.highlights?.sessionCounts() ?? { highlights: 0, notes: 0 };
        const thesis = path.chapters.find((chapter) => chapter.role === "thesis")?.path ?? path.seed;
        const kindLabel = t(KIND_KEY[this.kind]);
        const title = this.name ?? noteName(path.seed);
        // What a save proposes and an export is called: the note and the way it was read.
        const docName = this.name ?? `${noteName(path.seed)} · ${kindLabel}`;
        renderEndCard(
            this.els.page,
            {
                title,
                kindLabel,
                thesis,
                defaultName: docName,
                savedAs: this.savedId ? this.name : undefined,
                stats: {
                    minutes: Math.max(1, Math.round((Date.now() - this.startedAt) / 60000)),
                    notes: Math.max(1, this.visited.size),
                    detours: this.detourCount,
                    highlights: counts.highlights,
                    marginNotes: counts.notes,
                },
                status: this.endStatus,
                actions: {
                    save: (name) => this.saveReading(name),
                    exportDocument: () => this.exportReading(docName, kindLabel),
                    cultivate: () => this.cultivateThesis(thesis),
                    again: () => this.show(0),
                    ...(this.kind === "selection" ? {} : { another: () => readFrom(this.app, path.seed) }),
                },
            },
            component
        );
        this.els.stage.scrollTop = 0;
    }

    /** Keep the path in plugin data — its chapters, in this order — never in a note. */
    private async saveReading(name: string): Promise<void> {
        const settings = this.plugin?.settings;
        if (!settings || !this.path) return;
        const paths = this.chapterPaths();
        const id = this.savedId ?? savedId(paths, Date.now());
        settings.readerSaved = saveReading(normalizeSaved(settings.readerSaved), {
            id,
            name,
            kind: this.kind,
            seed: this.path.seed,
            paths,
            at: Date.now(),
        });
        await this.plugin?.saveSettings?.();
        this.savedId = id;
        this.name = name;
        this.render();
        // Home lists saved readings: an open Home shows the new one now, not on its next redraw.
        for (const leaf of this.app.workspace.getLeavesOfType?.("zettelflow-home") ?? []) {
            (leaf.view as { refresh?: () => void } | null)?.refresh?.();
        }
    }

    /** The preview, then — only on Export — one new note; Undo sends it to the trash. */
    private exportReading(title: string, kindLabel: string): void {
        if (!this.path) return;
        const seed = this.path.seed;
        const folder = seed.includes("/") ? seed.slice(0, seed.lastIndexOf("/")) : "";
        const date = new Date().toLocaleDateString();
        new ReadingExportModal(
            this.app,
            { title, intro: t("reader_export_doc_intro", kindLabel, date), chapters: this.chapterPaths(), folder, fileName: title },
            (result) => this.onExported(result)
        ).open();
    }

    private onExported(result: ExportResult): void {
        if (!result.ok || !result.path) {
            this.endStatus = { text: t("reader_export_failed") };
        } else {
            const written = result.path;
            const batch = result.batch;
            this.endStatus = {
                text: t("reader_export_done", written),
                open: () => void this.app.workspace.openLinkText(written, "", "tab"),
                ...(batch
                    ? {
                          undo: () =>
                              void undoBatch(batch).then((outcome) => {
                                  this.endStatus = {
                                      text: t(outcome.hadWork && outcome.failed.length === 0 ? "reader_export_removed" : "reader_export_undo_failed"),
                                  };
                                  if (this.ended) this.render();
                              }),
                      }
                    : {}),
            };
        }
        if (this.ended) this.render();
    }

    /** Hand the thesis to Cultivate, giving the workspace back first. */
    private cultivateThesis(thesis: string): void {
        exitReader(this.app, this.leaf, this.back);
        void activateSurface(this.app, "zettelflow-home", "cultivate", { target: thesis });
    }

    /** Keep where this reading is, so the chooser can offer to resume it (#669). */
    private rememberPlace(): void {
        const settings = this.plugin?.settings;
        if (!settings || !this.path) return;
        if (this.sourcePath) {
            if (this.source) rememberSourcePlace(this.app, this.plugin, this.sourcePath, this.ended ? this.path.chapters.length - 1 : this.index, this.path.chapters.length);
            return;
        }
        const key = readingKey(this.kind, this.path.seed, this.paths);
        settings.readerResume = recordResume(
            normalizeResume(settings.readerResume),
            key,
            this.index,
            this.path.chapters.length,
            Date.now()
        );
        void this.plugin?.saveSettings?.();
    }

    // ── a source: a PDF or an EPUB (#681, #682) ──────────────────────────────

    /** How a reader cites the chapter on screen: `p. 42`, or the chapter's name. */
    private sourceLabel(index: number): string {
        return this.source?.chapters[index]?.label ?? String(index + 1);
    }

    private async renderSourceChapter(): Promise<void> {
        if (!this.els || !this.path || !this.sourcePath) return;
        const generation = ++this.generation;
        const { page, stage } = this.els;
        const path = this.sourcePath;
        const doc = this.source;
        const index = this.index;
        this.visited.add(`${path}#${index}`);
        this.closePeek();
        this.highlights?.reset();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;

        this.turnFrom(page);
        page.empty();
        // In pages the strip goes back to its start before the next chapter is drawn on it (#753).
        this.pager?.reset();
        this.pagesPending = this.pagedNow();
        this.turnPage(page);
        this.chapterWords = 0;
        this.nextCard = null;
        const total = this.path.chapters.length;
        const chapter = doc?.chapters[index];
        // A paper read as printed (#767): its pages run on, and the bar says which one you are on.
        const asRun = this.runMode();
        this.runHighlightScope?.unload();
        this.runHighlightScope = null;
        // A book written right to left: its pages flow, and turn, to the left (#753 FR-10).
        if (this.bookDirection() === "rtl") page.setAttribute("dir", "rtl");
        else page.removeAttribute("dir");
        if (!asRun) {
            page.createDiv({
                cls: c("reader-count"),
                text: doc ? t(doc.format === "pdf" ? "reader_source_count_page" : "reader_source_count_chapter", String(index + 1), String(total)) : "",
            });
        }
        if (chapter?.section && !asRun) {
            page.createDiv({ cls: c("reader-role") }).createSpan({ cls: [c("reader-role-tag"), c("reader-role-tag--source")], text: chapter.section });
        }
        if (doc?.imageOnly) {
            // Said where you are, before you try (owner, 2026-10-06): a scan cannot be highlighted.
            const banner = page.createDiv({ cls: c("reader-source-banner"), attr: { role: "note" } });
            setIcon(banner.createSpan({ cls: c("reader-source-banner-icon") }), "scan-line");
            banner.createSpan({ cls: c("reader-source-banner-text"), text: t("reader_source_scanned") });
            const note = banner.createEl("button", { cls: c("reader-source-banner-action"), attr: { type: "button" }, text: t("reader_source_note_page") });
            component.registerDomEvent(note, "click", () => this.highlights?.notePage(note));
        } else if (this.sourceView === "page" && doc?.hasPageView) {
            const hint = page.createDiv({ cls: c("reader-source-hint") });
            hint.createSpan({ text: t("reader_source_page_hint") });
            const back = hint.createEl("button", { cls: c("reader-source-hint-action"), attr: { type: "button" }, text: t("reader_source_reading_view") });
            component.registerDomEvent(back, "click", () => this.toggleView());
        }
        const body = page.createDiv({
            cls: ["markdown-rendered", c("reader-body"), c("reader-source-body"), c(`reader-source-body--${doc?.format ?? "pdf"}`)].join(" "),
        });
        stage.scrollTop = 0;
        this.onStageScroll();
        // Links inside a book stay in the book, and only there (L1): one that leaves it is never followed.
        component.registerDomEvent(body, "click", (event) => this.onSourceLink(event), { capture: true });

        if (!doc && this.sourceTooLarge) {
            // One calm line in the page, and the way back to the shelf (FR-13, FR-23). Nothing is written.
            const large = body.createDiv({ cls: [c("reader-missing"), c("reader-too-large")] });
            large.createDiv({ cls: c("reader-too-large-text"), text: t("reader_source_too_large") });
            const shelf = large.createEl("button", { cls: c("reader-source-hint-action"), attr: { type: "button" }, text: t("reader_source_back_to_shelf") });
            component.registerDomEvent(shelf, "click", () => this.backToShelf(path));
            return;
        }
        if (!doc) {
            body.createDiv({ cls: c("reader-missing"), text: t(this.sourceFailed ? "reader_source_failed" : "reader_source_opening") });
            return;
        }
        const run = asRun ? this.ensureRun(doc) : null;
        if (run) {
            this.renderRunChapter(run, body, index, total);
            return;
        }
        this.dropRun();
        let picture = false;
        this.pageLanguage = null;
        try {
            const drawn = await doc.draw(index, body, component, this.sourceView);
            picture = drawn.picture;
            // The column says what it is written in, so it hyphenates by the book's rules (#757 FR-6).
            this.pageLanguage = readingLanguage({ format: doc.format, bookLanguage: doc.language, chapterLanguage: drawn.language });
            if (this.pageLanguage) body.setAttribute("lang", this.pageLanguage);
            this.chapterWords = drawn.words;
            this.seenWords.set(index, drawn.words);
        } catch (error) {
            log.error(`[Reader] could not draw ${path} at ${index}: ${error instanceof Error ? error.message : String(error)}`);
            if (generation === this.generation) body.createDiv({ cls: c("reader-missing"), text: t("reader_source_failed") });
        }
        if (generation !== this.generation) return;
        body.toggleClass(c("reader-source-body--picture"), picture);
        // A place asked for in this chapter — the way back from a jump, a bookmark (#718, #761) — is
        // landed on below, once the whole chapter (its end card too) is on the page.
        const landing = this.pendingLanding?.chapter === index ? this.pendingLanding : null;
        this.pendingLanding = null;
        if (landing) {
            this.pendingShare = null;
        } else if (this.pagedNow()) {
            // Landed once the chapter is laid out in pages, below.
        } else if (this.pendingShare !== null && index === this.index) {
            const share = this.pendingShare;
            this.pendingShare = null;
            stage.scrollTop = resumeScroll(share, stage.scrollHeight, stage.clientHeight);
            // Pictures arrive after the text and move the page: land again once they have — gliding
            // the little they moved it, never a jump (§XVI).
            stage.win.setTimeout(() => {
                if (generation === this.generation) this.pager?.glideTo(resumeScroll(share, stage.scrollHeight, stage.clientHeight));
            }, RESUME_SETTLE_MS);
        }
        // The shot from the Library lands here: the page is drawn, and at your place (#734).
        this.landShot();
        // An open search tints its matches in every chapter it lands on (#719).
        if (this.searchEl) this.markSearch();
        this.onStageScroll();
        this.watchFocus(body, component);
        // The highlights of this page or chapter, found again by their words (#681).
        void this.highlights?.attach(body, path, component, this.els?.margin ?? null, { at: index, label: this.sourceLabel(index) }).then(() => {
            if (generation !== this.generation || !this.pendingHighlight) return;
            if (this.highlights?.reveal(this.pendingHighlight)) this.pendingHighlight = null;
        });

        const card = page.createDiv({ cls: c("reader-next") });
        // The chapter's end, quietly (#724): an ornament that fades in as you arrive. No number.
        card.createDiv({ cls: c("reader-ornament"), attr: { "aria-hidden": "true" } }).createSpan({ cls: c("reader-ornament-mark") });
        this.nextCard = card;
        const next = card.createEl("button", { cls: c("reader-next-button"), attr: { type: "button" } });
        if (index === total - 1) {
            next.setText(t("reader_finish"));
            component.registerDomEvent(next, "click", () => this.finish());
        } else {
            next.createSpan({ cls: c("reader-next-label"), text: t("reader_next_named", this.sourceLabel(index + 1)) });
            component.registerDomEvent(next, "click", () => this.go(1));
        }
        // At once: the chapter turn already moved the camera. In pages, `layPages` lands it.
        if (landing) this.landHere(landing, false);
        this.layPages();
        this.onStageScroll();
        this.refreshRibbon();
    }

    /** Back to the shelf: the Library's own leaf as it was, or the Library opened on this source. */
    private backToShelf(path: string): void {
        if (this.back) {
            exitReader(this.app, this.leaf, this.back);
            return;
        }
        exitReader(this.app, this.leaf);
        void openLibrary(this.app, path);
    }

    /** A link inside a source: to another place in the book, or nowhere (#682, L1). */
    private onSourceLink(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.(`mark.${c("reader-highlight")}`)) return;
        const link = target?.closest?.("a") as HTMLElement | null;
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        const href = link.getAttribute("data-zf-href");
        const resolved = href ? this.source?.resolveLink?.(this.index, href) : null;
        if (!resolved) return;
        // A footnote is read where it is referenced (#718); anything else is a jump with a way back.
        const note = isNoteLink({
            text: link.textContent ?? "",
            noteref: link.getAttribute("data-zf-noteref") === "true",
            inSup: Boolean(link.closest?.("sup")),
        });
        if (note && resolved.fragment) {
            void this.openNote(link, resolved.chapter, resolved.fragment);
            return;
        }
        this.jumpTo(resolved.chapter, resolved.fragment, "link");
    }

    /** The note a footnote mark points at, in this chapter or another one (endnotes). */
    private async findNote(chapter: number, fragment: string): Promise<string | null> {
        const id = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(fragment) : fragment.replace(/["\\]/g, "");
        const selector = `[data-zf-id="${id}"]`;
        if (chapter === this.index) {
            const el = this.els?.page.querySelector<HTMLElement>(selector) ?? null;
            return el ? noteExcerpt(el) : null;
        }
        const doc = this.source;
        if (!doc) return null;
        // Drawn aside, never shown: the other chapter is read for its note and let go at once.
        const scratch = this.root?.createDiv();
        if (!scratch) return null;
        scratch.remove();
        const scope = new Component();
        scope.load();
        try {
            await doc.draw(chapter, scratch, scope, "reading");
            const el = scratch.querySelector<HTMLElement>(selector);
            return el ? noteExcerpt(el) : null;
        } catch (error) {
            log.debug(`[Reader] the note in chapter ${chapter} cannot be read: ${String(error)}`);
            return null;
        } finally {
            scope.unload();
        }
    }

    /** A footnote, floating over the page at its mark (#718). The page does not move. */
    private async openNote(link: HTMLElement, chapter: number, fragment: string): Promise<void> {
        const generation = this.generation;
        const text = await this.findNote(chapter, fragment);
        if (generation !== this.generation || !this.root) return;
        if (!text) {
            this.jumpTo(chapter, fragment, "note");
            return;
        }
        this.closeNote();
        const root = this.root;
        const pop = root.createDiv({ cls: c("reader-note-pop"), attr: { role: "dialog", "aria-label": t("reader_note_label") } });
        pop.createDiv({ cls: c("reader-note-pop-text"), text });
        const go = pop.createEl("button", { cls: c("reader-note-pop-go"), text: t("reader_note_go"), attr: { type: "button" } });
        const box = root.getBoundingClientRect();
        const at = link.getBoundingClientRect();
        // Positioned by two custom properties the stylesheet reads — no inline layout.
        pop.setCssProps?.({
            "--zf-note-x": `${Math.round(at.left + at.width / 2 - box.left)}px`,
            "--zf-note-y": `${Math.round(at.bottom - box.top)}px`,
        });
        const scope = new Component();
        scope.load();
        scope.registerDomEvent(go, "click", () => this.jumpTo(chapter, fragment, "note"));
        this.notePop = pop;
        this.notePopScope = scope;
    }

    // ── Page view, grown up (#767) ───────────────────────────────────────────

    /** A paper read as printed: in Page view, or a scan — which has no other view. Never the end card. */
    private runMode(): boolean {
        const doc = this.source;
        return Boolean(!this.ended && this.sourcePath && doc?.pages && (this.sourceView === "page" || doc.imageOnly));
    }

    /** In *Scroll* the run is one scroll of pages: a page change is a camera move, never a redraw. */
    private runScrolls(): boolean {
        return this.runMode() && Boolean(this.pageRun) && this.prefs.layout === "scroll";
    }

    /** The paper's run of pages, made once per paper and kept across the chapter's redraws. */
    private ensureRun(doc: SourceDocument): PdfPageRun | null {
        const pages = doc.pages;
        const stage = this.els?.stage;
        const path = this.sourcePath;
        if (!pages || !stage || !path) return null;
        if (this.pageRun && this.pageRun.pages === pages) return this.pageRun;
        this.dropRun();
        this.pageRun = new PdfPageRun(stage, {
            stage,
            pages,
            layout: () => this.prefs.layout,
            view: keptPageView(this.app, this.plugin, path),
            onPage: (page) => this.onRunPage(page),
            onView: (view) => {
                if (this.sourcePath) rememberPageView(this.app, this.plugin, this.sourcePath, view);
                this.renderZoom();
                if (this.panel === "type") this.renderPanel();
            },
            onLink: (target) => this.jumpToPage(target.page, target.share ?? 0, "link"),
            onOutLink: (url, anchor) => this.openOutLink(url, anchor),
            onCrop: () => {
                if (this.panel === "type") this.renderPanel();
            },
        });
        return this.pageRun;
    }

    /** Page view is over: the run's drawings are cancelled and its canvases let go (FR-14). */
    private dropRun(): void {
        const win = this.root?.win ?? window;
        win.clearTimeout(this.runPlaceTimer);
        win.clearTimeout(this.tapTimer);
        this.lastTap = null;
        this.runHighlightScope?.unload();
        this.runHighlightScope = null;
        if (!this.pageRun) return;
        this.thumbs?.dispose();
        this.thumbs = null;
        this.pageRun.dispose();
        this.pageRun = null;
        if (this.els) this.els.stage.scrollLeft = 0;
        this.renderZoom();
    }

    /** The bar's zoom level (FR-13): shown in Page view, as the run says it. */
    private renderZoom(): void {
        const button = this.els?.zoom;
        if (!button) return;
        const run = this.runMode() ? this.pageRun : null;
        button.toggleClass(c("reader-hidden"), !run);
        if (run) button.setText(zoomLabel(run.zoomLevel()));
    }

    /**
     * The page of a paper drawn as printed (#767): the run put in the body and shown at the page — at
     * the place a jump back, a bookmark or a resume asked for — then the end card. Page view reads the
     * Reader's own layout: *Scroll* is the whole run, *Page* and *Spread* a view of it.
     */
    private renderRunChapter(run: PdfPageRun, body: HTMLElement, index: number, total: number): void {
        const page = this.els?.page;
        if (!page) return;
        body.addClass(c("reader-source-body--picture"), c("reader-source-body--run"));
        run.attach(body);
        const landing = this.pendingLanding?.chapter === index ? this.pendingLanding : null;
        this.pendingLanding = null;
        const share = landing?.share ?? this.pendingShare ?? 0;
        this.pendingShare = null;
        this.chapterWords = 0;
        this.seenWords.set(index, 0);
        this.pageLanguage = null;
        run.show(index, share);
        this.landShot();
        this.renderZoom();
        this.attachRunHighlights();

        const card = page.createDiv({ cls: c("reader-next") });
        card.createDiv({ cls: c("reader-ornament"), attr: { "aria-hidden": "true" } }).createSpan({ cls: c("reader-ornament-mark") });
        this.nextCard = card;
        const next = card.createEl("button", { cls: c("reader-next-button"), attr: { type: "button" } });
        // In a scroll of pages the card is at the end of the paper; in pages, after the view on show.
        const after = this.prefs.layout === "scroll" ? total : run.stepFrom(index, 1);
        if (after >= total) {
            next.setText(t("reader_finish"));
            this.chapter?.registerDomEvent(next, "click", () => this.finish());
        } else {
            next.createSpan({ cls: c("reader-next-label"), text: t("reader_next_named", this.sourceLabel(after)) });
            this.chapter?.registerDomEvent(next, "click", () => this.go(1));
        }
        this.onStageScroll();
        this.refreshRibbon();
    }

    /**
     * The page most on screen changed as you scrolled (FR-8): the bar, the ribbon and the thumbnails
     * follow at once, the place and the margin a moment later — nothing is redrawn.
     */
    private onRunPage(page: number): void {
        if (page === this.index || !this.sourcePath) return;
        this.index = page;
        this.visited.add(`${this.sourcePath}#${page}`);
        this.renderBarPlace();
        this.refreshRibbon();
        this.thumbs?.setCurrent(page);
        const win = this.root?.win ?? window;
        win.clearTimeout(this.runPlaceTimer);
        this.runPlaceTimer = win.setTimeout(() => {
            if (!this.runMode()) return;
            this.rememberPlace();
            this.app.workspace.requestSaveLayout();
            this.attachRunHighlights();
        }, RUN_PLACE_MS);
    }

    /** The margin notes of the page most on screen (a scan's *Note this page* is about it). */
    private attachRunHighlights(): void {
        const body = this.chapterBody();
        const path = this.sourcePath;
        if (!body || !path || !this.highlights) return;
        this.runHighlightScope?.unload();
        const scope = new Component();
        scope.load();
        this.runHighlightScope = scope;
        void this.highlights.attach(body, path, scope, this.els?.margin ?? null, { at: this.index, label: this.sourceLabel(this.index) });
    }

    /** A page of the paper, as a camera move: along the run in a scroll, a turn in pages (§XVI). */
    private goToPage(page: number, share = 0, travel = true): void {
        const run = this.pageRun;
        const total = this.path?.chapters.length ?? 0;
        if (!run || total === 0) return;
        const target = Math.max(0, Math.min(page, total - 1));
        if (this.prefs.layout === "scroll" || run.inView(target)) {
            run.travelTo(target, share, travel && this.motionAllowed());
            if (target !== this.index && this.prefs.layout !== "scroll") {
                this.index = target;
                this.renderBarPlace();
            }
            return;
        }
        this.pendingShare = share;
        this.show(target);
    }

    /** A link to a place in the paper (FR-11): where you were is kept on the trail, then the page. */
    private jumpToPage(page: number, share: number, reason: TrailReason): void {
        this.leaveTrail(reason);
        this.closeNote();
        this.goToPage(page, share);
    }

    /**
     * A link that leaves the paper (FR-12, L1): never followed. Its address is shown beside it with
     * *Copy link* — the clipboard on a click, as the selection's *Copy* already is. Nothing opens.
     */
    private openOutLink(url: string, anchor: HTMLElement): void {
        const root = this.root;
        if (!root) return;
        this.closeNote();
        log.debug(`[Reader] a link out of the paper, shown and not followed: ${url}`);
        const pop = root.createDiv({ cls: [c("reader-note-pop"), c("reader-pv-outlink")], attr: { role: "dialog", "aria-label": t("reader_pv_link_out") } });
        pop.createDiv({ cls: c("reader-pv-outlink-says"), text: t("reader_pv_link_out") });
        pop.createDiv({ cls: c("reader-pv-outlink-url"), text: url });
        const copy = pop.createEl("button", { cls: c("reader-note-pop-go"), text: t("reader_pv_copy_link"), attr: { type: "button" } });
        const box = root.getBoundingClientRect();
        const at = anchor.getBoundingClientRect();
        pop.setCssProps?.({
            "--zf-note-x": `${Math.round(at.left + at.width / 2 - box.left)}px`,
            "--zf-note-y": `${Math.round(at.bottom - box.top)}px`,
        });
        const scope = new Component();
        scope.load();
        scope.registerDomEvent(copy, "click", () => {
            const clipboard = (root.win ?? window).navigator?.clipboard;
            void clipboard
                ?.writeText(url)
                ?.then(() => copy.setText(t("reader_pv_link_copied")))
                ?.catch((error: unknown) => log.debug(`[Reader] could not copy the link: ${String(error)}`));
        });
        this.notePop = pop;
        this.notePopScope = scope;
        this.wake();
    }

    /** The *Pages* tab (FR-10): every page, drawn as it comes into view, the current one marked. */
    private renderPages(list: HTMLElement): void {
        const run = this.runMode() ? this.pageRun : null;
        const scope = this.panelScope;
        if (!run || !scope) return;
        this.thumbs = renderThumbs(
            list,
            {
                count: run.pages.count,
                current: this.index,
                label: (page) => this.sourceLabel(page),
                ratio: (page) => run.thumbRatio(page),
                draw: (page, canvas, width, done) => run.drawThumb(page, canvas, width, done),
                onPick: (page, thumb) => this.flyToPage(page, thumb),
            },
            scope
        );
    }

    /**
     * A thumbnail becomes its page (FR-22, §XVI): the page is put on screen at once, and the thumbnail
     * flies from the grid to where it sits — as a cover becomes the book (#734). Under reduced motion
     * the page is simply there.
     */
    private flyToPage(page: number, thumb: HTMLElement): void {
        const run = this.pageRun;
        const root = this.root;
        if (!run || !root) return;
        const r = thumb.getBoundingClientRect();
        const from = { left: r.left, top: r.top, width: r.width, height: r.height };
        this.leaveTrail("contents");
        if (this.prefs.layout === "scroll" || run.inView(page)) {
            run.travelTo(page, 0, false);
            if (this.prefs.layout !== "scroll" && page !== this.index) {
                this.index = page;
                this.renderBarPlace();
            }
        } else {
            this.flight = true;
            this.show(page);
        }
        this.thumbs?.setCurrent(page);
        const to = run.slotRect(page);
        if (to && this.motionAllowed()) {
            const ghost = root.createDiv({ cls: c("reader-pv-ghost") });
            ghost.remove();
            const picture = thumb.querySelector("canvas");
            if (picture && picture.width > 0) {
                const copy = ghost.createEl("canvas");
                copy.width = picture.width;
                copy.height = picture.height;
                copy.getContext?.("2d")?.drawImage(picture, 0, 0);
            }
            fly(root, ghost, from, to, { duration: MOTION.cover });
        }
        // In a sheet the page is under the panel: it steps aside for the landing.
        if (this.panelIsSheet()) this.closePanel();
    }

    // ── search inside the book (#719) ───────────────────────────────────────

    /** Ctrl/Cmd+F or the bar's search: a slim bar under the top, focused. Books and papers only. */
    private openSearch(): boolean {
        if (!this.sourcePath || !this.root) return false;
        if (this.searchEl) {
            this.searchInput?.focus();
            this.searchInput?.select();
            return true;
        }
        // Search over the page keeps the chrome with it, in deep reading too (#764 FR-3, FR-5).
        this.wake();
        const scope = new Component();
        scope.load();
        this.searchScope = scope;
        const bar = this.root.createDiv({ cls: c("reader-search"), attr: { role: "search" } });
        const row = bar.createDiv({ cls: c("reader-search-row") });
        setIcon(row.createSpan({ cls: c("reader-search-icon") }), "search");
        const input = row.createEl("input", {
            cls: c("reader-search-input"),
            attr: { type: "search", placeholder: t("reader_search_placeholder"), "aria-label": t("reader_search") },
        });
        const count = row.createSpan({ cls: c("reader-search-count"), attr: { "aria-live": "polite" } });
        const button = (icon: string, key: LocaleKey, run: () => void) => {
            const el = row.createEl("button", { cls: ["clickable-icon", c("reader-search-button")].join(" "), attr: { type: "button", "aria-label": t(key) } });
            setIcon(el, icon);
            scope.registerDomEvent(el, "click", run);
        };
        button("chevron-up", "reader_search_previous", () => this.stepSearch(-1));
        button("chevron-down", "reader_search_next", () => this.stepSearch(1));
        button("x", "reader_search_close", () => this.closeSearch());
        const list = bar.createDiv({ cls: c("reader-search-results") });
        scope.registerDomEvent(input, "input", () => {
            list.removeClass(c("reader-search-results--folded"));
            const win = this.root?.win ?? window;
            win.clearTimeout(this.searchTimer);
            this.searchTimer = win.setTimeout(() => void this.runSearch(), SEARCH_DEBOUNCE_MS);
        });
        scope.registerDomEvent(input, "keydown", (event: KeyboardEvent) => {
            if (event.isComposing) return;
            if (event.key === "Enter") {
                event.preventDefault();
                this.stepSearch(event.shiftKey ? -1 : 1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                this.stepSearch(event.key === "ArrowUp" ? -1 : 1);
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.closeSearch();
            }
        });
        this.searchEl = bar;
        this.searchInput = input;
        this.searchCount = count;
        this.searchList = list;
        input.focus?.();
        void this.ensureSearchIndex();
        return true;
    }

    /** The book's text, read once per reading, chapter by chapter, yielding so the page never freezes. */
    private ensureSearchIndex(): Promise<string[] | null> {
        if (this.searchTexts) return Promise.resolve(this.searchTexts);
        if (this.searchBuilding) return this.searchBuilding;
        const doc = this.source;
        const root = this.root;
        if (!doc || !root || doc.imageOnly) return Promise.resolve(null);
        const generation = this.sourceGeneration;
        this.searchCount?.setText(t("reader_search_reading"));
        this.searchBuilding = (async () => {
            const texts: string[] = [];
            const win = root.win ?? window;
            for (let i = 0; i < doc.chapters.length; i++) {
                // Drawn aside, as the page draws it, so a match's offsets are the page's own.
                const scratch = root.createDiv();
                scratch.remove();
                const scope = new Component();
                scope.load();
                try {
                    await doc.draw(i, scratch, scope, "reading");
                    // As a reader sees it — blocks apart; where the walker finds no text node, what it reads.
                    texts.push(readableText(scratch) || (scratch.textContent ?? ""));
                } catch (error) {
                    log.debug(`[Reader] chapter ${i} cannot be read for search: ${String(error)}`);
                    texts.push("");
                } finally {
                    scope.unload();
                }
                if (generation !== this.sourceGeneration) return null;
                if (i % 4 === 3) await new Promise<void>((resolve) => win.setTimeout(resolve, 0));
            }
            this.searchTexts = texts;
            return texts;
        })();
        return this.searchBuilding;
    }

    private async runSearch(): Promise<void> {
        const query = this.searchInput?.value ?? "";
        const texts = await this.ensureSearchIndex();
        if (!this.searchEl || query !== (this.searchInput?.value ?? "")) return;
        if (!texts) {
            this.searchCount?.setText(t(this.source?.imageOnly ? "reader_search_scan" : "reader_search_unavailable"));
            return;
        }
        this.searchResult = searchBook(texts, query);
        this.searchAt = -1;
        // Another search: its first hit leaves its own place on the trail.
        this.searchLeft = false;
        this.renderSearch();
        this.markSearch();
    }

    /** The count and the list of results, each with its snippet and the source's own label. */
    private renderSearch(): void {
        const list = this.searchList;
        const count = this.searchCount;
        const scope = this.searchScope;
        const result = this.searchResult;
        if (!list || !count || !scope) return;
        list.empty();
        const query = (this.searchInput?.value ?? "").trim();
        if (!result || result.matches.length === 0) {
            count.setText(query.length < 2 ? "" : t("reader_search_none"));
            return;
        }
        const total = result.matches.length;
        const found = `${tCount(total, "reader_search_results", String(total))} · ${tCount(result.chapters, "reader_search_in_chapters", String(result.chapters))}`;
        count.setText(this.searchAt >= 0 ? `${t("reader_search_current", String(this.searchAt + 1), String(total))} · ${found}` : found);
        result.matches.slice(0, SEARCH_LIST_LIMIT).forEach((match, i) => {
            const row = list.createEl("button", {
                cls: [c("reader-search-result"), ...(i === this.searchAt ? [c("reader-search-result--current")] : [])].join(" "),
                attr: { type: "button" },
            });
            row.createDiv({ cls: c("reader-search-where"), text: this.sourceLabel(match.chapter) });
            const snippet = row.createDiv({ cls: c("reader-search-snippet") });
            snippet.createSpan({ text: match.before });
            snippet.createSpan({ cls: c("reader-search-snippet-hit"), text: match.match });
            snippet.createSpan({ text: match.after });
            scope.registerDomEvent(row, "click", () => this.goToMatch(i));
        });
    }

    private goToMatch(i: number): void {
        const match = this.searchResult?.matches[i];
        if (!match) return;
        this.searchAt = i;
        this.renderSearch();
        // Out of the way while you look at the match; typing brings the list back.
        this.searchList?.addClass(c("reader-search-results--folded"));
        // A search is a jump, in any chapter, with its way back (#718, #761 FR-6): the place you
        // searched from is kept once — stepping through its hits is one detour, not twenty.
        if (!this.searchLeft) this.searchLeft = this.leaveTrail("search");
        if (match.chapter !== this.index) {
            this.searchReveal = "land";
            this.closeNote();
            this.show(match.chapter);
        } else {
            // In this chapter the camera travels to the hit (§XVI).
            this.searchReveal = "travel";
            this.markSearch();
        }
    }

    /** Enter / Shift+Enter: the next match from where you are, wrapping round the book. */
    private stepSearch(direction: 1 | -1): void {
        const matches = this.searchResult?.matches ?? [];
        if (matches.length === 0) return;
        let next: number;
        if (this.searchAt < 0) {
            const ahead = matches.findIndex((match) => match.chapter >= this.index);
            next = direction > 0 ? (ahead < 0 ? 0 : ahead) : ahead <= 0 ? matches.length - 1 : ahead - 1;
        } else {
            next = (this.searchAt + direction + matches.length) % matches.length;
        }
        this.goToMatch(next);
    }

    /** Tint every match in the chapter on screen; outline the current one and bring it into view. */
    private markSearch(): void {
        this.unmarkSearch();
        const body = this.els?.page.querySelector<HTMLElement>(`.${c("reader-source-body")}`);
        const result = this.searchResult;
        if (!body || !result || result.matches.length === 0) return;
        const query = this.searchInput?.value ?? "";
        const here = result.matches.filter((match) => match.chapter === this.index);
        const current = this.searchAt >= 0 ? result.matches[this.searchAt] : null;
        // The current match by its place among this chapter's matches.
        const ordinal = current && current.chapter === this.index ? here.indexOf(current) : -1;
        // Found in the text as it reads (blocks apart), drawn on the page's own offsets.
        const readable = readableWithMap(body);
        const spans = matchesIn(readable.text, query).map((span) => ({ start: readable.toChapter(span.start), end: readable.toChapter(span.end) }));
        // Last first: wrapping a later match never moves the offsets of an earlier one.
        let currentMark: HTMLElement | null = null;
        for (let k = spans.length - 1; k >= 0; k--) {
            const isCurrent = k === ordinal;
            let foreign: HTMLElement | null = null;
            const marks = wrapSpan(
                body,
                spans[k],
                () => {
                    const mark = body.createSpan({ cls: [c("reader-search-hit"), ...(isCurrent ? [c("reader-search-hit--current")] : [])].join(" ") });
                    mark.remove();
                    return mark;
                },
                (root) => {
                    const el = root as unknown as HTMLElement;
                    el.addClass(c("reader-search-foreign"));
                    this.searchTints.push(el);
                    foreign ??= el;
                }
            ) as unknown as HTMLElement[];
            this.searchMarks.push(...marks);
            // A word in a drawing's label has no mark of its own: the drawing is where it is.
            if (isCurrent) currentMark = marks[0] ?? foreign;
        }
        if (currentMark && this.searchReveal) this.scrollToEl(currentMark, this.searchReveal === "travel");
        this.searchReveal = null;
    }

    private unmarkSearch(): void {
        for (const mark of this.searchMarks) unwrapMark(mark);
        this.searchMarks = [];
        for (const el of this.searchTints) el.removeClass(c("reader-search-foreign"));
        this.searchTints = [];
    }

    private closeSearch(): void {
        (this.root?.win ?? window).clearTimeout(this.searchTimer);
        this.unmarkSearch();
        this.searchEl?.remove();
        this.searchEl = null;
        this.searchInput = null;
        this.searchCount = null;
        this.searchList = null;
        this.searchScope?.unload();
        this.searchScope = null;
        this.searchResult = null;
        this.searchAt = -1;
        this.searchLeft = false;
    }

    private closeNote(): void {
        this.notePop?.remove();
        this.notePop = null;
        this.notePopScope?.unload();
        this.notePopScope = null;
    }

    /**
     * Bring an element a link named into view, once its chapter is drawn — travelling there in the
     * chapter on screen (#761 FR-15) — and show you are there (FR-17).
     */
    private scrollToFragment(fragment: string, travel: boolean, tries = 20): void {
        let el: HTMLElement | null = null;
        try {
            const id = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(fragment) : fragment.replace(/["\\]/g, "");
            el = this.els?.page.querySelector(`[data-zf-id="${id}"]`) as HTMLElement | null;
        } catch (error) {
            log.debug(`[Reader] cannot look for #${fragment}: ${String(error)}`);
            return;
        }
        if (el) {
            const body = this.chapterBody();
            const offset = body ? offsetAt(body, el, 0) : null;
            const here = body && offset !== null ? markHereAt(body, offset) : null;
            here?.after(this.hereDelay(this.scrollToEl(el, travel)));
            return;
        }
        if (tries > 0) window.setTimeout(() => this.scrollToFragment(fragment, travel, tries - 1), 50);
    }

    /** The source's own contents — a paper's outline, a book's nav — or its pages, when it has none. */
    private renderSourceContents(host: HTMLElement): void {
        const doc = this.source;
        if (!doc) return;
        // Everything you marked in this book, in one place (#721).
        const sourcePath = this.sourcePath;
        if (sourcePath) {
            const notebook = host.createEl("button", { cls: c("reader-notebook-link"), attr: { type: "button" } });
            setIcon(notebook.createSpan({ cls: c("reader-notebook-icon") }), "notebook-pen");
            notebook.createSpan({ text: t("notebook_title") });
            this.panelScope?.registerDomEvent(notebook, "click", () => void openLibrary(this.app, undefined, sourcePath));
        }
        const entries = doc.toc.length > 0 ? doc.toc : doc.chapters.map((chapter, i) => ({ title: chapter.label, chapter: i, depth: 0 }));
        // The entry you are in: the last one that starts at or before the chapter on screen.
        let current = -1;
        entries.forEach((entry, i) => {
            if (entry.chapter <= this.index) current = i;
        });
        entries.forEach((entry, i) => {
            const row = host.createEl("button", {
                cls: [c("reader-toc-row"), c(`reader-toc-row--depth-${Math.min(entry.depth, 3)}`), ...(i === current ? [c("reader-toc-row--current")] : [])].join(" "),
                attr: { type: "button" },
            });
            row.createSpan({ cls: c("reader-toc-name"), text: entry.title });
            if (doc.toc.length > 0) row.createSpan({ cls: c("reader-toc-role"), text: this.sourceLabel(entry.chapter) });
            if (i === current) row.setAttribute("aria-current", "step");
            // A Contents entry is a jump: where you were stays one press away (#718).
            this.panelScope?.registerDomEvent(row, "click", () =>
                this.jumpTo(entry.chapter, "fragment" in entry && typeof entry.fragment === "string" ? entry.fragment : undefined, "contents")
            );
        });
    }

    /** The end of a source: what the reading added up to, and where to take what you marked. */
    private renderSourceEndCard(): void {
        if (!this.els || !this.sourcePath) return;
        this.dropRun();
        this.highlights?.hidePopover();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;
        const path = this.sourcePath;
        const counts = this.highlights?.sessionCounts() ?? { highlights: 0, notes: 0 };
        renderSourceEnd(
            this.els.page,
            {
                title: this.source?.title ?? noteName(path),
                format: this.source?.format ?? "pdf",
                stats: {
                    minutes: Math.max(1, Math.round((Date.now() - this.startedAt) / 60000)),
                    chapters: Math.max(1, this.visited.size),
                    highlights: counts.highlights,
                    marginNotes: counts.notes,
                },
                actions: {
                    library: () => {
                        // From the Library: its own leaf comes back, on this book's detail (#733).
                        if (this.back) return exitReader(this.app, this.leaf, { ...this.back, detail: path });
                        exitReader(this.app, this.leaf);
                        void openLibrary(this.app, path);
                    },
                    think: () => {
                        exitReader(this.app, this.leaf, this.back);
                        void activateSurface(this.app, "zettelflow-home", "lab", { about: path });
                    },
                    again: () => this.show(0),
                },
            },
            component
        );
        this.els.stage.scrollTop = 0;
    }

    // ── panels ───────────────────────────────────────────────────────────────

    private toggle(panel: Exclude<Panel, null>): void {
        if (this.panel === panel) {
            this.closePanel();
            return;
        }
        this.panel = panel;
        this.renderPanel();
        // A panel open over the page keeps the chrome with it, in deep reading too (#764 FR-3).
        this.wake();
    }

    private renderPanel(): void {
        if (!this.els) return;
        const host = this.els.panel;
        // Where the Type panel's markers were, so the one that changed slides from there (#753 FR-14).
        const markers = this.panel === "type" ? snapshotMarkers(host) : undefined;
        this.thumbs?.dispose();
        this.thumbs = null;
        host.empty();
        this.panelScope?.unload();
        const scope = new Component();
        scope.load();
        this.panelScope = scope;
        host.toggleClass(c("reader-panel--open"), this.panel !== null);
        // In portrait on a tablet or a phone the panel is a bottom sheet (FR-7); a card everywhere else.
        const asSheet = this.panel !== null && this.panelIsSheet();
        host.toggleClass(c("reader-panel--sheet"), asSheet);
        if (asSheet) this.openSheet(host, scope);
        else this.dropSheet();
        if (this.panel === "contents") this.renderContents(host);
        else if (this.panel === "type") renderTypePanel(host, this.prefs, scope, (next) => this.savePrefs(next), markers, this.typeContext());
        else if (this.panel === "context") this.renderContext(host);
    }

    /** What the Type panel says besides its rows (#757): the language of the hyphens, Page view's note. */
    private typeContext() {
        const ui = getLanguage();
        const run = this.runMode() ? this.pageRun : null;
        return {
            hyphenatedAs: languageName(this.pageLanguage ?? ui, ui),
            pageView: Boolean(this.sourcePath && this.sourceView === "page" && this.source?.hasPageView),
            // Page view's own rows (#767 FR-13): shown in Page view only.
            ...(run
                ? {
                      pageRun: {
                          fit: run.framing(),
                          level: run.zoomLevel(),
                          across: run.isAcross(),
                          scroll: this.prefs.layout === "scroll",
                          onFit: (fit: "width" | "page") => run.frame(fit),
                          onZoom: (dir: 1 | -1) => run.zoomStep(dir),
                          onAcross: (across: boolean) => run.setAcross(across),
                          onRotate: () => run.rotate(),
                          // Crop margins (#769): a scan has no text to frame a page on, and says so.
                          crop: this.source?.imageOnly || !run.canCrop() ? ("unavailable" as const) : run.cropState(),
                          cropFailed: run.cropCouldNotMeasure(),
                          onCrop: (on: boolean) => void run.setCrop(on),
                      },
                  }
                : {}),
        };
    }

    private renderContents(host: HTMLElement): void {
        if (this.sourcePath) {
            this.renderSourceTabs(host);
            return;
        }
        host.createDiv({ cls: c("reader-panel-title"), text: t("reader_contents") });
        this.path?.chapters.forEach((chapter, i) => {
            const row = host.createEl("button", {
                cls: [c("reader-toc-row"), ...(i === this.index ? [c("reader-toc-row--current")] : [])].join(" "),
                attr: { type: "button" },
            });
            row.createSpan({ cls: c("reader-toc-number"), text: String(i + 1).padStart(2, "0") });
            row.createSpan({ cls: c("reader-toc-name"), text: noteName(chapter.path) });
            row.createSpan({ cls: c("reader-toc-role"), text: t(ROLE_KEY[chapter.role]) });
            if (i !== this.index && this.visited.has(chapter.path)) {
                const tick = row.createSpan({ cls: c("reader-toc-tick"), attr: { "aria-label": t("reader_visited") } });
                setIcon(tick, "check");
            }
            if (i === this.index) row.setAttribute("aria-current", "step");
            this.panelScope?.registerDomEvent(row, "click", () => this.show(i));
        });
    }

    /**
     * A book's or a paper's Contents (#761 FR-4): **Contents · Bookmarks · Where you've been**, as
     * tabs of Obsidian's own chips. Changing tab slides the list in from the side of the tab, in one
     * gesture (FR-16). No tab counts anything (FR-12).
     */
    private renderSourceTabs(host: HTMLElement): void {
        const tabs = host.createDiv({ cls: c("reader-tabs"), attr: { role: "tablist", "aria-label": t("reader_contents") } });
        // *Pages* is Page view's (#767 FR-10); anywhere else Contents opens on the contents.
        if (this.contentsTab === "pages" && !this.runMode()) this.contentsTab = "contents";
        for (const tab of CONTENTS_TABS.filter((entry) => entry.id !== "pages" || this.runMode())) {
            const on = tab.id === this.contentsTab;
            const button = tabs.createEl("button", {
                cls: [c("reader-tab"), ...(on ? ["is-active"] : [])].join(" "),
                attr: { type: "button", role: "tab", "aria-selected": String(on) },
                text: t(tab.label),
            });
            this.panelScope?.registerDomEvent(button, "click", () => this.chooseTab(tab.id));
        }
        const list = host.createDiv({ cls: c("reader-tab-list"), attr: { role: "tabpanel" } });
        if (this.contentsTab === "bookmarks") this.renderBookmarks(list);
        else if (this.contentsTab === "trail") this.renderTrail(list);
        else if (this.contentsTab === "pages") this.renderPages(list);
        else this.renderSourceContents(list);
        const dir = this.tabSlide;
        this.tabSlide = 0;
        if (dir !== 0 && motionWelcome(list)) {
            list.animate(
                [
                    { transform: `translateX(${dir * TAB_SLIDE_PX}px)`, opacity: 0 },
                    { transform: "translateX(0px)", opacity: 1 },
                ],
                { duration: MOTION.base, easing: MOTION.ease }
            );
        }
    }

    private chooseTab(tab: ContentsTab): void {
        if (tab === this.contentsTab) return;
        const order = (id: ContentsTab) => CONTENTS_TABS.findIndex((entry) => entry.id === id);
        this.tabSlide = order(tab) > order(this.contentsTab) ? 1 : -1;
        this.contentsTab = tab;
        this.renderPanel();
    }

    /** The book's bookmarks in reading order: where, the first words, when (FR-4); each removable. */
    private renderBookmarks(list: HTMLElement): void {
        const path = this.sourcePath;
        const marks = path ? inReadingOrder(sourceBookmarks(this.plugin, path)) : [];
        if (marks.length === 0) {
            list.createDiv({ cls: c("reader-empty"), text: t("reader_bookmarks_empty") });
            return;
        }
        const now = Date.now();
        for (const bookmark of marks) {
            const row = list.createDiv({ cls: c("reader-mark-row") });
            const go = row.createEl("button", { cls: c("reader-mark-go"), attr: { type: "button" } });
            go.createSpan({ cls: c("reader-mark-where"), text: this.sourceLabel(bookmark.chapter) });
            const snippet = bookmarkSnippet(bookmark);
            if (snippet) go.createSpan({ cls: c("reader-mark-snippet"), text: snippet });
            go.createSpan({ cls: c("reader-mark-when"), text: now - bookmark.at < NOW_MS ? t("reader_bookmark_now") : relativeLabel(bookmark.at, now) });
            this.panelScope?.registerDomEvent(go, "click", () => this.goToBookmark(bookmark));
            const remove = row.createEl("button", {
                cls: ["clickable-icon", c("reader-mark-remove")].join(" "),
                attr: { type: "button", "aria-label": t("reader_bookmark_row_remove") },
            });
            setIcon(remove, "x");
            this.panelScope?.registerDomEvent(remove, "click", () => this.saveBookmarks(removeBookmarks(sourceBookmarks(this.plugin, path ?? ""), [bookmark])));
        }
    }

    /** Where you've been, newest first, each with what took you away (FR-7). */
    private renderTrail(list: HTMLElement): void {
        const entries = this.trail.list();
        if (entries.length === 0) {
            list.createDiv({ cls: c("reader-empty"), text: t("reader_trail_empty") });
            return;
        }
        entries.forEach((entry, i) => {
            const row = list.createEl("button", { cls: c("reader-trail-row"), attr: { type: "button" } });
            row.createSpan({ cls: c("reader-trail-reason"), text: t(TRAIL_KEY[entry.reason]) });
            row.createSpan({ cls: c("reader-trail-where"), text: entry.label });
            this.panelScope?.registerDomEvent(row, "click", () => this.backTo(i));
        });
    }

    // ── bookmarks (#761) ─────────────────────────────────────────────────────

    /**
     * The ribbon, or **B**: bookmark the place you are reading — the chapter and the first line on
     * screen — or, on a screen that holds one, take it away. Writes plugin data only (FR-2).
     */
    private toggleBookmark(): boolean {
        const path = this.sourcePath;
        const body = this.chapterBody();
        if (!path || !this.source || this.ended || !body) return false;
        const list = sourceBookmarks(this.plugin, path);
        const here = this.bookmarksOnScreen(list, body);
        if (here.length > 0) {
            this.ribbonMotion("lift");
            this.saveBookmarks(removeBookmarks(list, here));
            return true;
        }
        // In a PDF's Page view a bookmark is its page (FR-5) — and in a scan, which has no other view.
        const pageView = this.sourceView === "page" || this.runMode();
        const anchor = pageView ? null : (this.pager?.firstVisible() ?? null);
        const offset = anchor ? (this.offsetOfAnchor(body, anchor) ?? 0) : 0;
        const text = pageView ? "" : chapterText(body);
        this.ribbonMotion("drop");
        this.saveBookmarks(addBookmark(list, bookmarkAt(text, this.index, offset, Date.now())));
        return true;
    }

    private saveBookmarks(list: Bookmark[]): void {
        if (!this.sourcePath) return;
        rememberSourceBookmarks(this.app, this.plugin, this.sourcePath, list);
        this.refreshRibbon();
        if (this.panel === "contents" && this.contentsTab === "bookmarks") this.renderPanel();
    }

    /** The bookmarks on the screen you are looking at (the whole page where it has no text). */
    private bookmarksOnScreen(list: readonly Bookmark[], body: HTMLElement): Bookmark[] {
        const mine = list.filter((bookmark) => bookmark.chapter === this.index);
        if (mine.length === 0 || !this.pager) return [];
        const text = chapterText(body);
        if (!text) return mine;
        return mine.filter((bookmark) => {
            const anchor = this.anchorAt(body, landingOffset(text, bookmark));
            return !anchor || this.pager?.onScreen(anchor) === true;
        });
    }

    /** A bookmark from the list: kept on the trail first, then the camera goes there (FR-15, FR-17). */
    private goToBookmark(bookmark: Bookmark): void {
        this.leaveTrail("bookmark");
        this.landOn({ chapter: bookmark.chapter, offset: bookmark.offset, share: 0, top: null, bookmark });
    }

    /**
     * The ribbon as it is for this screen: shown for a book or a paper being read, filled when the
     * screen holds a bookmark, and at the page's top-right corner. No count, ever (FR-12).
     */
    private refreshRibbon(): void {
        const ribbon = this.ribbon;
        if (!ribbon) return;
        const path = this.sourcePath;
        const body = this.chapterBody();
        const shown = Boolean(path && this.source && !this.ended && body);
        ribbon.toggleClass(c("reader-hidden"), !shown);
        if (!shown || !path || !body) return;
        const filled = this.bookmarksOnScreen(sourceBookmarks(this.plugin, path), body).length > 0;
        if (!this.ribbonLifting) ribbon.toggleClass(c("reader-ribbon--filled"), filled);
        ribbon.setAttribute("aria-pressed", String(filled));
        ribbon.setAttribute("aria-label", t(filled ? "reader_bookmark_remove" : "reader_bookmark_add"));
        // At the corner of what is on screen: the column, or the pages on show.
        const root = this.root?.getBoundingClientRect();
        const box = this.pager?.screenBox();
        if (root && box && box.width > 0) ribbon.setCssProps({ "--zf-ribbon-right": `${Math.max(0, Math.round(root.left + root.width - (box.left + box.width)))}px` });
    }

    /**
     * The ribbon drops into the book (250 ms, a small settle), or lifts back out of it (FR-14) — CSS
     * keyframes on transform alone; nothing under reduced motion.
     */
    private ribbonMotion(kind: "drop" | "lift"): void {
        const ribbon = this.ribbon;
        if (!ribbon) return;
        ribbon.removeClass(c("reader-ribbon--drop"));
        ribbon.removeClass(c("reader-ribbon--lift"));
        if (!this.motionAllowed()) return;
        void ribbon.offsetWidth;
        ribbon.addClass(c(`reader-ribbon--${kind}`));
        this.ribbonLifting = kind === "lift";
        (this.root?.win ?? window).setTimeout(() => {
            ribbon.removeClass(c(`reader-ribbon--${kind}`));
            if (kind === "lift") {
                this.ribbonLifting = false;
                this.refreshRibbon();
            }
        }, MOTION.base);
    }

    private renderContext(host: HTMLElement): void {
        host.createDiv({ cls: c("reader-panel-title"), text: t("reader_context") });
        if (this.sourcePath) {
            // A source has no neighbours in the graph: what is around a page is what you marked on it.
            if (this.panelScope) this.highlights?.renderList(host, this.panelScope);
            if (host.childElementCount <= 1) host.createDiv({ cls: c("reader-context-empty"), text: t("reader_source_context_empty") });
            return;
        }
        const index = KnowledgeIndex.getInstance();
        if (!this.path || index.status !== "ready") return;
        const map = buildEvidenceMap(index.getModel(), this.reading() ?? this.path.chapters[this.index].path);
        const list = (key: LocaleKey, paths: string[]) => {
            if (paths.length === 0) return;
            host.createDiv({ cls: c("reader-context-heading"), text: t(key) });
            for (const p of paths) {
                // Each is a peek too: read it here, take it as a detour, or add it to this reading.
                const row = host.createEl("button", { cls: c("reader-context-row"), attr: { type: "button" }, text: noteName(p) });
                const scope = this.panelScope;
                scope?.registerDomEvent(row, "click", () => this.openPeek(row, p, noteName(p)));
                hoverPreview(this.app, row, p, scope ?? this);
            }
        };
        // Your highlights here too: the margin only has room on a wide pane (#671).
        if (this.panelScope) this.highlights?.renderList(host, this.panelScope);
        list("reader_supports", map.supports);
        list("reader_argues", map.contradicts);
        list("reader_questions", map.gaps.openQuestions);
        if (map.supports.length + map.contradicts.length + map.gaps.openQuestions.length === 0) {
            host.createDiv({ cls: c("reader-context-empty"), text: t("reader_context_empty") });
        }
    }

    // ── the panel as a bottom sheet (#750 D5) ────────────────────────────────

    /** Whether the panel opens as a sheet now: a mobile reading taller than it is wide. */
    private panelIsSheet(): boolean {
        const box = this.root?.getBoundingClientRect();
        return Boolean(box) && panelShape({ width: box?.width ?? 0, height: box?.height ?? 0, mobile: Platform.isMobile }) === "sheet";
    }

    /** The status bar's height — the sheet's full height stays below it. */
    private safeTop(): number {
        const root = this.root;
        const value = root ? root.win?.getComputedStyle?.(root)?.getPropertyValue?.("--safe-area-inset-top") : "";
        return parseFloat(value ?? "") || 0;
    }

    /**
     * Shape the panel as a sheet: anchored to the bottom, at half height on opening (or where you left
     * it while it stays open), a grab handle on top, and the page behind dimmed. Its height is a
     * transform (`--zf-sheet-y`), so opening, dragging and settling never lay anything out (FR-20).
     */
    private openSheet(host: HTMLElement, scope: Component): void {
        const root = this.root;
        if (!root) return;
        const snaps = sheetSnaps(root.getBoundingClientRect().height, this.safeTop());
        const kept = this.sheet?.height ?? 0;
        this.sheet = { height: kept > 0 ? Math.min(kept, snaps.full) : snaps.half, snaps };
        host.removeClass(c("reader-panel--closing"));
        host.setCssProps({ "--zf-sheet-full": `${snaps.full}px`, "--zf-sheet-ms": `${MOTION.base}ms` });
        this.placeSheet();
        if (!this.scrim) {
            const scrim = root.createDiv({ cls: c("reader-sheet-scrim"), attr: { "aria-hidden": "true" } });
            root.insertBefore(scrim, host);
            this.scrim = scrim;
        }
        // A tap on the page above closes the sheet. The dim stays across renders; its listener goes
        // with each one.
        scope.registerDomEvent(this.scrim, "click", () => this.closePanel());
        const handle = host.createDiv({ cls: c("reader-sheet-handle"), attr: { role: "button", tabindex: "0", "aria-label": t("reader_sheet_handle") } });
        handle.createSpan({ cls: c("reader-sheet-grip") });
        scope.registerDomEvent(handle, "pointerdown", (event: PointerEvent) => this.dragSheet(event, handle));
    }

    /** The sheet at its height: a translation of its full height, never a new height. */
    private placeSheet(): void {
        const sheet = this.sheet;
        if (!sheet) return;
        this.els?.panel.setCssProps({ "--zf-sheet-y": `${Math.round(sheet.snaps.full - sheet.height)}px` });
    }

    /**
     * The handle follows the finger 1:1 — under reduced motion too: direct manipulation is not
     * animation — rubber-bands past the top, and on release settles to the nearest height at the speed
     * it was let go, or closes.
     */
    private dragSheet(down: PointerEvent, handle: HTMLElement): void {
        const sheet = this.sheet;
        const host = this.els?.panel;
        if (!sheet || !host) return;
        down.preventDefault?.();
        handle.setPointerCapture?.(down.pointerId);
        const from = sheet.height;
        const startY = down.clientY;
        let last = { y: down.clientY, t: down.timeStamp };
        let velocity = 0;
        host.addClass(c("reader-panel--dragging"));
        const move = (event: PointerEvent) => {
            const dt = event.timeStamp - last.t;
            if (dt > 0) velocity = (last.y - event.clientY) / dt;
            last = { y: event.clientY, t: event.timeStamp };
            sheet.height = dragSheet(from, event.clientY - startY, sheet.snaps);
            this.placeSheet();
        };
        const up = () => {
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", up);
            handle.removeEventListener("pointercancel", up);
            handle.removeEventListener("lostpointercapture", up);
            if (!host.hasClass(c("reader-panel--dragging"))) return;
            host.removeClass(c("reader-panel--dragging"));
            const stop = settleSheet(sheet.height, velocity, sheet.snaps);
            const target = stop === "closed" ? 0 : sheet.snaps[stop];
            const ms = settleDuration(target - sheet.height, velocity);
            host.setCssProps({ "--zf-sheet-ms": `${ms}ms` });
            if (stop === "closed") {
                this.closePanel(ms);
                return;
            }
            sheet.height = target;
            this.placeSheet();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
        // A capture lost without an up (the system took the touch) ends the drag too.
        handle.addEventListener("lostpointercapture", up);
    }

    /** Close the panel. A sheet slides down and away first; a card, or reduced motion, goes at once. */
    private closePanel(ms: number = MOTION.base): void {
        const host = this.els?.panel;
        if (!host || !this.panel) return;
        if (!host.hasClass(c("reader-panel--sheet")) || !this.motionAllowed()) {
            this.panel = null;
            this.renderPanel();
            return;
        }
        host.setCssProps({ "--zf-sheet-ms": `${ms}ms` });
        host.addClass(c("reader-panel--closing"));
        this.scrim?.addClass(c("reader-sheet-scrim--closing"));
        const panel = this.panel;
        (this.root?.win ?? window).setTimeout(() => {
            if (this.panel !== panel || !host.hasClass(c("reader-panel--closing"))) return;
            this.panel = null;
            this.renderPanel();
        }, ms);
    }

    /** No sheet: its dim goes with it. */
    private dropSheet(): void {
        this.sheet = null;
        this.scrim?.remove();
        this.scrim = null;
        this.els?.panel.removeClass(c("reader-panel--closing"));
        this.els?.panel.removeClass(c("reader-panel--dragging"));
    }

    // ── the place in the text, kept through a reshape (#750 D3) ──────────────

    /** The chapter's blocks, in the stage's scroll coordinates; a lone wrapper is looked into. */
    /** The chapter's blocks, as elements: the body's children, past a wrapper or two. */
    private blockElements(): HTMLElement[] {
        let parent = this.els?.page.querySelector<HTMLElement>(`.${c("reader-body")}`) ?? null;
        if (!parent) return [];
        for (let depth = 0; depth < 3 && parent.children.length === 1 && (parent.firstElementChild?.children.length ?? 0) > 1; depth++) {
            parent = parent.firstElementChild as HTMLElement;
        }
        return Array.from(parent.children) as HTMLElement[];
    }

    private blocks(): PlaceBox[] {
        const stage = this.els?.stage;
        if (!stage) return [];
        const origin = stage.getBoundingClientRect().top - stage.scrollTop;
        return this.blockElements().map((el) => {
            const box = el.getBoundingClientRect();
            return { top: box.top - origin, height: box.height };
        });
    }

    /** The line you are reading, noted a moment after the scroll stops. */
    private notePlace(): void {
        const win = this.root?.win;
        if (!win) return;
        win.clearTimeout(this.placeTimer);
        this.placeTimer = win.setTimeout(() => {
            const stage = this.els?.stage;
            const blocks = this.blocks();
            this.place = stage && blocks.length > 0 ? placeAt(blocks, stage.scrollTop) : null;
            // Whether this screen holds a bookmark (#761 FR-1).
            this.refreshRibbon();
        }, PLACE_SAVE_MS);
    }

    /** Rotation, Split View, a window resized: the reading's shape is watched in its own window. */
    private watchShape(root: HTMLElement): void {
        const Observer = (root.win as unknown as { ResizeObserver?: typeof ResizeObserver } | undefined)?.ResizeObserver;
        if (!Observer) return;
        const observer = new Observer(() => this.onReshape());
        observer.observe(root);
        this.register(() => observer.disconnect());
    }

    /** The line you were reading stays in view, and an open panel takes the new shape (FR-11). */
    private onReshape(): void {
        const root = this.root;
        const stage = this.els?.stage;
        if (!root || !stage) return;
        const box = root.getBoundingClientRect();
        const next = { width: Math.round(box.width), height: Math.round(box.height) };
        if (next.width === this.shape.width && next.height === this.shape.height) return;
        const first = this.shape.width === 0 && this.shape.height === 0;
        this.shape = next;
        if (first) return;
        // A paper in Page view lays its pages out again, the page you were on kept (#767).
        if (this.runMode() && this.pageRun) {
            this.pageRun.reshape();
            if (this.panel) this.renderPanel();
            return;
        }
        // In pages the pager lays the chapter out again on its own observer, keeping the line (#753).
        if (this.pagedNow()) {
            if (this.panel) this.renderPanel();
            return;
        }
        const blocks = this.blocks();
        if (this.place && blocks.length > 0) stage.scrollTop = scrollFor(this.place, blocks);
        if (this.panel) this.renderPanel();
        this.refreshRibbon();
    }

    // ── touch: tap the edges, swipe a chapter (#750) ─────────────────────────

    private wireTouch(stage: HTMLElement): void {
        // Obsidian's drawer swipe starts anywhere on the workspace and steps aside for a touch inside an
        // element marked `data-ignore-swipe` (T0, see `coverApp`). A touch on the page is the page's;
        // one in the strip at either edge of the screen stays Obsidian's and iPadOS's (FR-3).
        this.registerDomEvent(
            stage,
            "touchstart",
            (event: TouchEvent) => {
                const x = event.touches?.[0]?.clientX;
                const width = stage.win?.innerWidth ?? 0;
                const ours = typeof x === "number" && x >= SYSTEM_EDGE_PX && (width <= 0 || x <= width - SYSTEM_EDGE_PX);
                if (ours) stage.setAttribute("data-ignore-swipe", "true");
                else stage.removeAttribute("data-ignore-swipe");
            },
            { passive: true }
        );
        // A swipe that has locked is the page's alone: nothing scrolls or swipes under it (FR-4).
        this.registerDomEvent(
            stage,
            "touchmove",
            (event: TouchEvent) => {
                if (this.touch?.gesture.kind === "swipe" && event.cancelable) event.preventDefault();
            },
            { passive: false }
        );
        this.registerDomEvent(stage, "pointerdown", (event: PointerEvent) => this.onPointerDown(event));
        this.registerDomEvent(stage, "pointermove", (event: PointerEvent) => this.onPointerMove(event));
        this.registerDomEvent(stage, "pointerup", (event: PointerEvent) => this.onPointerUp(event));
        this.registerDomEvent(stage, "pointercancel", (event: PointerEvent) => {
            // The system took a finger (a pinch, a gesture of its own): no two-finger back from it.
            this.fingers.delete(event?.pointerId);
            this.twoFinger = null;
            this.dropTouch();
        });
        // The click a handled tap leaves behind would follow what the page just turned past.
        this.registerDomEvent(
            stage,
            "click",
            (event: MouseEvent) => {
                if (Date.now() > this.swallowClickUntil) return;
                this.swallowClickUntil = 0;
                event.preventDefault();
                event.stopPropagation();
            },
            { capture: true }
        );
    }

    /** Words are selected: a tap is the selection's, never a turn (FR-2). */
    private hasSelection(): boolean {
        const selection = this.root?.win?.getSelection?.();
        return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
    }

    private onPointerDown(event: PointerEvent): void {
        if (event.pointerType) this.lastPointerType = event.pointerType;
        // Two fingers on the page are the trail's way back (#761 FR-10), never a turn: whatever the
        // first finger had started goes back.
        if (touchPointer(event)) {
            this.fingers.set(event.pointerId, { x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY });
            if (this.fingers.size >= 2) {
                this.dropTouch();
                this.twoFinger ??= [];
                return;
            }
        }
        this.dropTouch();
        const stage = this.els?.stage;
        // A mouse or a trackpad: desktop is unchanged (FR-1).
        if (!stage || !touchPointer(event)) return;
        if (isThing(event.target as Element | null, this.hasSelection())) return;
        const gesture = startGesture(event, stage.win?.innerWidth ?? 0);
        if (!gesture) return;
        this.touch = { gesture, stage: stage.getBoundingClientRect(), dir: 0, scrub: null, rubber: false, paging: false, frame: false };
    }

    private onPointerMove(event: PointerEvent): void {
        const finger = this.fingers.get(event.pointerId);
        if (finger) {
            finger.x = event.clientX;
            finger.y = event.clientY;
        }
        if (this.twoFinger) return;
        const touch = this.touch;
        if (!touch || !touchPointer(event)) return;
        const kind = touch.gesture.update({ x: event.clientX, y: event.clientY, t: event.timeStamp });
        // A scroll is the browser's (touch-action: pan-y), a long press the system's selection.
        if (kind === "scroll" || kind === "press") {
            this.touch = null;
            return;
        }
        if (kind !== "swipe") return;
        // A paper in a scroll of pages, or zoomed wider than the screen, pans under the finger (#767).
        if (this.pageRun && this.runMode() && (this.prefs.layout === "scroll" || this.pageRun.overflowsAcross())) {
            this.touch = null;
            return;
        }
        if (touch.dir === 0) this.beginSwipe(touch);
        this.requestTouchFrame(touch);
    }

    private onPointerUp(event: PointerEvent): void {
        const finger = this.fingers.get(event.pointerId);
        this.fingers.delete(event.pointerId);
        if (this.twoFinger) {
            if (finger) this.twoFinger.push({ dx: event.clientX - finger.x0, dy: event.clientY - finger.y0 });
            if (this.fingers.size > 0) return;
            const moves = this.twoFinger;
            this.twoFinger = null;
            this.swallowClickUntil = Date.now() + TAP_CLICK_MS;
            // Both fingers swept right: one step back along the trail.
            // A pinch in Page view is a zoom, never the way back (#767).
            if (twoFingerBack(moves) && !this.pageRun?.pinchedRecently()) this.backFromJump();
            return;
        }
        const touch = this.touch;
        this.touch = null;
        if (!touch || !touchPointer(event)) return;
        const kind = touch.gesture.end({ x: event.clientX, y: event.clientY, t: event.timeStamp });
        if (kind === "tap") {
            this.swallowClickUntil = Date.now() + TAP_CLICK_MS;
            this.tapAt(event.clientX, touch.stage, event.clientY);
            return;
        }
        if (kind !== "swipe") return;
        this.swallowClickUntil = Date.now() + TAP_CLICK_MS;
        if (touch.dir === 0) this.beginSwipe(touch);
        this.applyTouch(touch);
        this.releaseSwipe(touch);
    }

    /** The outer fifth on each side turns a screen, as Space does; the middle shows or hides the bar. */
    private tapAt(x: number, stage: { left: number; width: number }, y = 0): void {
        // Page view (#767 FR-2): two quick taps zoom about where you tapped, so a single one waits a moment.
        const run = this.runMode() ? this.pageRun : null;
        if (run) {
            const win = this.root?.win ?? window;
            const now = Date.now();
            const last = this.lastTap;
            win.clearTimeout(this.tapTimer);
            if (last && now - last.at < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < DOUBLE_TAP_PX) {
                this.lastTap = null;
                run.doubleTap({ x, y });
                return;
            }
            this.lastTap = { at: now, x, y };
            this.tapTimer = win.setTimeout(() => {
                this.lastTap = null;
                this.singleTap(x, stage);
            }, DOUBLE_TAP_MS);
            return;
        }
        this.singleTap(x, stage);
    }

    private singleTap(x: number, stage: { left: number; width: number }): void {
        const zone = edgeZone(x, stage);
        // In pages the edge the book turns towards is forward: the left one in a right-to-left book.
        if (zone === "middle") this.toggleBar();
        else this.page(edgeTurn(zone, this.effectiveLayout(), this.bookDirection()));
    }

    /** Whether a turn `dir` lands on a chapter: never past the first, nor past the last (FR-18). */
    private canTurn(dir: 1 | -1): boolean {
        if (!this.path) return false;
        if (this.ended) return dir < 0;
        const next = this.index + dir;
        return next >= 0 && next < this.path.chapters.length;
    }

    /** The name of the chapter a turn `dir` leads to, shown on the paper under the sheet. */
    private turnLabel(dir: 1 | -1): string {
        if (!this.path) return "";
        const i = this.ended ? this.index : this.index + dir;
        if (this.sourcePath) return this.sourceLabel(i);
        return noteName(this.path.chapters[i]?.path ?? "");
    }

    /** The swipe has locked: hold the chapter's turn under the finger, or resist at an end of the book. */
    private beginSwipe(touch: TouchState): void {
        const pager = this.pagedNow() ? this.pager : null;
        const dir: 1 | -1 = pager ? dragDirection(touch.gesture.dx, this.bookDirection()) || 1 : touch.gesture.dx < 0 ? 1 : -1;
        touch.dir = dir;
        this.closeNote();
        this.highlights?.hidePopover();
        if (!this.root || !this.els) return;
        // In pages (#753 FR-13) the strip is in your hand while there is a page that way, and resists
        // at the book's ends; past a chapter's last page the chapter's own turn takes over, as in a scroll.
        if (pager && (pager.canTurn(dir) || !this.canTurn(dir))) {
            touch.paging = true;
            return;
        }
        if (!this.canTurn(dir)) {
            touch.rubber = true;
            this.els.stage.addClass(c("reader-stage--rubber"));
            return;
        }
        const motion = readingMotion(this.plugin?.settings?.readingMotion).chapter;
        touch.scrub = beginChapterScrub(this.root, this.els.stage, this.els.page, motion, dir, this.turnLabel(dir));
    }

    /** Moves are drawn once a frame, from the reader's own window (popout-safe). */
    private requestTouchFrame(touch: TouchState): void {
        const stage = this.els?.stage;
        if (touch.frame || !stage) return;
        touch.frame = true;
        stage.win.requestAnimationFrame(() => {
            touch.frame = false;
            if (this.touch === touch) this.applyTouch(touch);
        });
    }

    /** Where the finger has the page: the turn's progress, or a third of the way at an end. */
    private applyTouch(touch: TouchState): void {
        const dx = touch.gesture.dx;
        if (touch.paging) this.pager?.drag(dx);
        else if (touch.scrub) touch.scrub.scrub(Math.max(0, -touch.dir * dx) / Math.max(1, touch.stage.width));
        else if (touch.rubber) this.els?.stage.setCssProps({ "--zf-scrub-x": `${Math.round(rubberBand(dx))}px` });
    }

    /** Let go: past a third or on a flick the chapter turns at that speed; short of it, it springs back. */
    private releaseSwipe(touch: TouchState): void {
        const { dx, vx } = touch.gesture;
        if (touch.paging) {
            this.pager?.release(vx);
            return;
        }
        if (touch.rubber) {
            this.springPage(rubberBand(dx));
            return;
        }
        const width = touch.stage.width;
        // A finger that came back past where it started turns nothing.
        const outcome = Math.sign(dx) === -touch.dir ? releaseTurn({ dx, width, vx }) : "spring";
        if (outcome === "spring") {
            touch.scrub?.release("spring");
            return;
        }
        const progress = Math.max(0, -touch.dir * dx) / Math.max(1, width);
        touch.scrub?.release("complete", completionRate(progress, vx, width, touch.scrub.duration));
        // In pages, back into the previous chapter lands on its last page (#753 FR-2).
        this.go(touch.dir, this.pagedNow() && touch.dir < 0 ? "end" : "start");
    }

    /**
     * The end of the book: the page comes back from a third of the finger, in the shared beat. The
     * stage moves, not the page inside it — a page translated inside its scroller would overflow it.
     */
    private springPage(x: number): void {
        const stage = this.els?.stage;
        if (!stage) return;
        stage.removeClass(c("reader-stage--rubber"));
        stage.setCssProps({ "--zf-scrub-x": "0px" });
        if (x === 0 || typeof stage.animate !== "function" || !this.motionAllowed()) return;
        stage.animate([{ transform: `translateX(${Math.round(x)}px)` }, { transform: "translateX(0px)" }], { duration: SPRING_MS, easing: MOTION.ease });
    }

    /** A gesture the system took (a scroll, a cancel): whatever it held goes back. */
    private dropTouch(): void {
        const touch = this.touch;
        this.touch = null;
        if (!touch) return;
        if (touch.paging) this.pager?.release(0, "spring");
        touch.scrub?.release("spring");
        if (touch.rubber) this.springPage(rubberBand(touch.gesture.dx));
    }

    /**
     * A tap in the middle of the page: the bar, or the page alone. A bar a finger asked for stays until
     * the next tap — it does not fade under a finger on its way to a button.
     */
    private toggleBar(): void {
        const root = this.root;
        if (!root) return;
        if (root.hasClass(c("reader--idle"))) {
            this.wake(true);
            return;
        }
        (root.win ?? window).clearTimeout(this.idleTimer);
        if (this.idleAllowed()) root.addClass(c("reader--idle"));
    }

    // ── keys, idle bar ───────────────────────────────────────────────────────

    /**
     * The reader's keys, on its own scope (#667). Each handler says whether it took the key: taken,
     * Obsidian stops it there (`false`); not taken — typing in a note field, nothing selected for H —
     * it goes on to the app. Esc is always taken while the reader is up, or Obsidian's own Esc would
     * hand the focus to another tab instead of closing this one.
     */
    private registerKeys(scope: Scope): void {
        const none: Modifier[] = [];
        const shift: Modifier[] = ["Shift"];
        const bind = (modifiers: Modifier[] | null, key: string, run: () => boolean) =>
            scope.register(modifiers, key, (event: KeyboardEvent) => {
                if (isTyping(event.target)) return true;
                // In deep reading the keys that read turn quietly; any other brings the chrome back (FR-3, FR-4).
                const quiet = this.deep && isReadingKey(event.key, { shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey });
                if (!quiet) this.wake();
                return !run();
            });
        const taken = (fn: () => void) => () => {
            fn();
            return true;
        };
        // What a turning key means depends on the layout and the book's direction (#753): in a scroll
        // the arrows are the chapters and Space a screen, as always; in pages they all turn a page.
        const turning = (key: string, shifted: boolean) => taken(() => this.runIntent(keyIntent(this.effectiveLayout(), key, shifted, this.bookDirection())));
        bind(none, "ArrowRight", turning("ArrowRight", false));
        bind(none, "PageDown", turning("PageDown", false));
        bind(none, "ArrowLeft", turning("ArrowLeft", false));
        bind(none, "PageUp", turning("PageUp", false));
        bind(none, "ArrowDown", taken(() => this.scrollStage(0.12)));
        bind(none, "ArrowUp", taken(() => this.scrollStage(-0.12)));
        bind(none, " ", turning(" ", false));
        bind(shift, " ", turning(" ", true));
        bind(none, "Home", taken(() => this.show(0)));
        bind(none, "End", taken(() => this.show((this.path?.chapters.length ?? 1) - 1)));
        // Deep reading, in and out (#764 FR-1).
        bind(none, "F", taken(() => this.toggleDeep()));
        bind(none, "V", () => {
            if (!this.source?.hasPageView) return false;
            this.toggleView();
            return true;
        });
        // H keeps the selection as a highlight; Shift+H asks for a note with it (#671).
        bind(none, "H", () => this.highlights?.highlightCurrent(false) ?? false);
        bind(shift, "H", () => this.highlights?.highlightCurrent(true) ?? false);
        // B bookmarks the place you are reading, or takes the bookmark on this screen away (#761).
        bind(none, "B", () => this.toggleBookmark());
        // 1–4 with words selected: keep them as an idea, a question, a quote, or to discuss (#720).
        for (const n of [1, 2, 3, 4]) bind(none, String(n), () => this.highlights?.chooseMeaning(n - 1) ?? false);
        // `?` is Shift+/ on one layout and its own key on another: any modifiers.
        bind(null, "?", taken(() => this.toggleShortcuts()));
        bind(none, "Escape", taken(() => this.escape()));
        // Back from a jump inside a book (#718); with nowhere to go back to, Obsidian keeps the key.
        bind(["Alt"], "ArrowLeft", () => this.backFromJump());
        // Search inside the book (#719); in a note reading the key stays Obsidian's.
        bind(["Mod"], "F", () => this.openSearch());
        // Page view zooms (#767 FR-2). Taken here, Obsidian's own app zoom gives way — walked on 1.14.4:
        // the View menu's accelerators do not fire once the page has the key. Anywhere else it is the app's.
        const zoom = (fn: (run: PdfPageRun) => void) => () => {
            const run = this.runMode() ? this.pageRun : null;
            if (!run) return false;
            fn(run);
            return true;
        };
        for (const key of ["=", "+"]) {
            bind(["Mod"], key, zoom((run) => run.zoomStep(1)));
            bind(["Mod", "Shift"], key, zoom((run) => run.zoomStep(1)));
        }
        bind(["Mod"], "-", zoom((run) => run.zoomStep(-1)));
        bind(["Mod"], "0", zoom((run) => run.frame("width")));
    }

    /** Esc: one thing at a time, nearest first — then deep reading, then the reader itself (#764 FR-6). */
    private escape(): void {
        const step = escapeStep({
            shortcuts: Boolean(this.shortcuts),
            note: Boolean(this.notePop),
            search: Boolean(this.searchEl),
            popover: Boolean(this.highlights?.hasPopover()),
            peek: Boolean(this.peek),
            detour: this.detours.length > 0,
            panel: Boolean(this.panel),
            deep: this.deep,
        });
        switch (step) {
            case "shortcuts":
                return this.closeShortcuts();
            case "note":
                return this.closeNote();
            case "search":
                return this.closeSearch();
            case "popover":
                return this.highlights?.hidePopover();
            case "peek":
                return this.closePeek();
            case "detour":
                return void this.backFromDetour();
            case "panel":
                return this.closePanel();
            case "deep":
                return this.leaveDeep();
            case "exit":
                return this.exit();
        }
    }

    /**
     * Space: a screen further down the chapter, and the next chapter once you are at its end —
     * Shift+Space the same, backwards. Reading never needs the mouse.
     */
    private page(direction: 1 | -1): void {
        const stage = this.els?.stage;
        if (!stage || this.ended) {
            this.go(direction);
            return;
        }
        // In pages (#753 FR-2): a page, two in a spread, and past the chapter's last page the next
        // chapter, through the same `go`; back from the first page lands on the previous one's last.
        const pager = this.pagedNow() ? this.pager : null;
        if (pager) {
            if (!pager.turn(direction)) this.go(direction, direction < 0 ? "end" : "start");
            return;
        }
        const fraction = readFraction(stage.scrollTop, stage.scrollHeight, stage.clientHeight);
        const canScroll = scrolls(stage.scrollHeight, stage.clientHeight);
        if (!canScroll || (direction > 0 ? fraction >= END_OF_CHAPTER : stage.scrollTop <= 0)) {
            this.go(direction);
            return;
        }
        this.scrollStage(direction * 0.85);
    }

    /** Scroll the page by a share of its own height — smoothly, unless motion is reduced. */
    private scrollStage(share: number): void {
        const stage = this.els?.stage;
        if (!stage) return;
        const top = Math.round((stage.clientHeight || 0) * share);
        if (typeof stage.scrollBy === "function") stage.scrollBy({ top, behavior: this.motionAllowed() ? "smooth" : "auto" });
        else stage.scrollTop = Math.max(0, stage.scrollTop + top);
    }

    // ── the shortcuts sheet ──────────────────────────────────────────────────

    private toggleShortcuts(): void {
        if (this.shortcuts) this.closeShortcuts();
        else this.openShortcuts();
    }

    private openShortcuts(): void {
        const root = this.root;
        if (!root) return;
        const sheet = root.createDiv({
            cls: c("reader-shortcuts"),
            attr: { role: "dialog", "aria-modal": "true", "aria-label": t("reader_shortcuts") },
        });
        const card = sheet.createDiv({ cls: c("reader-shortcuts-card") });
        card.createDiv({ cls: c("reader-panel-title"), text: t("reader_shortcuts") });
        const list = card.createEl("dl", { cls: c("reader-shortcuts-list") });
        for (const row of shortcutsFor(this.effectiveLayout(), this.bookDirection(), this.runMode())) {
            const keys = list.createEl("dt", { cls: c("reader-shortcuts-keys") });
            for (const key of row.keys) keys.createEl("kbd", { text: kbdCap(key) });
            list.createEl("dd", { cls: c("reader-shortcuts-label"), text: t(row.label) });
        }
        card.createDiv({ cls: c("reader-shortcuts-hint"), text: t("reader_shortcuts_commands") });
        // Anywhere closes it: it only explains, and asks nothing.
        this.registerDomEvent(sheet, "click", () => this.closeShortcuts());
        this.shortcuts = sheet;
        this.wake();
    }

    private closeShortcuts(): void {
        this.shortcuts?.remove();
        this.shortcuts = null;
    }

    /** The window the reader is drawn in — a pop-out has its own. */
    private viewWindow(): Window | undefined {
        const win = (this.contentEl as HTMLElement & { win?: Window }).win;
        if (win) return win;
        return typeof activeWindow === "undefined" ? undefined : activeWindow;
    }

    /** Whether to animate: a window that can be asked, and a user who has not asked for less motion. */
    private motionAllowed(): boolean {
        const win = this.viewWindow();
        if (typeof win?.matchMedia !== "function") return false;
        return !win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    /**
     * Bring an element of the chapter into view inside the reader's own scroller, never its ancestors:
     * at once in a chapter just drawn, or — `travel`, in the chapter on screen — as a camera move
     * (#761 FR-15, §XVI). Returns how long the move takes.
     */
    private scrollToEl(el: HTMLElement, travel = false): number {
        const stage = this.els?.stage;
        // A mark an embed re-render threw away has no place to scroll to.
        if (!stage || el.isConnected === false) return 0;
        // In pages, the page that holds it, once the chapter being drawn is laid out (#753 FR-5).
        if (this.pagedNow() && this.pager) {
            if (this.pagesPending) {
                this.pendingReveal = el;
                return 0;
            }
            return this.pager.reveal(el, travel);
        }
        const box = stage.getBoundingClientRect();
        const top = Math.max(0, (el.getBoundingClientRect().top - box.top) / stageScale(stage, box.height) + stage.scrollTop - stage.clientHeight / 3);
        if (travel && this.pager) return this.pager.glideTo(top);
        stage.scrollTop = top;
        return 0;
    }

    private ownDocument(): Document | undefined {
        return (this.contentEl as HTMLElement & { doc?: Document }).doc;
    }

    // ── deep reading (#764) ──────────────────────────────────────────────────

    private toggleDeep(): void {
        if (this.deep) this.leaveDeep();
        else this.enterDeep();
    }

    /**
     * The page and nothing else (FR-2): the chrome slides away in one gesture, the window goes
     * fullscreen where the platform has it, and the line you read stays where it is: the stage's
     * insets never change, and the reshape keeps your place (#750 D3) while the window grows (FR-10).
     */
    private enterDeep(): void {
        const root = this.root;
        if (!root || this.deep) return;
        this.deep = true;
        this.deepPointer = null;
        const doc = this.ownDocument();
        this.watchFullscreen(doc);
        this.deepFullscreen = false;
        if (doc && canFullscreen(doc) && !doc.fullscreenElement) this.requestWindowFullscreen(doc);
        else if (Platform.isMobile) log.debug("[Reader] deep reading: no window fullscreen here; the Reader covers the app");
        // On mobile the Reader already covers Obsidian's chrome while it is read (#750 D6); deep reading
        // makes sure of it. The iPadOS status bar stays: a plugin cannot hide it.
        if (Platform.isMobile) coverApp(true);
        const win = this.viewWindow() ?? window;
        win.clearTimeout(this.idleTimer);
        win.clearTimeout(this.deepTimer);
        root.removeClass(c("reader--deep-leaving"));
        root.addClass(c("reader--deep"), c("reader--idle"));
        // On a desktop Obsidian's own chrome leaves with the Reader's, then the leaf covers the window,
        // your line held where it is (FR-2, FR-10).
        const body = doc?.body;
        if (this.motionAllowed()) {
            root.addClass(c("reader--deep-entering"));
            deepCover("hide", body);
            // The column travels to where the cover will centre it inside the same gesture (FR-10, §XVI).
            this.travelColumn(this.columnShift());
            this.deepTimer = win.setTimeout(() => {
                this.root?.removeClass(c("reader--deep-entering"));
                if (this.deep) this.coverKeepingColumn(() => this.holdLine(() => deepCover("cover", body)));
            }, MOTION.base);
        } else {
            this.holdLine(() => deepCover("cover", body));
        }
        this.setDeepButton(true);
        this.showDeepHint();
    }

    /**
     * Back to the ordinary Reader (FR-6, FR-12): the chrome comes back from where it went, in one
     * gesture, and the window's fullscreen is given back only if deep reading took it. `instant` when
     * the Reader itself is going.
     */
    private leaveDeep(instant = false): void {
        if (!this.deep) return;
        this.deep = false;
        this.deepPointer = null;
        const doc = this.ownDocument();
        if (this.deepFullscreen && doc?.fullscreenElement) {
            const failed = (error: unknown) => log.debug(`[Reader] could not leave fullscreen: ${String(error)}`);
            try {
                void doc.exitFullscreen()?.catch?.(failed);
            } catch (error) {
                failed(error);
            }
        }
        this.deepFullscreen = false;
        this.dropDeepHint();
        this.setDeepButton(false);
        // The leaf gives the window back with your line held, then Obsidian's chrome slides back in.
        const body = doc?.body;
        this.coverKeepingColumn(() => {
            this.holdLine(() => deepCover("hide", body));
            deepCover("off", body);
        }, !instant && this.motionAllowed() ? MOTION.base : 0);
        const root = this.root;
        if (!root) return;
        const win = this.viewWindow() ?? window;
        win.clearTimeout(this.deepTimer);
        root.removeClass(c("reader--deep"), c("reader--deep-entering"));
        if (!instant && this.motionAllowed()) {
            root.addClass(c("reader--deep-leaving"));
            this.deepTimer = win.setTimeout(() => this.root?.removeClass(c("reader--deep-leaving")), MOTION.base);
        }
        if (!instant) this.wake();
    }

    /**
     * The whole window, not the reader's box: modals, menus, page previews and notices are drawn on
     * the document's body, and would vanish behind a fullscreen reader element. A refusal is caught:
     * deep reading still hides the chrome.
     */
    private requestWindowFullscreen(doc: Document): void {
        const failed = (error: unknown) => {
            this.deepFullscreen = false;
            log.debug(`[Reader] fullscreen unavailable: ${String(error)}`);
        };
        try {
            this.deepFullscreen = true;
            const request = doc.body.requestFullscreen();
            void request
                ?.then?.(() => {
                    // Left again before the window got there: give it straight back.
                    if (!this.deep && doc.fullscreenElement) void doc.exitFullscreen()?.catch?.(failed);
                })
                ?.catch?.(failed);
        } catch (error) {
            failed(error);
        }
    }

    /** A window that leaves fullscreen by itself (Esc in the app, F11) is not put back later (FR-6). */
    private watchFullscreen(doc: Document | undefined): void {
        if (!doc || doc === this.deepWatched || typeof doc.addEventListener !== "function") return;
        this.deepWatched = doc;
        this.registerDomEvent(doc, "fullscreenchange", () => {
            if (!doc.fullscreenElement) this.deepFullscreen = false;
        });
    }

    private setDeepButton(on: boolean): void {
        const button = this.deepButton;
        if (!button) return;
        button.setAttribute("aria-pressed", on ? "true" : "false");
        button.setAttribute("aria-label", t(on ? "reader_deep_leave" : "reader_deep"));
    }

    /** Said once per entry, on the page, for as long as the bar waits: a line, never a notice (FR-7). */
    private showDeepHint(): void {
        const root = this.root;
        if (!root) return;
        this.dropDeepHint();
        const touch = this.lastPointerType ? this.lastPointerType !== "mouse" : Platform.isMobile;
        this.deepHint = root.createDiv({
            cls: c("reader-deep-hint"),
            attr: { role: "status" },
            text: t(touch ? "reader_deep_hint_touch" : "reader_deep_hint_pointer"),
        });
        const win = this.viewWindow() ?? window;
        this.deepHintTimer = win.setTimeout(() => this.dropDeepHint(), IDLE_MS);
    }

    private dropDeepHint(): void {
        (this.viewWindow() ?? window).clearTimeout(this.deepHintTimer);
        this.deepHint?.remove();
        this.deepHint = null;
    }

    /**
     * How far the column will move when the Reader's leaf covers the window on a desktop: the stage
     * then spans the window, so the column's centre moves to the window's (FR-10). None on mobile,
     * where the Reader already covers.
     */
    private columnShift(): number {
        const stage = this.els?.stage;
        const win = this.viewWindow();
        if (Platform.isMobile || !stage || !win || !(win.innerWidth > 0)) return 0;
        const box = stage.getBoundingClientRect();
        // The scrollbar takes its width from the column's box, before and after alike.
        const bar = Math.max(0, (stage.offsetWidth || box.width) - (stage.clientWidth || box.width));
        return Math.round((win.innerWidth - bar) / 2 - (box.left + (box.width - bar) / 2));
    }

    /** The column on its way to `dx`, in the entering gesture; held there until the cover lands. */
    private travelColumn(dx: number): void {
        const page = this.els?.page;
        this.deepTravel?.cancel();
        this.deepTravel = null;
        if (!page || Math.abs(dx) < 1 || typeof page.animate !== "function") return;
        this.deepTravel = page.animate([{ transform: "translateX(0px)" }, { transform: `translateX(${dx}px)` }], { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" });
    }

    /**
     * A change that moves the column across the screen (the leaf covering the window, or giving it
     * back), made without a step: wherever the column was on screen it is still there after the
     * change, and travels from there to its new place in `ms` — at once when `ms` is 0 (FLIP).
     */
    private coverKeepingColumn(change: () => void, ms: number = MOTION.fast): void {
        const page = this.els?.page;
        const before = page?.getBoundingClientRect().left;
        this.deepTravel?.cancel();
        this.deepTravel = null;
        change();
        if (!page || before === undefined || ms <= 0 || typeof page.animate !== "function") return;
        const dx = Math.round(before - page.getBoundingClientRect().left);
        if (Math.abs(dx) < 1) return;
        this.deepTravel = page.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0px)" }], { duration: ms, easing: MOTION.ease });
    }

    /**
     * Keep the line you are reading where your eyes are while the Reader's box moves under it (the
     * desktop cover, FR-10): in a scroll, the first block on screen is put back at the same height.
     * In pages the pager keeps its own place through the reshape (#753).
     */
    private holdLine(change: () => void): void {
        const stage = this.els?.stage;
        const top = stage && !this.pagedNow() ? stage.getBoundingClientRect().top : null;
        const el = top === null ? undefined : this.blockElements().find((block) => block.getBoundingClientRect().bottom > top);
        const before = el?.getBoundingClientRect().top;
        change();
        if (!stage || !el || before === undefined) return;
        const shift = el.getBoundingClientRect().top - before;
        if (Math.abs(shift) >= 1) stage.scrollTop = Math.max(0, stage.scrollTop + shift);
        // The place a reshape restores is the one you are now on.
        const blocks = this.blocks();
        if (blocks.length > 0) this.place = placeAt(blocks, stage.scrollTop);
    }

    /** The chrome may step back: nothing is open over the page that a control would be needed for. */
    private idleAllowed(): boolean {
        return !this.panel && !this.shortcuts && !this.searchEl && !this.notePop && !this.highlights?.hasPopover();
    }

    /** Show the bar, then let it fade when nothing moves — or, asked by a tap, keep it (#750). */
    private wake(stay = false): void {
        if (!this.root) return;
        this.root.removeClass(c("reader--idle"));
        window.clearTimeout(this.idleTimer);
        if (stay) return;
        this.idleTimer = window.setTimeout(() => {
            if (this.idleAllowed()) this.root?.addClass(c("reader--idle"));
        }, IDLE_MS);
    }
}

export { READER_VIEW };
