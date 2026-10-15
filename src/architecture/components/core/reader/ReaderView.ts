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
    setTooltip,
    type Modifier,
    type ViewStateResult,
    type WorkspaceLeaf,
} from "obsidian";
import { c, log } from "architecture";
import { t, tCount } from "architecture/lang";
import { KnowledgeIndex } from "architecture/knowledge";
import type { ChapterRole, ReadingPath } from "architecture/knowledge/state";
import { READER_VIEW, parseReaderState, type ReaderBack, type ReaderKind } from "./readerContract";
import { pathFor } from "./readerPaths";
import { isNoteLink, noteExcerpt, ReaderTrail, type TrailReason } from "./readerJumps";
import { addBookmark, bookmarkAt, bookmarkSnippet, inReadingOrder, landingOffset, removeBookmarks, wordStart, type Bookmark } from "./readerBookmarks";
import { markHereAt, markHereOn } from "./readerHere";
import { relativeLabel } from "architecture/components/core/noteCompanion/storyFormat";
import { MOTION, copyLive, motionWelcome } from "./readerMotion";
import { beginCloseShot, landOpenShot, shotIncoming } from "./readerShot";
import { adoptChapterScrub, beginChapterScrub, endChapterTurn, playChapterTurn, playFold, unfoldAtOnce, type ChapterScrub } from "./readerTurn";
import { RecallSession, type RecallChapter, type RecallPort } from "./readerRecall";
import { keepRecall, recallFlowName, undoRecall } from "./readerRecallNote";
import { recallCitation } from "application/library/recallNote";
import { canFullscreen, isApple, panelShape, tooLarge, touchPointer } from "./readerDevice";
import { escapeStep, isReadingKey, movedEnough } from "./readerDeep";
import { PINCH_SHARE, completionRate, edgeZone, isThing, pinchRelease, releaseTurn, rubberBand, startGesture, twoFingers, type Gesture, type TwoFingerKind, SYSTEM_EDGE_PX } from "./readerGestures";
import { blockAtLine, placeAt, READING_LINE, scrollFor, type Box as PlaceBox, type Place } from "./readerPlace";
import { ReaderAlongside, type AlongsideDeps, type AlongsidePassage, type AlongsideReading } from "./readerAlongside";
import { foldMarks, parsePlace, resolveChapter, type PageMark, type PassagePlace } from "application/library/provenance";
import { anchorQuote, type TextQuote } from "application/thinking/quoteAnchor";
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
import { adoptHeldSides, coverApp, deepCover, exitReader, heldSides, originLandsAt, restoreWorkspace } from "./openReader";
import { addToReading, placeInPath, plainExcerpt, popDetour, pushDetour } from "./readerDetours";
import { hoverPreview } from "architecture/components/core/a11y";
import { ReaderHighlights, type HighlightDeps, type PassageActions, type ThinkMove, type ThinkPassage } from "./readerHighlights";
import { ReaderVaultMoves, type VaultMoveId, type VaultMovePassage, type VaultMovesDeps, type VaultMovesView } from "./readerVaultMoves";
import { ReaderClaimLink, type ClaimLinkDeps, type ClaimLinkView } from "./readerClaimLink";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { dismissNewestOf, type ProposalBox } from "./readerProposal";
import { ReaderAiMoves, type AiMovesDeps, type AiMovesView } from "./readerAiMoves";
import type { ReaderAiMoveId } from "application/thinking/readerMovePrompts";
import { ReaderInk, type InkDeps } from "./readerInk";
import {
    chapterOfHighlight,
    chaptersRead,
    keptPageView,
    overviewMarksOf,
    rememberChapterRead,
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
import { openSourceDocument, type SourceChapter, type SourceDocument, type SourceView } from "architecture/components/core/library/sources/sourceDocument";
import { isInk, type Thought, type ThoughtLocator } from "application/thinking/thought";
import { openLibrary } from "architecture/components/core/library/openLibrary";
import { END_OF_CHAPTER, bookMinutesLeft, learnPace, minutesFor, minutesLeft, minutesLeftByPages, normalizePace, paceWpm, pagePace, readFraction, scrolls, splitMinutes, wordCount, type Pace } from "./readerPace";
import { designedKeyIntent, visibleTurn } from "./readerDesigned";
import { normalizeReaderPrefs, readerClassNames, type ReaderLayout, type ReaderPrefs } from "./readerPrefs";
import { ReaderPager, stageScale, type Landing, type PageAnchor } from "./readerPager";
import { dragDirection, edgeTurn, keyIntent, type BookDirection, type KeyIntent } from "./readerPages";
import { LAYOUT_SETTLE, settleAround, TYPE_SETTLE } from "./readerSettle";
import { languageName, readingLanguage } from "./readerLanguage";
import { HyphenationSupport, justifyDecision } from "./readerHyphenation";
import { chapterState, kickerTitle, screenPart, showDots, type ChapterState } from "./readerProgress";
import { pageShape } from "./readerPages";
import { renderTypePanel, snapshotMarkers, zoomLabel } from "./readerTypePanel";
import { panelAction, panelClose, panelHead, type PanelClose } from "./readerPanelHead";
import { PdfPageRun } from "./readerPageRun";
import { PREVIEW_BLOCKS, cardMarks, cardPixels, cardProgress, normalizeContentsTab, overviewLimit, overviewUnits, renderOverview, OVERVIEW_LIMITS, type ContentsTab, type MarkSource, type Overview, type OverviewUnit } from "./readerOverview";
import { fly } from "./readerMotion";
import { ReaderLookup, type LookupDeps, type LookupView } from "./readerLookup";
import { CitePanel } from "./readerCite";
import { citeFormOf, type CiteForm, type MissingField } from "application/library/citation";
import { citeSourceOf } from "architecture/components/core/library/libraryCite";
import { SittingClock, chapterEnds, endingAt, shouldPause, spanOf, touchedNotes, wasSkip, type ChapterSpan } from "./readerSurvived";
import { renderSurvivedLeaf, type SurvivedCard, type SurvivedLeaf } from "./readerSurvivedLeaf";
import { isMark } from "application/library/produced";
import { citedLocator, notesBornFrom, pageOf } from "application/library/born";
import { readSourceEntry } from "application/library/provenance";
import { gatherBookNotes } from "architecture/components/core/library/bookNoteIndex";
import { crystallizeHighlight } from "architecture/components/core/library/crystallizeHighlight";
import { dictionarySettings } from "application/library/dictionarySettings";
import { MarkVisibility, layerPrefsOf, normalizeLayerPrefs, withLayerPrefs } from "./readerLayers";
import { renderLayersPanel } from "./readerLayersPanel";
import { LAYER_LABEL } from "./readerHighlights";
import { DEFAULT_LAYER, type MarkLayer } from "application/thinking/markLayer";
import { ReaderSnapshot, captureRegion, captureScale, snapshotName, type Box as SnapshotBox, type SnapshotCapture, type SnapshotDeps, type SnapshotView } from "./readerSnapshot";
import { saveSnapshot } from "./readerSnapshotSave";
import { LISTEN_STORAGE_KEY, normalizeListenPrefs, type ListenPrefs } from "./readerListen";
import { ListenSession, speechPortOf, type ListenMode, type ListenView, type SpeechPort } from "./readerListenSession";
import { ListenBar, openListenMenu } from "./readerListenBar";
import { bookNoteOf } from "architecture/components/core/library/bookNoteIndex";
import { languageTag } from "application/library/sourceMeta";
import type { TextSpan } from "application/thinking/quoteAnchor";
import { UndoLedger } from "./readerUndoLedger";
import { SourceRenameFollow } from "architecture/plugin/library/SourceRenameFollow";

type LocaleKey = Parameters<typeof t>[0];

/** The bar fades after this long without a pointer move or a key. */
const IDLE_MS = 2000;

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
    // What survived? (#755 FR-6, FR-10): on the leaf between two chapters, → turns on and ← goes back.
    { keys: ["→"], label: "reader_key_survived_next" },
    { keys: ["←"], label: "reader_key_survived_back" },
    { keys: ["reader_kbd_home", "reader_kbd_end"], label: "reader_key_ends" },
    { keys: ["H"], label: "reader_key_highlight" },
    { keys: ["1–4"], label: "reader_key_meaning" },
    { keys: ["reader_kbd_shift", "H"], label: "reader_key_note" },
    // The selection popover (#811 FR-12, FR-13): walked with the arrows, folded with Esc.
    { keys: ["←", "→", "↑", "↓"], label: "reader_key_popover_walk" },
    { keys: ["reader_kbd_esc"], label: "reader_key_popover_esc" },
    // Listen (#765 FR-10): while the voice reads, the listening bar's keys.
    { keys: ["K"], label: "reader_key_listen_toggle" },
    { keys: ["[", "]"], label: "reader_key_listen_step" },
    { keys: ["H"], label: "reader_key_listen_mark" },
    { keys: ["B"], label: "reader_key_bookmark" },
    // Ink (#745): the pencil in the bar is the door; P is the way back to it, Ctrl/⌘+Z undoes.
    { keys: ["P"], label: "reader_key_ink" },
    { keys: ["reader_kbd_ctrl", "Z"], label: "reader_key_undo" },
    { keys: ["F"], label: "reader_key_deep" },
    { keys: ["V"], label: "reader_key_layout" },
    { keys: ["reader_kbd_ctrl", "F"], label: "reader_key_search" },
    { keys: ["reader_kbd_alt", "←"], label: "reader_key_back" },
    { keys: ["?"], label: "reader_key_help" },
    { keys: ["reader_kbd_esc"], label: "reader_key_exit" },
];

/**
 * What the page does under a pen or a finger (#747, #790), a group of its own. The pen only draws:
 * the lasso is the one gesture, as a glyph like →.
 */
const GESTURES: { keys: string[]; label: LocaleKey }[] = [
    { keys: ["◌"], label: "reader_gesture_lasso" },
    { keys: ["reader_kbd_two_fingers"], label: "reader_key_ink_undo" },
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
    reader_kbd_two_fingers: "reader_kbd_two_fingers",
};

/** On a Mac or an iPad the key caps are the glyphs on the keys themselves (FR-12). */
const APPLE_CAPS: Record<string, string> = { reader_kbd_ctrl: "⌘", reader_kbd_alt: "⌥" };

/** A key cap as this device's keyboard prints it: ⌘ and ⌥ on Apple, Ctrl and Alt elsewhere. */
function kbdCap(key: string): string {
    if (isApple() && APPLE_CAPS[key]) return APPLE_CAPS[key];
    return KBD_KEY[key] ? t(KBD_KEY[key]) : key;
}

/** The leaf between two chapters while it is the page (#755). */
interface LeafState {
    /** The chapter it ends: the Reader's last chapter (a PDF's last page) of it. */
    after: number;
    arrivedAt: number;
    /** Anything on it was touched: leaving it is no longer a skip (FR-7). */
    touched: boolean;
    leaf: SurvivedLeaf | null;
    /** What was yours in the chapter as the turn was asked: the page's own marks go with the page. */
    found: Thought[];
    /** Drawn once: drawn again (a change of view), it is simply there. */
    drawn: boolean;
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


/**
 * The panels — Recall (#760), which lies beside the page as Alongside does, with no button of its
 * own, and the overview (#784), whose door is the bar's *Overview* and the pinch, never a tab.
 */
type Panel = "contents" | "type" | "layers" | "context" | "recall" | "overview" | "search" | null;

/**
 * The Contents panel of a book or a paper (#761 FR-4): its contents, its bookmarks, where you've
 * been. The overview is a panel of its own (#784 FR-1): one door to one view.
 */
const CONTENTS_TABS: { id: ContentsTab; label: LocaleKey }[] = [
    { id: "contents", label: "reader_contents" },
    { id: "bookmarks", label: "reader_tab_bookmarks" },
    { id: "trail", label: "reader_tab_trail" },
];

/** The keys the overview's cards keep for themselves while one has the focus (#776 FR-16). */
const OVERVIEW_KEYS = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End", " "]);

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

/** How long the *not found in this edition* line stays before it leaves (#751 FR-14). */
const PASSAGE_MISSING_MS = 6000;

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
    /**
     * A passage a note goes back to (#751): found by its words, and put at the reading line — or, when
     * the words are not there, the chapter's top and one inline line saying so (FR-7). Never a guess.
     */
    passage?: TextQuote;
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

/** Where you are in a source, as the page's corner says it: a paper's page, a book's chapter, an article's section (#744). */
const COUNT_KEY: Record<SourceDocument["format"], Parameters<typeof t>[0]> = {
    pdf: "reader_source_count_page",
    epub: "reader_source_count_chapter",
    article: "reader_source_count_section",
};

/** How a Contents row's state is said (#812 FR-13). */
const TOC_STATE_KEY: Record<ChapterState, Parameters<typeof t>[0]> = {
    read: "reader_toc_read",
    part: "reader_toc_part",
    unread: "reader_toc_unread",
};

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
    /** The bar's door to each panel, pressed while its panel is open (#777 FR-3). */
    private panelButtons: Record<Exclude<Panel, null | "recall" | "overview">, HTMLElement> | null = null;
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
        /** The overview's door (#776 FR-1): every book and paper, every view. */
        overview: HTMLElement;
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
    /** Ink in the margin (#745): the palette, the ink layer, and where ink is kept. */
    private ink: ReaderInk | null = null;
    /** A highlight a deep link asked to land on — consumed by the next chapter that holds it. */
    private pendingHighlight: string | null = null;
    /** The listeners and renders of the chapter on screen; replaced with it. */
    private chapter: Component | null = null;
    /** The listeners of the dots and the rest of one render — dropped with the next (#667 audit). */
    private renderScope: Component | null = null;
    /** The listeners of the open panel's rows, replaced when it redraws. */
    private panelScope: Component | null = null;
    /** Alongside (#754): the context panel, your vault beside the page. Lives as long as the view. */
    private alongside: ReaderAlongside | null = null;
    /** Contradict and Connect, answered by your vault (#756): their cards live in Alongside. */
    private vaultMoves: ReaderVaultMoves | null = null;
    /** The six moves by your AI provider (#759): their cards live in Alongside, kept while it is closed. */
    private aiMoves: ReaderAiMoves | null = null;
    /** *Make it a claim* and *Link to an idea* (#762): the sheet over Alongside, the picker in the popover. */
    private claimLink: ReaderClaimLink | null = null;
    /** *Look up* and *Translate* (#766): the card grown from the words, gone on Esc, a click or a turn. */
    private lookup: ReaderLookup | null = null;
    /** *Cite* (#768): the panel grown from the popover or the highlight, gone on Esc, a click or a turn. */
    private citePanel: CitePanel | null = null;
    /** *Snapshot* (#763): the mode that turns a drag on Page view into a capture, and its card. */
    private snapshot: ReaderSnapshot | null = null;
    /** Its door in the bar: shown in Page view, pressed while the mode is on. */
    private snapshotButton: HTMLElement | null = null;
    /** Alongside's button in the bar: a dot on it says an answer landed while it was closed (#759 FR-14). */
    private alongsideDot: HTMLElement | null = null;
    /** The shape the open panel was drawn in: Alongside moves in place while it keeps it. */
    private panelShape: "sheet" | "side" | "card" | null = null;
    /** Which panel the drawer holds now (#812 FR-5): a different one asked for is a swap, not an arrival. */
    private panelShown: Panel = null;
    /** Where you marked something in the book open in Contents (#812 FR-14), read as Contents opened. */
    private contentsMarks: { path: string; at: Set<number> } | null = null;
    /** Alongside's leaving slide, when it is playing. */
    private alongsideLeaving: number | undefined;
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
    /** The *not found in this edition* line's leaving (#751): one at a time, gone with the view. */
    private missingTimer: number | undefined;
    private jumpPillShown = false;
    /** A place to land on once the chapter it is in is drawn (#761). */
    private pendingLanding: Spot | null = null;
    /** Where a first reading's text begins inside its chapter (#808 FR-4), landed on once it is drawn. */
    private startFragment: string | null = null;
    /** What this reading wrote and can take back by Ctrl/⌘+Z (#810 FR-15), newest first. */
    private readonly undoLedger = new UndoLedger();
    /**
     * A passage just landed on (#751): held at the reading line through a reshape — the sidebars
     * folding as the Reader opens, a window resized — until you move the page yourself.
     */
    private passageHold: number | null = null;
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
    /**
     * *What survived?* (#755): the leaf between chapter `after` and the next, while it is the page —
     * when it arrived, whether anything on it was touched (a skip is leaving it untouched, FR-7).
     */
    private pause: LeafState | null = null;
    /** The last pause was skipped: the next end that would pause does not (FR-7). Never kept. */
    private skipPending = false;
    /** How long this sitting spent on each chapter (FR-2.3), paused while the Reader is hidden. */
    private readonly sitting = new SittingClock(() => Date.now());
    /** The notes opened as a peek from each chapter in this sitting: what a chapter touched (FR-3). */
    private readonly peeked = new Map<number, Set<string>>();
    /** Your marks in this source (highlights, margin notes, ink), read again when they change. */
    private survivedMarks: { path: string; thoughts: Thought[] } | null = null;
    private survivedReading: Promise<void> | null = null;
    /**
     * Listen (#765) sets this while it reads the book aloud: no chapter end pauses then (FR-2.7). Set
     * it back to `false` when it stops.
     */
    listening = false;
    /**
     * Listen (#765): the voice reading the book aloud, its bar while it reads, and the *Listen* button.
     * The speech is the window's own (`null` where the Web Speech API is missing: no button, FR-8).
     */
    private listen: ListenSession | null = null;
    private listenBar: ListenBar | null = null;
    private listenScope: Component | null = null;
    private listenButton: HTMLElement | null = null;
    /** The device has a voice of its own (FR-2): known once its voices are listed. */
    private listenOffered = false;
    private listenPrefs: ListenPrefs;
    /** The language the voice reads in, decided when listening begins and at each chapter (FR-2). */
    private listenLang: string | null = null;
    /** The paragraph you last tapped: *From here* begins there while it is on screen (FR-1). */
    private lastTapped: { el: HTMLElement; chapter: number } | null = null;
    /**
     * Recall (#760): the chapter being written from memory, while its card is open — and what you
     * wrote in each chapter and did not keep, for as long as this Reader is open (FR-7). Never saved.
     */
    private recall: RecallSession | null = null;
    private readonly recallDrafts = new Map<string, string>();
    /** You were reading clean when recall began: its end leaves the marks away, as they were (FR-8). */
    private recallWasClean = false;
    /** Recall asked for on the leaf: it begins once the chapter is back under the turn. */
    private recallPending = false;
    /**
     * What is drawn of your marks (#758): the layers hidden, reading clean, the reveal in order — the
     * one mechanism Recall (#760) uses too. It holds no marks; it reads what is drawn.
     */
    readonly layerView = new MarkVisibility({
        root: () => this.root,
        stage: () => this.els?.stage ?? null,
        thoughts: () => [...(this.highlights?.allMarks() ?? []), ...(this.ink?.marks() ?? [])],
        tintsOf: (id) => this.highlights?.tintsFor(id) ?? [],
        onScreen: (el) => this.onScreen(el),
        selecting: () => this.selecting(),
    });
    /** The reading the layers were last loaded for: another one starts with every mark shown (FR-8). */
    private layersKey: string | null | undefined = undefined;
    /** The layer new marks go to, beside the Layers button when it is not reading (FR-4). */
    private layerLabel: HTMLElement | null = null;
    /** *Reading clean · Reveal my thinking* (FR-8): at the top of the column while you read clean. */
    private cleanPill: HTMLElement | null = null;
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
    /** A designed book's quiet hint (#771 FR-8): said once a reading, on its first designed page. */
    private designedHintShown = false;
    /** How long each designed page of this reading was on screen, for its time left (#771 FR-8). */
    private pageDwells: number[] = [];
    private pageShownAt = 0;
    /** The overview's cards, while its tab is open (#776). */
    private overview: Overview | null = null;
    private overviewUnits: OverviewUnit[] = [];
    /** The book's marks, read once each time the overview opens (#776 D9). */
    private overviewMarks: MarkSource[] = [];
    /** The overview is opening: the camera pulls back from the page, at this scale of it (FR-20). */
    private overviewEntering: { from: number } | null = null;
    /** A card was picked: closing plays no return to the page (FR-21, FR-22). */
    private overviewPicked = false;
    /** The overview's shot under way, jumped to its end by any input (FR-26). */
    private overviewShot: Animation | null = null;
    /** The reading view's own card drawings, one at a time (#776 FR-6): Page view has its run's queue. */
    private cardQueue: { run: () => Promise<void>; cancelled: boolean }[] = [];
    private cardRunning = false;
    /** Two fingers on a flowing page: what they are (decided once), and the page under them (#776 D13). */
    private twoKind: TwoFingerKind = "pending";
    private twoStart: { spread: number; at: number } | null = null;
    private pinchLive: { scale: number } | null = null;
    /** Two touches on a flowing page, as WebKit reports them: how far apart they came down (#776 FR-23). */
    private touchPinch: { d0: number } | null = null;
    /** The chapter on its way was reached by a flight: it is already there, no entrance (#776 FR-21). */
    private flown = false;
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
        private readonly highlightDeps: HighlightDeps = {},
        /** Seams for tests: ink's store, its words and its clock (#745). */
        private readonly inkDeps: InkDeps = {},
        /** Seams for tests: Alongside's index, Think and the judgement record (#754). */
        private readonly alongsideDeps: AlongsideDeps = {},
        /** Seams for tests: the moves' stores, record and property write (#756). */
        private readonly vaultMovesDeps: VaultMovesDeps = {},
        /** Seams for tests: the AI layer, the stores and the queue of the AI moves (#759). */
        private readonly aiMovesDeps: AiMovesDeps = {},
        /** Seams for tests: the claim's create, the link's write and the record (#762). */
        private readonly claimLinkDeps: ClaimLinkDeps = {},
        /** Seams for tests: the dictionaries, the AI layer, Settings and the clipboard of Look up (#766). */
        private readonly lookupDeps: LookupDeps = {},
        /** Seams for tests: the snapshot's writer, its undo and the note picker (#763). */
        private readonly snapshotDeps: SnapshotDeps = {},
        /** Seams for tests: the speech engine of Listen (#765) — `null` is a device without one. */
        private readonly listenDeps: { speech?: SpeechPort | null } = {}
    ) {
        super(leaf);
        this.prefs = normalizeReaderPrefs(plugin?.settings?.readerPrefs);
        this.pace = normalizePace(this.app?.loadLocalStorage?.(PACE_STORAGE_KEY));
        this.listenPrefs = normalizeListenPrefs(this.app?.loadLocalStorage?.(LISTEN_STORAGE_KEY));
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
            // A place a note goes back to (#751): its chapter and its words, in this source only.
            const read = parsed.at ? parsePlace(parsed.at) : null;
            const place = read && read.file === parsed.source ? read : null;
            // A passage opened from Think or *This note* while the book is open is a jump (#761 FR-6):
            // where you were is kept first, and the camera moves there — never a fresh draw.
            const passage = (Boolean(parsed.highlight) || Boolean(place)) && parsed.source === this.sourcePath && Boolean(this.source) && this.leaveTrail("passage");
            const before = this.index;
            // No chapter asked for (#808 FR-2a): a first reading, which opens where the text begins.
            await this.readSource(parsed.source, parsed.chapter, parsed.layout === "page" ? "page" : "reading", parsed.highlight, place);
            if (!this.els) return;
            // Think's *Claim* (#762 FR-1): the sheet, once the passage is read — never a second sheet in Think.
            if (parsed.claimFrom) void this.claimFromId(parsed.claimFrom);
            if (passage && this.index === before && parsed.highlight && this.highlights?.reveal(parsed.highlight, true)) {
                this.pendingHighlight = null;
                return;
            }
            // In the chapter on screen: one eased glide to the passage (#751 FR-12), never a redraw.
            const landing = this.pendingLanding;
            if (passage && this.index === before && landing?.chapter === before) {
                this.pendingLanding = null;
                this.landHere(landing, true);
                return;
            }
            // In another chapter: the chapter turns towards it, the way it turns today (#735).
            if (passage && this.index !== before) this.turn = this.index > before ? 1 : -1;
            this.render();
            // The text begins at an element of its chapter (#808 FR-4): the page lands on it.
            const startFragment = this.startFragment;
            this.startFragment = null;
            if (startFragment) this.scrollToFragment(startFragment, false);
            return;
        }
        if (parsed.seed && this.sourcePath) this.leaveSource();
        if (parsed.seed) {
            // A new reading: its own clock, counts and end.
            if (parsed.seed !== this.path?.seed || (parsed.kind ?? "around") !== this.kind) {
                this.startedAt = Date.now();
                this.detourCount = 0;
                this.undoLedger.reset();
                this.highlights?.cancelReanchor();
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
    private async readSource(path: string, chapter: number | undefined, view: SourceView, highlight?: string, place: PassagePlace | null = null): Promise<void> {
        const fresh = path !== this.sourcePath;
        if (fresh) {
            this.leaveSource();
            this.startedAt = Date.now();
            this.detourCount = 0;
            this.visited.clear();
            this.savedId = undefined;
            this.endStatus = undefined;
            this.sourcePath = path;
            // A new reading: Ctrl/⌘+Z never reaches into the last one (#810 FR-15).
            this.undoLedger.reset();
            this.highlights?.cancelReanchor();
            // A new reading: its own trail (FR-9), and Contents opens on its contents.
            this.trail.clear();
            this.jumpPillShown = false;
            this.pendingLanding = null;
            this.contentsTab = "contents";
            this.searchLeft = false;
            this.designedHintShown = false;
            this.pageDwells = [];
            this.pageShownAt = 0;
            // A new reading: no leaf, no skip, no time on its chapters yet (#755).
            this.pause = null;
            this.skipPending = false;
            this.peeked.clear();
            this.survivedMarks = null;
            // Back where you were inside the chapter, not at its top — unless a highlight was asked for.
            this.pendingShare = highlight || place || chapter === undefined ? null : keptScroll(this.plugin, path, chapter);
        }
        this.ended = false;
        this.detours = [];
        this.closePeek();
        this.pending = null;
        this.name = undefined;
        this.kind = "around";
        this.paths = undefined;
        this.sourceView = view;
        this.index = Math.max(0, chapter ?? 0);
        this.startFragment = null;
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
        if (place && this.source) this.aimAt(place, this.source.chapters);
        // A first reading (#808 FR-2, FR-3): past the cover and the credits, where the book says its
        // text begins — never over a place, a passage or a highlight that was asked for.
        const start = this.source?.start;
        if (chapter === undefined && !highlight && !place && start) {
            this.index = start.chapter;
            this.startFragment = start.fragment ?? null;
            log.debug(`[Reader] ${path} opens where its text begins: chapter ${start.chapter + 1}`);
        }
        this.index = Math.max(0, Math.min(this.index, (this.path?.chapters.length ?? 1) - 1));
        // Opened somewhere — a resume, a deep link, a passage — never on a leaf (#755 FR-2.1).
        this.pause = null;
        if (fresh) void this.readSurvivedMarks();
    }

    /**
     * Aim the reading at a place a note goes back to (#751 FR-6, AC-4): its chapter — by its key, else
     * the label the book gave it, else its page — and, when it has words, the passage in it. A place
     * whose chapter is gone opens where it was going to; its words are still looked for, never guessed.
     */
    private aimAt(place: PassagePlace, chapters: readonly SourceChapter[]): void {
        const at = resolveChapter(place, chapters);
        if (at !== null) this.index = Math.max(0, Math.min(at, chapters.length - 1));
        this.pendingShare = null;
        this.pendingLanding = place.quote
            ? { chapter: this.index, offset: null, share: 0, top: 0, passage: place.quote }
            : at !== null
              ? { chapter: this.index, offset: null, share: 0, top: 0 }
              : null;
    }

    /** Close the source being read, before another reading takes its place. */
    private leaveSource(): void {
        // Another reading in this leaf: the voice of this one stops (#765).
        this.stopListening();
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
        // A book renamed while it is open (#810): the reading goes with it.
        this.register(SourceRenameFollow.getInstance().onFollowed((from, to) => this.followRename(from, to)));
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
        const resolved = this.app.metadataCache.on?.("resolved", () => {
            this.resolvePending();
            if (this.panel === "context") this.alongside?.schedule();
        });
        if (resolved) this.registerEvent(resolved);
        // Alongside, open again if you left it open on this device (#754 FR-13).
        this.alongside = new ReaderAlongside(this.alongsideView(), this.alongsideDeps);
        this.vaultMoves = new ReaderVaultMoves(this.vaultMovesView(), this.vaultMovesDeps);
        this.aiMoves = new ReaderAiMoves(this.aiMovesView(), this.aiMovesDeps);
        this.claimLink = new ReaderClaimLink(this.claimLinkView(), this.claimLinkDeps);
        this.lookup = new ReaderLookup(this.lookupView(), this.lookupDeps);
        this.citePanel = new CitePanel({
            host: () => this.root,
            form: () => citeFormOf(this.plugin?.settings?.citeForm),
            saveForm: (form) => this.saveCiteForm(form),
            addIt: (file, field) => this.addCiteField(file, field),
        });
        if (this.alongside.wasOpen() && !this.panel) this.panel = "context";
        // A thought written in the thinking space is in the cache a moment later: the marks are read then (#755).
        const thoughtChanged = this.app.metadataCache.on?.("changed", (file: TFile) => {
            const folder = (this.highlightDeps.store ?? ThoughtStore.getInstance()).folder();
            if (this.sourcePath && folder && file?.path?.startsWith(`${folder}/`)) void this.readSurvivedMarks();
        });
        if (thoughtChanged) this.registerEvent(thoughtChanged);
        // The sitting's clock stops while the Reader is hidden — a locked iPad, another app (#755 FR-2.3).
        const doc = (this.contentEl as HTMLElement & { doc?: Document }).doc;
        if (doc && typeof doc.addEventListener === "function") {
            this.registerDomEvent(doc, "visibilitychange", () => {
                this.sitting.setVisible(doc.visibilityState !== "hidden");
                // A locked iPad, another app (#765 FR-7, AC-6): the web view stops the voice, so listening
                // is paused at its sentence. On a desktop the voice goes on behind other windows — a
                // window covered by another is "hidden" too, and must not stop it (found in the walk).
                if (doc.visibilityState === "hidden" && Platform.isMobile) this.listen?.hidden();
            });
        }
        this.render();
        this.contentEl.focus({ preventScroll: true });
    }

    async onClose(): Promise<void> {
        // Closing the tab in deep reading still gives the window back as it was.
        this.leaveDeep(true);
        // Nothing of this reading can be reached by Ctrl/⌘+Z once it is closed (#810 FR-15).
        this.undoLedger.reset();
        // Leaving the Reader stops listening (#765 FR-5).
        this.stopListening();
        window.clearTimeout(this.idleTimer);
        window.clearTimeout(this.placeTimer);
        (this.root?.win ?? window).clearTimeout(this.missingTimer);
        this.touch = null;
        endChapterTurn();
        this.pager?.dispose();
        this.pager = null;
        this.dropSheet();
        // The ink note being written is kept before the page goes (#745 FR-9).
        this.ink?.dispose();
        this.leaveSource();
        this.highlights?.dispose();
        this.chapter?.unload();
        this.chapter = null;
        this.renderScope?.unload();
        this.renderScope = null;
        this.panelScope?.unload();
        this.panelScope = null;
        // Undecided proposals go with the Reader, and nothing is recorded (#756 FR-12).
        this.vaultMoves?.dispose();
        this.vaultMoves = null;
        // A look-up or a translation on screen goes with the Reader; nothing was kept (#766).
        this.lookup?.dispose();
        this.lookup = null;
        // A citation on screen goes with the Reader: it never wrote anything (#768 FR-7).
        this.citePanel?.dispose();
        this.citePanel = null;
        // A capture not yet kept goes with the Reader: nothing written (#763 AC-3).
        this.snapshot?.dispose();
        this.snapshot = null;
        // Waiting answers are discarded with the Reader: nothing shown, nothing recorded (#759 AC-5).
        this.aiMoves?.dispose();
        this.aiMoves = null;
        // A claim not yet created goes with the Reader: nothing written (#762).
        this.claimLink?.dispose();
        this.claimLink = null;
        this.alongside?.dispose();
        this.alongside = null;
        (this.root?.win ?? window).clearTimeout(this.alongsideLeaving);
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
        // It says what it closes — the Reader, never the panel beside it (#777 FR-2).
        setTooltip(close, t("reader_exit"), { placement: "bottom" });
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
        // Reading clean (#758 FR-8): the same quiet pill, and the way your marks come back.
        const clean = root.createEl("button", {
            cls: [c("reader-detour-pill"), c("reader-clean-pill"), c("reader-hidden")].join(" "),
            attr: { type: "button" },
        });
        clean.createSpan({ cls: c("reader-clean-pill-state"), text: t("reader_clean_pill") });
        clean.createSpan({ cls: c("reader-clean-pill-sep"), text: "·", attr: { "aria-hidden": "true" } });
        clean.createSpan({ cls: c("reader-clean-pill-reveal"), text: t("reader_reveal") });
        this.registerDomEvent(clean, "click", () => this.revealThinking());
        this.cleanPill = clean;

        // The bookmark ribbon at the pane's top-right corner (#761 FR-1, #784 FR-3): a book's or a paper's only.
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
            // A scroll during a reveal completes it (#758 FR-14).
            this.layerView.finish();
            this.highlights?.onScroll();
            this.closeNote();
            this.onStageScroll();
            this.notePlace();
        });
        this.wireTouch(stage);
        // The page moved by your hand while listening (#765 FR-14): it stops following the voice.
        this.registerDomEvent(stage, "wheel", () => this.listen?.userScrolled(), { passive: true });
        this.registerDomEvent(stage, "touchmove", () => this.listen?.userScrolled(), { passive: true });
        // The paragraph you tap is where *From here* begins (FR-1).
        this.registerDomEvent(stage, "click", (event: MouseEvent) => this.noteTapped(event.target));
        // Ink (#745): its palette floats over the reading, docked in the margin.
        this.ink = new ReaderInk(
            {
                app: this.app,
                root,
                stage: () => stage,
                owner: this,
                refreshList: () => this.highlights?.refreshMargin(),
                // A stroke across a line is a highlight (#746): the same engine a selection uses.
                highlights: () => this.highlights,
                pageWords: async (index) => (this.runMode() ? ((await this.pageRun?.words(index)) ?? null) : null),
                pageLabel: (index) => this.sourceLabel(index),
                pageLocator: (index) => this.locatorOf(index),
                // Ink takes the layer new marks go to, and is shown and hidden with the rest (#758).
                layerForNew: () => this.layerTarget(),
                drawn: () => this.syncLayers(),
                // One pointer owner at a time (#763): the palette opening leaves Snapshot.
                opened: () => this.snapshot?.leave(),
            },
            this.inkDeps
        );
        // A peek is read in place; clicking elsewhere puts it away.
        this.registerDomEvent(root, "mousedown", (event) => {
            const target = event.target as HTMLElement | null;
            if (this.peek && target && !this.peek.contains(target) && !target.closest?.("a.internal-link")) this.closePeek();
            if (this.notePop && target && !this.notePop.contains(target)) this.closeNote();
            if (this.lookup?.isOpen() && target && !this.lookup.contains(target)) this.lookup.close();
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
                // The bar says which screen of the chapter this is (#812 FR-18).
                this.renderBarPlace();
            },
        });
        this.pager.configure(this.effectiveLayout(), this.bookDirection(), this.pageShape());
        // A picture arrives after the text and moves it: the pages are counted again, your line kept.
        this.registerDomEvent(
            page,
            "load",
            () => {
                this.pager?.contentChanged();
                this.layoutInk();
            },
            { capture: true }
        );
        const dots = root.createDiv({ cls: c("reader-dots"), attr: { role: "tablist", "aria-label": t("reader_contents") } });

        const bar = root.createDiv({ cls: c("reader-bar"), attr: { role: "toolbar", "aria-label": t("reader_title") } });
        this.iconButton(bar, "chevron-left", "reader_previous", () => this.go(-1));
        const label = bar.createSpan({ cls: c("reader-bar-label") });
        const progress = bar.createEl("progress", { cls: c("reader-progress") });
        const minutes = bar.createSpan({ cls: [c("reader-bar-minutes"), c("reader-hidden")].join(" ") });
        this.iconButton(bar, "chevron-right", "reader_next", () => this.go(1));
        bar.createSpan({ cls: c("reader-bar-sep") });
        const contents = this.iconButton(bar, "list", "reader_contents", () => this.toggle("contents"));
        // The overview (#776 FR-1, D6): every page or chapter as a card, one tap from any view.
        const overview = this.iconButton(bar, "layout-grid", "reader_overview", () => this.openOverview());
        overview.addClass(c("reader-hidden"));
        overview.setAttribute("aria-pressed", "false");
        // Search lives in the drawer (#812 FR-6): its button opens it there, and closes it again.
        const search = this.iconButton(bar, "search", "reader_search", () => (this.panel === "search" ? this.closePanel() : void this.openSearch()));
        search.addClass(c("reader-hidden"));
        // Listen (#765 FR-1): offered once the device's voices are known to include one of its own.
        const listen = this.iconButton(bar, "audio-lines", "reader_listen", (event) => this.openListen(event));
        listen.addClass(c("reader-hidden"));
        listen.setAttribute("data-zf-listen", "");
        this.listenButton = listen;
        // The pencil (#745 FR-1): the page takes ink while the palette is open.
        this.ink.mountButton(bar);
        const type = this.iconButton(bar, "type", "reader_type", () => this.toggle("type"));
        // Layers (#758 FR-3), beside Contents and Type: and where new marks go, when it is not reading.
        const layers = this.iconButton(bar, "layers", "reader_layers", () => this.toggle("layers"));
        this.layerLabel = bar.createSpan({ cls: [c("reader-bar-layer"), c("reader-hidden")].join(" ") });
        // The panel on the right (#777 FR-3): the icon says where it opens.
        const context = this.iconButton(bar, "panel-right", "reader_context", () => this.toggle("context"));
        // Each panel's button says whether its panel is open.
        this.panelButtons = { contents, type, layers, context, search };
        for (const button of Object.values(this.panelButtons)) button.setAttribute("aria-pressed", "false");
        context.addClass(c("reader-bar-button--dotted"));
        this.alongsideDot = context.createSpan({ cls: c("reader-bar-dot"), attr: { "aria-hidden": "true" } });
        const view = this.iconButton(bar, "file-image", "reader_source_page_view", () => this.toggleView());
        view.addClass(c("reader-hidden"));
        // Snapshot (#763 FR-1), beside Page view: the next drag on a printed page is a capture.
        const snap = this.iconButton(bar, "scan", "reader_snapshot", () => this.snapshot?.toggle());
        snap.addClass(c("reader-hidden"));
        snap.setAttribute("aria-pressed", "false");
        this.snapshotButton = snap;
        // The zoom level, beside it (#767 FR-13): the camera goes back to the width of the screen.
        const zoom = bar.createEl("button", {
            cls: [c("reader-bar-zoom"), c("reader-hidden")].join(" "),
            attr: { type: "button", "aria-label": t("reader_pv_zoom_reset") },
        });
        this.registerDomEvent(zoom, "click", () => this.pageRun?.frame(this.pageRun.designed() ? "page" : "width"));
        // Deep reading (#764 FR-1), where Fullscreen was and on every platform: the page alone does not
        // need the window's fullscreen, so it is never a dead control.
        const deep = this.iconButton(bar, "glasses", "reader_deep", () => this.toggleDeep());
        deep.setAttribute("aria-pressed", "false");
        deep.setAttribute("data-deep", "true");
        this.deepButton = deep;
        this.iconButton(bar, "keyboard", "reader_shortcuts", () => this.toggleShortcuts());

        const panel = root.createDiv({ cls: c("reader-panel") });
        this.els = { title, page, dots, label, progress, panel, stage, margin, hairline, minutes, view, search, zoom, overview };
        this.highlights = new ReaderHighlights(
            {
                app: this.app,
                host: root,
                owner: this,
                scrollTo: (el, travel) => this.scrollToEl(el, travel),
                onChange: () => {
                    // Whatever was drawn takes the layers as they are (#758).
                    this.syncLayers();
                    if (this.panel === "context") this.alongside?.update();
                    // A mark made or taken away: what a chapter end reads is read again (#755 FR-2.4).
                    void this.readSurvivedMarks();
                },
                onInk: (thoughts) => this.ink?.onInk(thoughts),
                renderInk: (host, scope) => this.ink?.renderList(host, scope),
                thinkMoves: () => this.thinkMoves(),
                passageActions: () => this.passageActions(),
                lookup: () => this.lookup,
                cite: () => this.citeAction(),
                layerForNew: () => this.layerTarget(),
                snapshotImage: (el, from) => void this.snapshotImage(el, from),
                // *Read aloud* (#765 FR-1): the selected words, where Listen is offered.
                readAloud: () => (this.listenAvailable() ? (span: TextSpan) => this.startListening("selection", span) : null),
                // The reading's undo ledger (#810): every Undo offered is Ctrl/⌘+Z's too.
                undoable: (run, check) => this.undoLedger.offer(run, check),
                // Where a popover may open (#811 FR-14): the page, down to where the bar begins.
                pageRoom: () => this.pageRoom(),
            },
            this.highlightDeps
        );
        this.snapshot = new ReaderSnapshot(this.snapshotView(root), {
            save: (app, shot, choice) => saveSnapshot(app, shot, choice, this.highlightDeps.store ?? ThoughtStore.getInstance()),
            open: (app, path) => void app.workspace.openLinkText(path, "", "tab"),
            ...this.snapshotDeps,
        });
        this.setUpListen(root);
        this.watchShape(root);
        // Words selected: Alongside follows the selection once it settles (#754 FR-2).
        const doc = (root as HTMLElement & { doc?: Document }).doc;
        if (doc) this.registerDomEvent(doc, "selectionchange", () => {
            if (this.panel === "context") this.alongside?.schedule();
        });
        this.wake();
    }

    private iconButton(parent: HTMLElement, icon: string, key: LocaleKey, onClick: (event: MouseEvent) => void): HTMLElement {
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
        const { plugin, obsidian } = readerClassNames({ ...this.prefs, layout: this.effectiveLayout() }, this.justifyHere().justified);
        // A shot's states survive a change of type or theme: taking them off would replay an entrance.
        const kept = ["reader--idle", "reader--in-shot", "reader--arrived", "reader--deep", "reader--deep-entering", "reader--deep-leaving", "reader--page-run", "reader--drawer", "reader--sheet", "reader--snapshot", "reader--listening"].filter((name) => this.root?.hasClass?.(c(name)) ?? false);
        this.root.className = [...plugin.map((name) => c(name)), ...obsidian, ...kept.map((name) => c(name))].join(" ");
    }

    /**
     * Whether the column can be justified here (#809): only where this runtime hyphenates the column's
     * language — the chapter's own, else the book's, else Obsidian's. Asked once per language.
     */
    private justifyHere(): ReturnType<typeof justifyDecision> {
        const ui = getLanguage();
        const lang = this.pageLanguage ?? ui;
        // The reader's own window's document: a pop-out has its own (#809 FR-1).
        const hyphenates = this.prefs.justify ? HyphenationSupport.getInstance().hyphenates(lang, this.root?.doc) : null;
        return justifyDecision(this.prefs.justify, hyphenates, languageName(lang, ui));
    }

    /** A chapter in another language may justify where the last did not, or the other way (#809 FR-6). */
    private rejustify(): void {
        const root = this.root;
        if (!root || !this.prefs.justify) return;
        if (root.hasClass(c("reader--justify")) === this.justifyHere().justified) return;
        this.holdReadingLine(() => this.applyPrefs());
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
        // Ink keeps its place through a change of type, in the same frame (#745 FR-22).
        if (reshapes || next.theme !== before.theme) this.layoutInk();
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
        if (reshapes) this.layoutInk();
        if (this.panel === "type") this.renderPanel();
    }

    /** Ink goes to its words again: now, and once more after the pages have been laid out (#745 FR-22). */
    private layoutInk(): void {
        const ink = this.ink;
        if (!ink) return;
        ink.layout();
        const win = this.root?.win;
        if (win && typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(() => ink.layout());
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
        this.renderBarPlace();
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
        // Recall is about the chapter on the page: another one, the leaf or the end card lets it go.
        if (this.recall && !this.recallHere(this.recall)) this.dropRecall();
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
        // A note reading has neither pages nor a book's chapters: no overview (#776 FR-1).
        els.overview.toggleClass(c("reader-hidden"), !this.sourcePath);
        els.view.toggleClass("is-active", Boolean(this.source?.hasPageView) && pageView);
        els.view.setAttribute("aria-label", t(pageView ? "reader_source_reading_view" : "reader_source_page_view"));
        els.view.setAttribute("aria-pressed", String(pageView));
        // Snapshot is Page view's (#763 FR-1): out of it, the mode is left and the door hidden.
        const snapshotOffered = this.snapshotOffered();
        this.snapshotButton?.toggleClass(c("reader-hidden"), !snapshotOffered);
        if (!snapshotOffered) this.snapshot?.leave();
        this.renderZoom();
        // The end card has nothing to read aloud: the voice stops there (#765).
        if (this.ended) this.listen?.stop();
        this.renderListenButton();
        const total = path?.chapters.length ?? 0;
        this.renderBarPlace();

        els.dots.empty();
        // One progress signal (#812 FR-16): dots for a short reading only; a book has the bar's line.
        const dotted = showDots(total);
        els.dots.toggleClass(c("reader-hidden"), !dotted);
        this.renderScope?.unload();
        const scope = new Component();
        scope.load();
        this.renderScope = scope;
        if (dotted) path?.chapters.forEach((chapter, i) => {
            const dot = els.dots.createEl("button", {
                cls: [c("reader-dot"), ...(i < this.index || this.ended ? [c("reader-dot--done")] : []), ...(i === this.index && !this.ended ? [c("reader-dot--current")] : [])].join(" "),
                attr: {
                    type: "button",
                    role: "tab",
                    "aria-selected": String(i === this.index),
                    "aria-label": t("reader_dot_label", String(i + 1), this.source ? this.sourceLabel(i) : noteName(chapter.path)),
                },
            });
            scope.registerDomEvent(dot, "click", () => this.show(i));
        });
        this.renderPill();
        this.refreshRibbon();
        // The time this sitting spends on a chapter runs for the chapter on screen (#755 FR-2.3).
        this.sitting.at(this.sittingKey());
        if (this.ended) this.renderEnd();
        else if (this.pause) this.renderLeaf();
        else void this.renderChapter();
        if (this.panel) this.renderPanel();
    }

    /** Where you are, in the bar: its label, its progress, the current dot. Nothing else is drawn. */
    private renderBarPlace(): void {
        const els = this.els;
        if (!els) return;
        const total = this.path?.chapters.length ?? 0;
        // A designed book is counted in pages (#771): a comic has no chapters to speak of. An article's
        // chapters are its sections, in the bar as in the corner of the page (#744).
        // A paper by its pages, a book by its chapters, an article by its sections (#812 FR-17).
        const counted = this.source?.designed ? "reader_source_count_page" : this.source ? COUNT_KEY[this.source.format] : "reader_chapter_label";
        // In pages, which screen of the chapter (#812 FR-18): a turn that stays in it is seen to.
        const screen = this.pagedNow() && this.pager && !this.ended && !this.pause ? this.pager.screen() : null;
        const part = screen ? screenPart(screen.view, screen.views) : null;
        const place = total ? t(counted, String(this.index + 1), String(total)) : "";
        els.label.setText(this.ended ? t("reader_finished") : part ? `${place} · ${t("reader_bar_screen", String(part.at), String(part.of))}` : place);
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

        // The ink note being written is kept with the page it was written on still there (#745 FR-9).
        this.ink?.leave("turn");
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
        // One progress signal (#812 FR-15): the bar says where you are; above the text, only a detour.
        if (detour) page.createDiv({ cls: c("reader-count"), text: t("reader_detour") });
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
        // The ink layer, inside the page so a turn carries it (#745 FR-22).
        this.ink?.attach({ body, page, notePath: reading, locator: null, component, run: false });
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
        this.listenDrawn();
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
        playChapterTurn(this.root, this.els.stage, page, readingMotion(this.plugin?.settings?.readingMotion).chapter, this.turnLooks(this.turn > 0 ? 1 : -1));
    }

    /** The way a turn looks: in a right-to-left designed book, forward is the other leaf (#771 FR-7). */
    private turnLooks(turn: 1 | -1): 1 | -1 {
        return this.designedTurns() ? visibleTurn(turn, this.bookDirection()) : turn;
    }

    /** A designed book read in *Page* or *Spread* (#771): its turns go the way the book reads. */
    private designedTurns(): boolean {
        return this.runMode() && Boolean(this.source?.designed) && this.runLayout() !== "scroll";
    }

    /** Whether you chose a layout yourself (#771): an explicit *Spread* wins over the orientation. */
    private layoutChosen(): boolean {
        const raw = this.plugin?.settings?.readerPrefs as { layout?: unknown } | undefined;
        return typeof raw?.layout === "string";
    }

    /**
     * The layout the run of pages reads (#753, #767): yours — or, for a designed book when you never
     * chose one, *Spread*, which pairs only in landscape: an iPad turned shows a spread, upright a page.
     */
    private runLayout(): ReaderLayout {
        return this.source?.designed && !this.layoutChosen() ? "spread" : this.prefs.layout;
    }

    /**
     * A reading that just opened rises (#667); a turned chapter is already there under its sheet. The
     * same element is reused, so the class is taken off and the box read once — that restarts the
     * animation instead of leaving it finished.
     */
    private turnPage(page: HTMLElement): void {
        page.removeClass(c("reader-page--enter"));
        void page.offsetWidth;
        // A card that flew to its page is that page (#776 FR-21): it does not rise again under it.
        if (this.turn === 0 && !this.flown) page.addClass(c("reader-page--enter"));
        this.turn = 0;
        this.flown = false;
    }

    /** The hairline, the minutes left and the next card, from where the page is scrolled to. */
    private onStageScroll(): void {
        const els = this.els;
        if (!els) return;
        // Alongside follows the reading when it settles — never on every frame (#754 AC-8).
        if (this.panel === "context") this.alongside?.schedule();
        const { stage } = els;
        // In pages the place is the page on show, filled page by page (#753 FR-7).
        const pager = this.pagedNow() ? this.pager : null;
        const fraction = this.ended ? 1 : pager ? pager.fraction() : readFraction(stage.scrollTop, stage.scrollHeight, stage.clientHeight);
        els.hairline.setCssProps?.({ "--zf-reader-read": String(Math.round(fraction * 1000) / 1000) });
        if (fraction >= END_OF_CHAPTER) this.reachedEnd = true;
        this.keepScroll(fraction);
        const wpm = paceWpm(this.pace);
        // A designed book has no words: its time left is its pages, at this reading's pace (#771 FR-8).
        const byPages = this.source?.designed && this.runMode();
        const pagesLeft = Math.max(0, (this.path?.chapters.length ?? 0) - this.index);
        const left = this.ended ? 0 : byPages ? minutesLeftByPages(pagesLeft, pagePace(this.pageDwells)) : minutesLeft(this.chapterWords, fraction, wpm);
        const book = this.ended || byPages ? 0 : this.bookMinutes(fraction, wpm);
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
        // A chapter of a book read to its end: its card in the overview is filled (#776 P1).
        if (reached && this.sourcePath && !this.ended) rememberChapterRead(this.app, this.plugin, this.sourcePath, this.index, this.source?.chapters.length ?? this.index + 1);
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
        this.passageHold = null;
        let offset = body && spot.bookmark ? landingOffset(chapterText(body), spot.bookmark) : spot.offset;
        if (spot.passage && body) {
            // A passage is found by its words, exactly as they were written (whitespace forgiven), and
            // nowhere else (#751 AC-4): the text is folded the way its source entry folds it, one
            // character for one, so the offset is the text's own.
            const span = anchorQuote(foldMarks(chapterText(body)), spot.passage);
            offset = span ? span.start : null;
            if (!span) this.passageMissing(spot.passage);
        }
        // The mark first: the caret made for the place is then inside it.
        const here = body && offset !== null ? markHereAt(body, offset) : null;
        const anchor = body && offset !== null ? this.anchorAt(body, offset) : null;
        // A passage sits at the reading line, where the eye reads (#751 FR-6); any other place at the top.
        const line = spot.passage ? READING_LINE : 0;
        let ms = 0;
        if (this.pagedNow()) {
            if (this.pagesPending) {
                // Laid out in pages once the chapter is complete: there, on the page that holds it.
                if (anchor) this.pendingReveal = anchor;
                else this.pendingShare = spot.share ?? 0;
            } else if (anchor) ms = pager.reveal(anchor, travel);
            else ms = pager.goToShare(spot.share ?? 0, travel);
        } else if (anchor) {
            ms = pager.reveal(anchor, travel, line);
            if (spot.passage && offset !== null) {
                this.passageHold = offset;
                // A chapter drawn in a leaf that is only now being shown has no layout yet to land on:
                // once it has, the column settles on the passage — a glide, never a jump (§XVI).
                if (!travel) this.settleOnPassage();
            }
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

    /**
     * The words of a passage are not in this edition (#751 FR-7, FR-14): said once, inline at the top
     * of the column — it slides in 8 px with a fade, and leaves the same way. No mark anywhere, no guess.
     */
    private passageMissing(quote: TextQuote): void {
        log.debug(`[Reader] the passage "${quote.exact.slice(0, 40)}" was not found in ${this.sourcePath ?? "this reading"}; opened at its chapter`);
        const page = this.els?.page;
        const body = this.chapterBody();
        if (!page || !body) return;
        page.querySelector(`.${c("reader-passage-missing")}`)?.remove();
        const line = page.createDiv({ cls: c("reader-passage-missing"), attr: { role: "status" }, text: t("reader_passage_not_found") });
        page.insertBefore(line, body);
        const win = this.root?.win ?? window;
        win.clearTimeout(this.missingTimer);
        this.missingTimer = win.setTimeout(() => {
            line.addClass(c("reader-passage-missing--leaving"));
            this.missingTimer = win.setTimeout(() => line.remove(), motionWelcome(line) ? MOTION.fast + 40 : 0);
        }, PASSAGE_MISSING_MS);
    }

    /** The passage held at the reading line, found again where it is now (a fresh caret: marks come and go). */
    private heldPassage(): PageAnchor | null {
        const body = this.chapterBody();
        return body && this.passageHold !== null ? this.anchorAt(body, this.passageHold) : null;
    }

    /** Land a held passage again once the leaf has its layout: a frame from now, and once settled. */
    private settleOnPassage(): void {
        const win = this.root?.win ?? window;
        const generation = this.generation;
        const again = () => {
            const stage = this.els?.stage;
            const held = this.heldPassage();
            if (generation !== this.generation || !stage || !held || !this.pager || this.pagedNow()) return;
            const before = stage.scrollTop;
            // Measured where it would land; glided there only if it is not there already.
            this.pager.reveal(held, false, READING_LINE);
            const top = stage.scrollTop;
            if (Math.abs(top - before) < 2) return;
            stage.scrollTop = before;
            this.pager.glideTo(top);
        };
        win.requestAnimationFrame?.(again);
        win.setTimeout(again, RESUME_SETTLE_MS);
    }

    /** You moved: a move under way ends where it was going, and the page is yours again (#751 FR-15). */
    private takeOver(): void {
        this.finishOverviewShot();
        this.pager?.settle();
        this.passageHold = null;
    }

    /** How long a mark waits: for the travel, or for the chapter turn still playing. */
    private hereDelay(ms: number): number {
        return Math.max(0, ms, this.turnLandsAt - Date.now(), originLandsAt() - Date.now());
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
        // A note opened from a chapter is one it touched (#755 FR-3), in this sitting only.
        if (notePath && this.sourcePath && !this.pause && !this.ended) {
            const seen = this.peeked.get(this.index) ?? new Set<string>();
            seen.add(notePath);
            this.peeked.set(this.index, seen);
        }

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
            // A book is read in its own pages: a note met beside it opens in a tab, never as a detour (#754).
            if (!this.sourcePath) {
                if (notePath !== this.reading()) action("reader_peek_detour", true, () => this.takeDetour(notePath));
                if (at >= 0) action("reader_peek_jump", false, () => this.show(at));
                else action("reader_peek_add", false, () => this.addToReading(notePath));
            }
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
        // Any other way off the leaf — Contents, Home, a search hit — leaves it, never as a skip (#755).
        this.leaveLeaf(false);
        this.landing = land;
        this.samplePace();
        this.notePageDwell();
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
        this.flown = flight;
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
        // On the leaf (#755 FR-6): forward keeps reading, back is the chapter's last page.
        if (this.pause) {
            if (delta > 0) {
                const after = this.pause.after;
                // Keep reading is the one way a leaf is skipped (FR-7): under four seconds, untouched.
                this.leaveLeaf(true);
                this.show(after + 1);
            } else if (delta < 0) this.backFromLeaf();
            return;
        }
        if (this.ended) {
            // Back from the end card lands on the last chapter; forward stays on the end.
            if (delta < 0) this.show(this.index, land);
            return;
        }
        // A paper in Page view, in Page or Spread: a view at a time — page 1 alone, then pairs (#767 FR-6).
        const next = this.runMode() && this.pageRun && this.runLayout() !== "scroll" ? this.pageRun.stepFrom(this.index, delta > 0 ? 1 : -1) : this.index + delta;
        if (next >= this.path.chapters.length) {
            this.finish();
            return;
        }
        if (next < 0) return;
        // A reading turn past the end of a chapter is the only turn that may pause (#755 FR-2.1).
        if (delta > 0 && this.askPause(this.index, next, land)) return;
        this.show(next, land);
    }

    // ── what survived? (#755) ────────────────────────────────────────────────

    /** The chapters of the source on screen, as their ends are decided (FR-1): an EPUB's or a PDF's only. */
    private chapterSpans(): ChapterSpan[] {
        const doc = this.source;
        // A designed book has nothing to mark, and a paper read as printed shows no section (#767).
        if (!this.sourcePath || !doc || doc.designed || this.runMode()) return [];
        return chapterEnds({ format: doc.format, chapters: doc.chapters.length, toc: doc.toc, words: (i) => this.seenWords.get(i) });
    }

    /** The chapter the sitting's clock runs for: the one on screen, or none (a leaf, the end). */
    private sittingKey(): number | null {
        if (!this.sourcePath || this.ended || this.pause) return null;
        return spanOf(this.chapterSpans(), this.index)?.start ?? null;
    }

    /** Your marks in this source, read again — one read at a time, and the last change always read. */
    private readSurvivedMarks(): Promise<void> {
        const path = this.sourcePath;
        if (!path) return Promise.resolve();
        if (this.survivedReading) return this.survivedReading.then(() => this.readSurvivedMarks());
        const store = this.highlightDeps.store ?? ThoughtStore.getInstance();
        const reading = store
            .highlightsAbout(path)
            .then((thoughts) => {
                if (this.sourcePath === path) this.survivedMarks = { path, thoughts };
            })
            .catch((error: unknown) => log.debug(`[Reader] could not read the marks of ${path}: ${String(error)}`))
            .finally(() => {
                this.survivedReading = null;
            });
        this.survivedReading = reading;
        return reading;
    }

    /**
     * Yours in a chapter, from any sitting (FR-2.4): highlights and margin notes, and your ink — never
     * a move's answer or a response. What is on the page now counts too, kept a moment ago.
     */
    private marksIn(span: ChapterSpan, also: readonly Thought[] = []): { marks: Thought[]; ink: Thought[] } {
        const kept = [...(this.survivedMarks?.path === this.sourcePath ? this.survivedMarks.thoughts : []), ...also];
        const here = span.start <= this.index && this.index <= span.end && this.highlights;
        const live = here && this.highlights ? [...this.highlights.items(), ...this.highlights.detachedItems()] : [];
        const byId = new Map<string, Thought>();
        for (const thought of [...kept, ...live]) byId.set(thought.id, thought);
        const inside = [...byId.values()]
            .filter((thought) => thought.locator && thought.locator.at >= span.start && thought.locator.at <= span.end && !thought.madeBy && !thought.respondsTo)
            .sort((a, b) => (a.locator?.at ?? 0) - (b.locator?.at ?? 0) || a.at - b.at);
        return { marks: inside.filter((thought) => !isInk(thought) && isMark(thought)), ink: inside.filter(isInk) };
    }

    /**
     * Whether this reading turn, from `from` to `to`, pauses on the leaf (FR-2) — and if it does, the
     * leaf arrives. When only *nothing marked* keeps it away, the marks are read once more first: one
     * made a moment ago may not be in the vault's cache yet. Returns whether the turn is taken here.
     */
    private askPause(from: number, to: number, land: "start" | "end"): boolean {
        const decide = () => {
            const end = endingAt(this.chapterSpans(), from, to);
            const found = end ? this.marksIn(end) : { marks: [], ink: [] };
            return shouldPause({
                how: "read",
                end,
                last: Boolean(end && end.end >= (this.path?.chapters.length ?? 0) - 1),
                sittingMs: end ? this.sitting.total(end.start) : 0,
                marks: found.marks.length + found.ink.length,
                skipPending: this.skipPending,
                listening: this.listening,
                enabled: this.chapterPauseOn(),
            });
        };
        const first = decide();
        if (first.pause) {
            this.enterLeaf(from);
            return true;
        }
        if (first.spendSkip) this.skipPending = false;
        if (first.reason !== "unmarked") return false;
        void this.readSurvivedMarks().then(() => {
            if (this.index !== from || this.ended || this.pause || !this.path) return;
            const again = decide();
            if (again.pause) this.enterLeaf(from);
            else this.show(to, land);
        });
        return true;
    }

    /** *Pause at chapter ends*, as it is now (FR-8): Settings → Reading may have changed it meanwhile. */
    private chapterPauseOn(): boolean {
        const stored = this.plugin?.settings?.readerPrefs;
        return stored ? normalizeReaderPrefs(stored).chapterPause : this.prefs.chapterPause;
    }

    /** The leaf arrives by the reader's own chapter motion, forward (FR-11). */
    private enterLeaf(after: number): void {
        if (!this.path) return;
        this.samplePace();
        const span = spanOf(this.chapterSpans(), after);
        const found = span ? this.marksIn(span) : { marks: [], ink: [] };
        this.pause = { after, arrivedAt: Date.now(), touched: false, leaf: null, drawn: false, found: [...found.marks, ...found.ink] };
        this.turn = 1;
        this.render();
    }

    /**
     * Off the leaf. Turning on from it under four seconds, untouched, is a skip (FR-7); going back to
     * the chapter, or jumping somewhere, is not one — the leaf was not turned past.
     */
    private leaveLeaf(forward: boolean): void {
        const pause = this.pause;
        if (!pause) return;
        this.pause = null;
        pause.leaf?.finish();
        this.skipPending = forward && wasSkip(pause.arrivedAt, Date.now(), pause.touched);
    }

    /** ← on the leaf (FR-14): the arrival backwards, onto the chapter's last page. */
    private backFromLeaf(): void {
        const pause = this.pause;
        if (!pause || !this.path) return;
        this.leaveLeaf(false);
        this.index = pause.after;
        this.turn = -1;
        this.landing = "end";
        this.pendingShare = this.pagedNow() ? null : 1;
        this.render();
    }

    /** The turning keys on the leaf (FR-6): → and Space keep reading, ← and Shift+Space go back. */
    private leafKey(key: string, shifted: boolean): boolean {
        if (!this.pause) return false;
        const forward = key === "ArrowRight" || key === "PageDown" || (key === " " && !shifted);
        this.go(forward ? 1 : -1);
        return true;
    }

    /** Draw the leaf into the page, where the chapter was: a page of the book, never a modal (FR-11). */
    private renderLeaf(): void {
        const pause = this.pause;
        const els = this.els;
        if (!pause || !els || !this.path) return;
        ++this.generation;
        this.closePeek();
        this.highlights?.reset();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;
        this.ink?.leave("turn");
        // The page you were on leaves the way a chapter does, and the leaf is under it (#735).
        this.turnFrom(els.page);
        this.turn = 0;
        this.flown = false;
        this.pager?.reset();
        this.chapterWords = 0;
        this.nextCard = null;
        const card = this.survivedCard(pause);
        if (!card) {
            this.pause = null;
            this.show(pause.after + 1);
            return;
        }
        pause.leaf = renderSurvivedLeaf(els.page, card, component);
        pause.drawn = true;
        els.stage.scrollTop = 0;
        this.onStageScroll();
    }

    /** What the leaf shows (FR-3): drawn only from your marks and notes, and the locale. */
    private survivedCard(pause: LeafState): SurvivedCard | null {
        const doc = this.source;
        const path = this.sourcePath;
        const span = spanOf(this.chapterSpans(), pause.after);
        if (!doc || !path || !span) return null;
        const { marks, ink } = this.marksIn(span, pause.found);
        const label = doc.chapters[pause.after]?.label;
        const number = String(pause.after + 1);
        const inkStore = this.inkDeps.store ?? ThoughtStore.getInstance();
        return {
            kicker: doc.format === "pdf" && span.title ? t("reader_survived_kicker_section", span.title) : t("reader_survived_kicker", number),
            // A chapter named by its book — not by the number the kicker already says.
            ...(doc.format !== "pdf" && label && label !== t("reader_source_chapter", number) ? { title: label } : {}),
            marks,
            ink,
            touched: this.touchedBy(span, marks).map((note) => ({ path: note, title: noteName(note) })),
            drawingOf: (thought) => inkStore.drawingOf(thought),
            // Drawn again (a change of view), the leaf is simply there: it settled once.
            motion: this.motionAllowed() && !pause.drawn,
            // The page is still turning over it: the contents settle once the turn has landed (FR-12).
            settleAfter: Math.max(0, this.turnLandsAt - Date.now()),
            actions: {
                write: (thought, origin) => (this.highlightDeps.toNote ?? ((app, chosen, from) => crystallizeHighlight(app, chosen, undefined, from)))(this.app, thought, origin),
                keepReading: () => this.go(1),
                // The same switch as the Type panel's and Settings' (FR-8): the leaf stays until you turn it.
                dontPause: () => this.savePrefs({ ...this.prefs, chapterPause: false }),
                // Recall (#760): back onto the chapter, and it is put away to be written from memory.
                recall: () => this.startRecall(),
                open: (anchor, note) => this.openPeek(anchor, note, noteName(note)),
                touched: () => {
                    pause.touched = true;
                },
            },
        };
    }

    /** The notes of yours a chapter touched (FR-3): born from it, linked from its marks, peeked from it. */
    private touchedBy(span: ChapterSpan, marks: readonly Thought[]): string[] {
        const path = this.sourcePath;
        const doc = this.source;
        if (!path || !doc) return [];
        const keys = new Set<string>();
        const peeked: string[] = [];
        for (let i = span.start; i <= span.end; i++) {
            const key = doc.chapters[i]?.key;
            if (key) keys.add(key);
            peeked.push(...(this.peeked.get(i) ?? []));
        }
        const exclude = new Set<string>([path, ...[...gatherBookNotes(this.app).values()].map((note) => note.path)]);
        const born: { path: string; cites: string[] }[] = [];
        const index = KnowledgeIndex.getInstance();
        if (index.status === "ready") {
            const name = path.split("/").pop() ?? path;
            const sameBook = (file: string) => file === path || (file.split("/").pop() ?? file) === name;
            for (const note of notesBornFrom(index.getModel().all(), exclude).get(path) ?? []) {
                const file = this.app.vault.getAbstractFileByPath(note);
                const front = file instanceof TFile ? this.app.metadataCache?.getFileCache?.(file)?.frontmatter : undefined;
                const cites: string[] = [];
                for (const value of front ? [front.source, front.sources].flat() : []) {
                    const entry = readSourceEntry(value);
                    if (entry && sameBook(entry.file) && entry.chapter) cites.push(entry.chapter);
                    // A citation written before #751 names a page: `[[paper.pdf]] p. 12`.
                    const cited = typeof value === "string" ? citedLocator(value) : null;
                    const page = cited && sameBook(cited.link) ? pageOf(cited.locator) : null;
                    if (page !== null) cites.push(`page:${page}`);
                }
                born.push({ path: note, cites });
            }
        }
        const linked: string[] = [];
        for (const mark of marks) {
            for (const link of mark.links ?? []) {
                const file = this.app.vault.getAbstractFileByPath(link.to);
                if (file instanceof TFile && file.extension === "md") linked.push(file.path);
            }
        }
        return touchedNotes({ keys, born, linked, peeked, exclude });
    }

    /** How long the designed page you leave was on screen: this reading's pace (#771 FR-8). */
    private notePageDwell(): void {
        if (!this.source?.designed) return;
        const now = Date.now();
        if (this.pageShownAt > 0) this.pageDwells.push(now - this.pageShownAt);
        if (this.pageDwells.length > 200) this.pageDwells.shift();
        this.pageShownAt = now;
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
        // What you were writing is kept before the Reader goes (#745 FR-9).
        void this.ink?.flush("close");
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
        this.ink?.leave("turn");
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
                          // Export's Undo is the reading's too (#810 FR-16): one guard with Ctrl/⌘+Z.
                          undo: this.ledgerRun(() =>
                              undoBatch(batch).then((outcome) => {
                                  this.endStatus = {
                                      text: t(outcome.hadWork && outcome.failed.length === 0 ? "reader_export_removed" : "reader_export_undo_failed"),
                                  };
                                  if (this.ended) this.render();
                              })
                          ),
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
        const chapter = this.source?.chapters[index];
        // An untitled chapter goes by its first heading once it has been drawn (#808 FR-11).
        return chapter?.heading ?? chapter?.label ?? String(index + 1);
    }

    /** Where a highlight of chapter `index` is (#681, #751 FR-5): its place, its label, its key and page. */
    private locatorOf(index: number): ThoughtLocator {
        const chapter = this.source?.chapters[index];
        // The place keeps the chapter's own label, never the heading learnt on the way (#808 FR-12).
        return { at: index, label: chapter?.label ?? String(index + 1), ...(chapter?.key ? { chapter: chapter.key } : {}), ...(chapter?.page ? { page: chapter.page } : {}) };
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
        // Another chapter: a citation of the one before goes, as on a page turn (#768 FR-10).
        this.citePanel?.close();
        this.highlights?.reset();
        this.chapter?.unload();
        const component = new Component();
        component.load();
        this.chapter = component;
        this.passageHold = null;

        // The ink note being written is kept with the page it was written on still there (#745 FR-9).
        this.ink?.leave("turn");
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
        if (this.bookDirection() === "rtl" && !asRun) page.setAttribute("dir", "rtl");
        else page.removeAttribute("dir");
        // The chapter's title above the text, filled once the body is drawn (#812 FR-15): never a count.
        const kicker = asRun ? null : page.createDiv({ cls: c("reader-count") });
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
        } else if (doc?.designed) {
            // Read-only, and said so — once a reading, quietly, on its first page (#771 FR-8).
            if (!this.designedHintShown) this.designedHint(page);
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
        let pageMarks: PageMark[] = [];
        this.pageLanguage = null;
        try {
            const drawn = await doc.draw(index, body, component, this.sourceView);
            picture = drawn.picture;
            pageMarks = drawn.pageMarks ?? [];
            // The column says what it is written in, so it hyphenates by the book's rules (#757 FR-6).
            this.pageLanguage = readingLanguage({ format: doc.format, bookLanguage: doc.language, chapterLanguage: drawn.language });
            if (this.pageLanguage) body.setAttribute("lang", this.pageLanguage);
            this.rejustify();
            this.chapterWords = drawn.words;
            this.seenWords.set(index, drawn.words);
            const named = doc.chapters[index];
            if (drawn.heading && named?.untitled && !named.heading) named.heading = drawn.heading;
            // Said once: nothing when the chapter opens with its own heading, or has no name (decision 5).
            const title = kickerTitle(named?.untitled ? named.heading : named?.label, body.querySelector("h1, h2, h3, h4, h5, h6")?.textContent ?? "");
            if (kicker) {
                kicker.setText(title);
                kicker.toggleClass(c("reader-hidden"), !title);
            }
        } catch (error) {
            log.error(`[Reader] could not draw ${path} at ${index}: ${error instanceof Error ? error.message : String(error)}`);
            if (generation === this.generation) body.createDiv({ cls: c("reader-missing"), text: t("reader_source_failed") });
        }
        if (generation !== this.generation) return;
        body.toggleClass(c("reader-source-body--picture"), picture);
        // A designed page among flowing chapters (#771 FR-1) says it once too, above itself.
        if (doc.chapters[index]?.designed && !this.designedHintShown) page.insertBefore(this.designedHint(page), body);
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
        // The ink layer of this page or chapter (#745).
        this.ink?.attach({ body, page, notePath: path, locator: this.locatorOf(index), component, run: false });
        // The highlights of this page or chapter, found again by their words (#681).
        void this.highlights?.attach(body, path, component, this.els?.margin ?? null, this.locatorOf(index), pageMarks).then(() => {
            if (generation !== this.generation) return;
            // Recall asked for on the leaf (#760): the chapter is back, and the turn lands first.
            if (this.recallPending) {
                this.recallPending = false;
                stage.win.setTimeout(() => {
                    if (generation === this.generation) this.startRecall();
                }, Math.max(0, this.turnLandsAt - Date.now()));
            }
            if (!this.pendingHighlight) return;
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
        this.listenDrawn();
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
        return Boolean(!this.ended && this.sourcePath && doc?.pages && (this.sourceView === "page" || doc.imageOnly || doc.designed));
    }

    /** In *Scroll* the run is one scroll of pages: a page change is a camera move, never a redraw. */
    private runScrolls(): boolean {
        return this.runMode() && Boolean(this.pageRun) && this.runLayout() === "scroll";
    }

    /** The one quiet line a designed page says (#771 FR-8), in the manner of Page view's hint. */
    private designedHint(page: HTMLElement): HTMLElement {
        this.designedHintShown = true;
        const hint = page.createDiv({ cls: [c("reader-source-hint"), c("reader-designed-hint")], attr: { role: "note" } });
        hint.createSpan({ text: t("reader_source_designed_hint") });
        return hint;
    }

    /** The paper's run of pages, made once per paper and kept across the chapter's redraws. */
    private ensureRun(doc: SourceDocument): PdfPageRun | null {
        const pages = doc.pages;
        const stage = this.els?.stage;
        const path = this.sourcePath;
        if (!pages || !stage || !path) return null;
        if (this.pageRun && this.pageRun.pages === pages) return this.pageRun;
        this.dropRun();
        // A designed page opens whole, fitted to the screen (#771 FR-5) — until you zoom it yourself.
        const kept = keptPageView(this.app, this.plugin, path);
        const view = doc.designed && kept.fit === undefined && kept.zoom === undefined ? { ...kept, fit: "page" as const } : kept;
        this.pageRun = new PdfPageRun(stage, {
            stage,
            pages,
            layout: () => this.runLayout(),
            layoutChosen: () => this.layoutChosen(),
            view,
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
            onSlot: (page, el, aspect) => this.ink?.decorateSlot(page, el, aspect),
            onDrawn: (page, picture) => this.ink?.toneSlot(page, picture),
            // Two fingers let go well under the smallest zoom: the page lands in its card (#776 FR-4).
            onPinchOut: (scale) => {
                if (!this.sourcePath || this.panel === "overview") return false;
                this.openOverview(scale);
                return true;
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
        // The overview's Page view cards went with the run: drawn again, from the reading view's own.
        const redraw = this.overview !== null;
        this.dropOverview();
        if (redraw) {
            win.setTimeout(() => {
                if (!this.overview && this.panel === "overview") this.renderPanel();
            }, 0);
        }
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
        // Page ink lives on the printed pages (#745 E2): fractions of each page, through every zoom —
        // attached before the pages are shown, so each page made now gets its ink.
        const path = this.sourcePath;
        if (path && this.chapter) this.ink?.attach({ body, page, notePath: path, locator: this.locatorOf(index), component: this.chapter, run: true });
        run.show(index, share);
        this.landShot();
        this.renderZoom();
        this.attachRunHighlights();

        const card = page.createDiv({ cls: c("reader-next") });
        card.createDiv({ cls: c("reader-ornament"), attr: { "aria-hidden": "true" } }).createSpan({ cls: c("reader-ornament-mark") });
        this.nextCard = card;
        const next = card.createEl("button", { cls: c("reader-next-button"), attr: { type: "button" } });
        // In a scroll of pages the card is at the end of the paper; in pages, after the view on show.
        const after = this.runLayout() === "scroll" ? total : run.stepFrom(index, 1);
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
        this.overview?.setCurrent(page);
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
        // A designed page is read-only (#771 FR-8): nothing is attached to it.
        if (!body || !path || !this.highlights || this.source?.designed) return;
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
        if (this.runLayout() === "scroll" || run.inView(target)) {
            run.travelTo(target, share, travel && this.motionAllowed());
            if (target !== this.index && this.runLayout() !== "scroll") {
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

    // ── the overview (#776): every page or chapter as a card, in one continuous shot ──────────

    /**
     * The bar's *Overview* (FR-1, FR-2), or the pinch: the overview opens as its own panel (#784), from
     * any view, and the camera pulls back from the page into its card. Asked again while it is open,
     * the same shot plays backwards. `from` is the scale two fingers left the page at (FR-23).
     */
    private openOverview(from = 1): void {
        if (!this.sourcePath || !this.source) return;
        if (this.panel === "overview") {
            this.closePanel();
            return;
        }
        this.overviewEntering = { from };
        this.toggle("overview");
    }

    /**
     * The overview's own panel (#784 FR-1): its head and ×, which stay at the top over the long grid
     * (#776 FR-15), then every page or chapter as a card.
     */
    private renderOverviewPanel(host: HTMLElement): void {
        const head = panelHead(host, "reader_overview", this.panelCloseFor("reader_close_overview"));
        head.addClass(c("reader-panel-head--sticky"));
        this.renderOverviewGrid(host.createDiv({ cls: c("reader-tab-list") }));
    }

    /** The overview's grid (FR-3): every PDF and EPUB, in both views. */
    private renderOverviewGrid(list: HTMLElement): void {
        const doc = this.source;
        const path = this.sourcePath;
        const scope = this.panelScope;
        if (!doc || !path || !scope) return;
        const { units, rtl } = overviewUnits(doc);
        this.overviewUnits = units;
        this.overviewPicked = false;
        const run = this.runMode() ? this.pageRun : null;
        const read = chaptersRead(this.plugin, path);
        const share = this.currentShare();
        const bookmarks = sourceBookmarks(this.plugin, path);
        const current = Math.max(0, Math.min(this.index, units.length - 1));
        const chapterRatio = this.chapterCardRatio();
        const flowing = units.some((unit) => unit.kind === "chapter");
        const limits = Platform.isMobile ? OVERVIEW_LIMITS.mobile : OVERVIEW_LIMITS.desktop;
        const overview = renderOverview(
            list,
            {
                units,
                rtl,
                current,
                ratio: (index) => (units[index]?.kind === "chapter" ? chapterRatio : run ? run.thumbRatio(index) : this.pageRatio(index)),
                draw: (index, picture, width, done, fail) => this.drawCard(index, picture, width, done, fail),
                marks: (index, text) => cardMarks(this.overviewMarks, bookmarks, index, text),
                progress: (index) => (units[index] ? cardProgress(units[index], current, share, read) : null),
                onPick: (index, sheet) => this.flyToCard(index, sheet),
                limit: flowing ? limits.previews : overviewLimit(Platform.isMobile),
                fade: this.motionAllowed(),
            },
            scope
        );
        this.overview = overview;
        // The marks are read once each time the overview opens (D9): they arrive on the cards.
        void overviewMarksOf(path, this.highlightDeps.store).then((marks) => {
            if (this.overview !== overview) return;
            this.overviewMarks = marks;
            overview.refreshMarks();
        });
        const entering = this.overviewEntering;
        this.overviewEntering = null;
        this.centreCard(current);
        if (!entering) return;
        // Opened, the overview holds the focus on your card: the arrows and Enter work at once (FR-16).
        overview.cardOf(current)?.focus?.({ preventScroll: true });
        this.pullBack(entering.from, list);
    }

    /** The current card in the middle of the panel, at once — the camera lands on it (FR-12). */
    private centreCard(index: number): void {
        const host = this.els?.panel;
        const card = this.overview?.cardOf(index);
        if (!host || !card) return;
        const top = card.offsetTop - Math.max(0, (host.clientHeight - card.offsetHeight) / 2);
        host.scrollTop = Math.max(0, top || 0);
    }

    /**
     * Opening is the camera pulling back (FR-20): the page you are reading shrinks into its own card,
     * and the cards settle in from just behind it — one move. Under reduced motion, at once (FR-28).
     */
    private pullBack(from: number, list: HTMLElement): void {
        const root = this.root;
        const sheet = this.overview?.sheetOf(this.index);
        if (!root || !sheet || !this.motionAllowed()) return;
        const page = this.pageGhost(from);
        if (!page) return;
        this.overviewShot = fly(root, page.ghost, page.box, boxOf(sheet), { duration: MOTION.cover });
        const grid = list.querySelector<HTMLElement>(`.${c("reader-overview")}`);
        if (grid) {
            grid.addClass(c("reader-overview--arriving"));
            (root.win ?? window).setTimeout(() => grid.removeClass(c("reader-overview--arriving")), MOTION.cover);
        }
    }

    /**
     * What the camera holds when it pulls back (FR-20): in Page view the printed page itself, copied;
     * in a flowing book the words on screen, on their paper. Scaled about its centre to where the
     * fingers left it (FR-23).
     */
    private pageGhost(scale: number): { ghost: HTMLElement; box: Box } | null {
        const root = this.root;
        const stage = this.els?.stage;
        if (!root || !stage) return null;
        const ghost = root.createDiv({ cls: c("reader-overview-ghost") });
        ghost.remove();
        let box = boxOf(stage);
        const run = this.runMode() ? this.pageRun : null;
        const slot = run?.slotRect(this.index);
        const slotEl = run ? Array.from(stage.querySelectorAll<HTMLElement>(`.${c("reader-pv-slot")}`)).find((el) => el.getAttribute("data-page") === String(this.index)) : undefined;
        if (slot && slotEl) {
            box = slot;
            const copy = slotEl.cloneNode(true) as HTMLElement;
            copyLive(slotEl, copy);
            copy.addClass(c("reader-overview-ghost-picture"));
            ghost.appendChild(copy);
        } else {
            // The page as you see it: a copy of it, at its own width, scrolled where you are — the same
            // type, the same lines, the same marks. Only what is on screen shows through the ghost.
            const page = this.els?.page;
            if (page) {
                const copy = page.cloneNode(true) as HTMLElement;
                copy.removeClass(c("reader-page--enter"), c("reader-page--under-scrub"));
                copy.addClass(c("reader-overview-ghost-page"));
                copy.setCssProps({ "--zf-ghost-shift": `${-Math.round(stage.scrollTop)}px`, "--zf-ghost-page-w": `${Math.round(page.offsetWidth || box.width)}px` });
                ghost.appendChild(copy);
            }
        }
        if (scale < 1) {
            const w = box.width * scale;
            const h = box.height * scale;
            box = { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
        }
        return { ghost, box };
    }

    /** A card's shape for a flowing chapter: the page as you see it, never wider than a sheet. */
    private chapterCardRatio(): number {
        const r = this.els?.stage.getBoundingClientRect();
        const ratio = r && r.width > 0 && r.height > 0 ? r.height / r.width : 1.294;
        return Math.min(1.6, Math.max(1, ratio));
    }

    /** A printed page's shape in the reading view: the first page's, turned as you turned it (P3). */
    private pageRatio(index: number): number {
        const first = this.source?.pages?.first;
        if (!first || !(first.width > 0) || !(first.height > 0)) return 1.294;
        return this.rotationOf(index) % 180 !== 0 ? first.width / first.height : first.height / first.width;
    }

    /** The quarter turns you gave a page in Page view (#767 FR-9): its card shows it as you read it. */
    private rotationOf(index: number): number {
        const path = this.sourcePath;
        return path ? (keptPageView(this.app, this.plugin, path).rotate?.[index] ?? 0) : 0;
    }

    /**
     * Draw one card (FR-5, FR-7): in Page view a printed page through the run's own queue, after the
     * pages on screen (P7); a designed page mounted inside its own boundary (#771); in the reading view
     * a printed page, or a chapter's start in your type, one at a time (FR-6, D11). Returns its let-go.
     */
    private drawCard(index: number, picture: HTMLElement, width: number, done: (text?: string) => void, fail: (error: unknown) => void): () => void {
        const doc = this.source;
        const unit = this.overviewUnits[index];
        if (!doc || !unit) return () => undefined;
        const run = this.runMode() ? this.pageRun : null;
        const pages = doc.pages;
        if (unit.kind === "page" && run && pages?.render) {
            const canvas = picture.createEl("canvas", { cls: c("reader-overview-canvas") });
            return run.drawThumb(index, canvas, width, () => done(), fail);
        }
        if (unit.kind === "page" && doc.designed && pages?.mount) return this.queueCard((alive) => this.mountCard(index, picture, width, alive), done, fail);
        if (unit.kind === "page" && doc.format === "pdf" && pages?.render) return this.queueCard((alive) => this.renderCard(index, picture, width, alive), done, fail);
        return this.queueCard((alive) => this.previewCard(index, picture, width, alive), done, fail);
    }

    /** One card drawn after another (the reading view has no run to queue them): returns its let-go. */
    private queueCard(work: (alive: () => boolean) => Promise<{ text?: string; release(): void } | null>, done: (text?: string) => void, fail: (error: unknown) => void): () => void {
        let release: (() => void) | null = null;
        const job = {
            cancelled: false,
            run: async () => {
                try {
                    const drawn = await work(() => !job.cancelled);
                    if (!drawn) return;
                    if (job.cancelled) {
                        drawn.release();
                        return;
                    }
                    release = () => drawn.release();
                    done(drawn.text);
                } catch (error) {
                    if (!job.cancelled) fail(error);
                }
            },
        };
        this.cardQueue.push(job);
        this.pumpCards();
        return () => {
            job.cancelled = true;
            release?.();
            release = null;
        };
    }

    private pumpCards(): void {
        if (this.cardRunning) return;
        while (this.cardQueue.length > 0 && this.cardQueue[0].cancelled) this.cardQueue.shift();
        const job = this.cardQueue.shift();
        if (!job) return;
        this.cardRunning = true;
        void job.run().finally(() => {
            this.cardRunning = false;
            this.pumpCards();
        });
    }

    /** A printed page in the reading view (FR-6): drawn small, never through Page view. */
    private async renderCard(index: number, picture: HTMLElement, width: number, alive: () => boolean): Promise<{ release(): void } | null> {
        const pages = this.source?.pages;
        if (!pages?.render || !alive()) return null;
        const size = await pages.size(index);
        if (!alive()) return null;
        const rotation = this.rotationOf(index);
        const across = rotation % 180 !== 0 ? size.height : size.width;
        const pixels = cardPixels(width, width, picture.win?.devicePixelRatio ?? 1).width;
        const canvas = picture.createEl("canvas", { cls: c("reader-overview-canvas") });
        const task = pages.render(index, canvas, { scale: pixels / Math.max(1e-6, across), rotation });
        await task.promise;
        return {
            release: () => {
                task.cancel();
                canvas.width = 0;
                canvas.height = 0;
            },
        };
    }

    /** A designed page (#771 FR-3, FR-4, AC-11): mounted inside its own boundary, at its size, scaled. */
    private async mountCard(index: number, picture: HTMLElement, width: number, alive: () => boolean): Promise<{ release(): void } | null> {
        const pages = this.source?.pages;
        if (!pages?.mount || !alive()) return null;
        const size = await pages.size(index);
        if (!alive()) return null;
        const box = picture.createDiv({ cls: c("reader-overview-designed") });
        box.setCssProps({ "--zf-fxl-scale": String(Math.round((width / Math.max(1, size.width)) * 100000) / 100000) });
        const task = pages.mount(index, box);
        await task.promise;
        // A page that could not be drawn keeps its paper and its label (P12): the line is the page's.
        if (box.querySelector(`.${c("reader-designed-failed")}`)) {
            task.cancel();
            throw new Error(`designed page ${index + 1} not drawn`);
        }
        return { release: () => task.cancel() };
    }

    /**
     * A flowing chapter's card (D11): how its page starts, drawn at the column's width in your face,
     * size and theme, then made small — and only its first blocks kept. Its text places its ticks (P2).
     */
    private async previewCard(index: number, picture: HTMLElement, width: number, alive: () => boolean): Promise<{ text?: string; release(): void } | null> {
        const doc = this.source;
        if (!doc || !alive()) return null;
        const column = Math.round(this.chapterBody()?.clientWidth || this.els?.stage.clientWidth || 600);
        const preview = picture.createDiv({ cls: c("reader-overview-preview") });
        preview.setCssProps({ "--zf-card-column": `${column}px`, "--zf-card-scale": String(Math.round((width / Math.max(1, column)) * 10000) / 10000) });
        const body = preview.createDiv({ cls: ["markdown-rendered", c("reader-body"), c("reader-source-body"), c(`reader-source-body--${doc.format}`)].join(" ") });
        const component = new Component();
        component.load();
        try {
            await doc.draw(index, body, component, "reading");
        } catch (error) {
            component.unload();
            throw error;
        }
        if (!alive()) {
            component.unload();
            return null;
        }
        const text = chapterText(body);
        pruneBlocks(body, PREVIEW_BLOCKS);
        return { text, release: () => component.unload() };
    }

    /**
     * A card becomes its page (FR-21, §XVI): the page is put on screen at once and the card flies from
     * its slot to where the page sits — as a cover becomes the book (#734). Another chapter is the
     * flight itself, with no chapter turn on top; the chapter you are in lands on your place, marked.
     * The overview closes in every shape (D15). Under reduced motion, the page is simply there.
     */
    private flyToCard(index: number, sheet: HTMLElement): void {
        const root = this.root;
        const stage = this.els?.stage;
        const unit = this.overviewUnits[index];
        if (!root || !stage || !unit) return;
        // A second pick ends the first flight before it starts its own (FR-26).
        this.finishOverviewShot();
        const from = boxOf(sheet);
        // The chapter you are in lands on your place: what grows from its card is the page as you left
        // it, not the chapter's start (FR-13, FR-21).
        const here = !this.runMode() && index === this.index;
        const page = this.motionAllowed() && here ? this.pageGhost(1) : null;
        const ghost = page?.ghost ?? (this.motionAllowed() ? cardGhost(root, sheet) : null);
        this.leaveTrail("contents");
        this.overviewPicked = true;
        const run = this.runMode() ? this.pageRun : null;
        if (run) {
            if (this.runLayout() === "scroll" || run.inView(index)) {
                run.travelTo(index, 0, false);
                if (this.runLayout() !== "scroll" && index !== this.index) {
                    this.index = index;
                    this.renderBarPlace();
                }
            } else {
                this.flight = true;
                this.show(index);
            }
        } else if (index !== this.index) {
            this.flight = true;
            this.show(index);
        } else {
            // The chapter you are reading: your place, never its top (FR-13), marked a moment.
            this.markReadingLine();
        }
        this.overview?.setCurrent(index);
        const to = (run ? run.slotRect(index) : null) ?? boxOf(stage);
        if (ghost) this.overviewShot = fly(root, ghost, from, page?.box ?? to, { duration: MOTION.cover, ...(page ? { grown: true } : {}) });
        this.closePanel();
    }

    /** Leaving without a pick (FR-22): the current card grows back into the page — the reverse shot. */
    private returnToPage(): void {
        const root = this.root;
        const stage = this.els?.stage;
        const sheet = this.overview?.sheetOf(this.index);
        if (!root || !stage || !sheet || this.overviewPicked || !this.motionAllowed()) return;
        this.finishOverviewShot();
        const run = this.runMode() ? this.pageRun : null;
        const to = run?.slotRect(this.index) ?? boxOf(stage);
        // The reverse of opening (FR-20): the page as you left it grows from its card back into place.
        const page = this.pageGhost(1);
        this.overviewShot = page
            ? fly(root, page.ghost, boxOf(sheet), page.box, { duration: MOTION.cover, grown: true })
            : fly(root, cardGhost(root, sheet), boxOf(sheet), to, { duration: MOTION.cover });
    }

    /** Any input during a shot jumps it to its end (FR-26). */
    private finishOverviewShot(): void {
        const shot = this.overviewShot;
        this.overviewShot = null;
        if (shot && shot.playState !== "finished") shot.finish?.();
    }

    /** The block at the reading line, washed for a moment — *you are here* (#761 FR-17). */
    private markReadingLine(): void {
        const stage = this.els?.stage;
        if (!stage) return;
        const at = blockAtLine(this.blocks(), stage.scrollTop + stage.clientHeight * READING_LINE);
        const block = this.blockElements()[at];
        if (block) markHereOn([block], MOTION.cover);
    }

    /** The overview let go: its cards, its drawings and its queue. */
    private dropOverview(): void {
        this.overview?.dispose();
        this.overview = null;
        for (const job of this.cardQueue) job.cancelled = true;
        this.cardQueue = [];
    }

    // ── search inside the book (#719) ───────────────────────────────────────

    /** Ctrl/Cmd+F or the bar's search: a slim bar under the top, focused. Books and papers only. */
    private openSearch(): boolean {
        if (!this.sourcePath || !this.root) return false;
        // Search is one of the drawer's panels (#812 FR-6): opened there, or brought forward in it.
        if (this.panel !== "search") {
            this.panel = "search";
            this.renderPanel();
        }
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
        const bar = this.els?.panel ? this.els.panel.createDiv({ cls: c("reader-search"), attr: { role: "search" } }) : this.root.createDiv({ cls: c("reader-search"), attr: { role: "search" } });
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
        button("x", "reader_search_close", () => this.closePanel());
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
                this.closePanel();
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
        if (!doc || !root || doc.imageOnly || doc.designed) return Promise.resolve(null);
        const generation = this.sourceGeneration;
        this.searchCount?.setText(t("reader_search_reading"));
        this.searchBuilding = (async () => {
            const texts: string[] = [];
            const win = root.win ?? window;
            for (let i = 0; i < doc.chapters.length; i++) {
                // Drawn aside, as the page draws it, so a match's offsets are the page's own.
                // A designed page has no text to search (#771 FR-8): it is not drawn for it.
                if (doc.chapters[i]?.designed) {
                    texts.push("");
                    continue;
                }
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
            this.searchCount?.setText(t(this.source?.imageOnly ? "reader_search_scan" : this.source?.designed ? "reader_search_designed" : "reader_search_unavailable"));
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
        // The look-up card floats over the words as a footnote does, and goes as it goes (#766 FR-7).
        this.lookup?.close();
        // So does the cite panel (#768 FR-10): Esc, a click outside, a page turn.
        this.citePanel?.close();
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
        // Contents holds places only (#812 FR-10): Recall and the notebook are in its head.
        const sourcePath = this.sourcePath;
        const read = sourcePath ? chaptersRead(this.plugin, sourcePath) : new Set<number>();
        const seen = new Set(this.seenWords.keys());
        const entries = doc.toc.length > 0 ? doc.toc : doc.chapters.map((chapter, i) => ({ title: chapter.label, chapter: i, depth: 0 }));
        // The entry you are in: the first one of the chapter on screen — its own heading, not the last
        // heading inside it — or, when the chapter has none, the last one before it.
        let current = entries.findIndex((entry) => entry.chapter === this.index);
        if (current < 0) {
            entries.forEach((entry, i) => {
                if (entry.chapter < this.index) current = i;
            });
        }
        entries.forEach((entry, i) => {
            const row = host.createEl("button", {
                cls: [c("reader-toc-row"), c(`reader-toc-row--depth-${Math.min(entry.depth, 3)}`), ...(i === current ? [c("reader-toc-row--current")] : [])].join(" "),
                attr: { type: "button" },
            });
            // How far it is read, quietly, never as a number (#812 FR-13).
            const state = chapterState(entry.chapter, this.index, seen, this.ended, read);
            this.tocState(row, state);
            row.createSpan({ cls: c("reader-toc-name"), text: entry.title });
            // Where the entry is, when its own name does not already say it (an article's section is its heading).
            const where = this.sourceLabel(entry.chapter);
            if (doc.toc.length > 0 && where !== entry.title) row.createSpan({ cls: c("reader-toc-role"), text: where });
            row.setAttribute("data-chapter", String(entry.chapter));
            row.setAttribute("aria-label", `${entry.title} · ${t(TOC_STATE_KEY[state])}`);
            if (i === current) row.setAttribute("aria-current", "step");
            // A Contents entry is a jump: where you were stays one press away (#718).
            this.panelScope?.registerDomEvent(row, "click", () =>
                this.jumpTo(entry.chapter, "fragment" in entry && typeof entry.fragment === "string" ? entry.fragment : undefined, "contents")
            );
        });
        // One mark where you marked something (#812 FR-14): read once each time Contents opens, and
        // drawn at once on every redraw while it stays open — never a flicker as a chapter turns.
        if (!sourcePath) return;
        const opening = this.panelShown !== "contents" || this.contentsMarks?.path !== sourcePath;
        if (this.contentsMarks && !opening) this.markRows(host, this.contentsMarks.at);
        if (!opening) return;
        this.contentsMarks = null;
        void overviewMarksOf(sourcePath, this.highlightDeps.store).then((marks) => {
            if (this.sourcePath !== sourcePath) return;
            this.contentsMarks = { path: sourcePath, at: new Set(marks.map((mark) => mark.at)) };
            const panel = this.els?.panel;
            if (panel && this.panel === "contents") this.markRows(panel, this.contentsMarks.at);
        });
    }

    /** The rows of chapters you marked something in get their one mark (#812 FR-14). */
    private markRows(host: HTMLElement, marked: ReadonlySet<number>): void {
        for (const row of Array.from(host.querySelectorAll<HTMLElement>("[data-chapter]"))) {
            if (!marked.has(Number(row.getAttribute("data-chapter"))) || row.querySelector(`.${c("reader-toc-mark")}`)) continue;
            row.createSpan({ cls: c("reader-toc-mark"), attr: { "aria-hidden": "true" } });
            row.setAttribute("aria-label", `${row.getAttribute("aria-label") ?? ""} · ${t("reader_toc_marked")}`);
        }
    }

    /** A Contents row's state (#812 FR-13): a small glyph, and its words for a screen reader. */
    private tocState(row: HTMLElement, state: ChapterState): void {
        row.addClass(c(`reader-toc-row--${state}`));
        row.createSpan({ cls: [c("reader-toc-state"), c(`reader-toc-state--${state}`)], attr: { "aria-hidden": "true" } });
    }

    /** The open Contents list, scrolled so the place you are is in view before it is seen (#812 MF-6). */
    private scrollToCurrent(host: HTMLElement): void {
        const current = host.querySelector<HTMLElement>('[aria-current="step"]');
        if (!current) return;
        host.scrollTop = Math.max(0, current.offsetTop - host.clientHeight / 2 + current.offsetHeight / 2);
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

    // ── recall (#760) ────────────────────────────────────────────────────────

    /**
     * The chapter recall is about (FR-1): an EPUB's chapter, a paper's section, an article's section —
     * the one you are in, or the one the leaf ends. Never a designed book, a paper read as printed, or
     * a reading of notes.
     */
    private recallSpan(): ChapterSpan | null {
        const doc = this.source;
        if (!this.sourcePath || !doc || doc.designed || this.runMode() || this.ended) return null;
        const index = this.pause ? this.pause.after : this.index;
        if (index < 0 || index >= doc.chapters.length) return null;
        return spanOf(this.chapterSpans(), index) ?? { start: index, end: index };
    }

    /** The chapter, as the card names it and the note cites it. */
    private recallChapter(span: ChapterSpan): RecallChapter | null {
        const doc = this.source;
        const path = this.sourcePath;
        if (!doc || !path) return null;
        const first = doc.chapters[span.start];
        const name = doc.format === "pdf" && span.title ? span.title : this.sourceLabel(span.start);
        return {
            key: `${path}#${span.start}`,
            name,
            proposal: t("reader_recall_title", name),
            citation: recallCitation({ file: path, ...(first?.key ? { chapter: first.key } : {}), label: name, ...(first?.page ? { page: first.page } : {}), bookTitle: doc.title }),
        };
    }

    /** Whether a recall is still about the page on screen. */
    private recallHere(session: RecallSession): boolean {
        if (this.pause || this.ended) return false;
        const span = this.recallSpan();
        return Boolean(span && this.sourcePath && session.chapter.key === `${this.sourcePath}#${span.start}`);
    }

    /**
     * *Recall this chapter* (FR-1, FR-2): from Contents, or the leaf. The page slides away as a sheet,
     * your marks go, and the card beside the page asks for the chapter in your own words. On the leaf,
     * the book goes back onto the chapter first, and recall begins once it has landed.
     */
    private startRecall(): void {
        if (this.pause) {
            this.recallPending = true;
            this.backFromLeaf();
            return;
        }
        const span = this.recallSpan();
        const chapter = span ? this.recallChapter(span) : null;
        if (!span || !chapter || !this.els || !this.root) return;
        if (this.recall?.chapter.key === chapter.key) {
            if (this.panel !== "recall") {
                this.panel = "recall";
                this.renderPanel();
            }
            return;
        }
        if (this.recall) this.endRecall();
        this.closePeek();
        this.highlights?.hidePopover();
        const session = new RecallSession(chapter, this.recallPort(chapter, span), this.recallDrafts.get(chapter.key) ?? "");
        this.recall = session;
        void session.start(() => {
            this.panel = "recall";
            this.renderPanel();
            this.wake();
        });
    }

    /** What the card needs of the Reader: the fold, #758's one mechanism, the chapter's marks, the writer. */
    private recallPort(chapter: RecallChapter, span: ChapterSpan): RecallPort {
        return {
            fold: (way) => (this.root && this.els ? playFold(this.root, this.els.stage, this.els.page, way, chapter.name) : Promise.resolve()),
            hideMarks: () => {
                this.recallWasClean = this.layerView.isClean();
                this.layerView.hideAll();
            },
            revealMarks: () => {
                if (!this.layerView.isClean()) return;
                // Reading clean ends here too: you asked to see your marks.
                this.showCleanPill(false, false);
                this.layerView.reveal();
            },
            marksDrawn: () => this.layerView.apply(),
            marks: () => this.marksIn(span).marks,
            draft: (words) => {
                if (words.trim()) this.recallDrafts.set(chapter.key, words);
                else this.recallDrafts.delete(chapter.key);
            },
            flowName: () => recallFlowName(),
            keep: async (title, words) => {
                const path = this.sourcePath;
                if (!path) return null;
                const result = await keepRecall(this.app, { title, words, citation: chapter.citation, sourcePath: path });
                if (!result.ok) return null;
                if (result.flow) return { title, flow: recallFlowName() };
                const written = result.path ?? "";
                const batch = result.batch;
                return {
                    title: noteName(written),
                    open: () => void this.app.workspace.openLinkText(written, "", "tab"),
                    // Recall's Undo is the reading's too (#810 FR-16).
                    ...(batch ? { undo: this.ledgerUndo(() => undoRecall(batch)) } : {}),
                };
            },
            done: () => this.closePanel(),
            motion: () => this.motionAllowed(),
        };
    }

    /**
     * Recall ends (FR-7, FR-8): what you wrote stays as a draft, and — when the page is still away — it
     * comes back the way it went, then your marks, unless you were reading clean before.
     */
    private endRecall(): void {
        const session = this.recall;
        if (!session) return;
        this.recall = null;
        session.keepDraft();
        session.unmount();
        if (!session.isFolded() || !this.root || !this.els) return;
        const wasClean = this.recallWasClean;
        void playFold(this.root, this.els.stage, this.els.page, "back", session.chapter.name).then(() => {
            if (!wasClean && this.layerView.isClean()) this.layerView.reveal();
        });
    }

    /** Recall let go at once: the page it was about is going (a turn, a jump, the leaf). */
    private dropRecall(): void {
        const session = this.recall;
        if (!session) return;
        this.recall = null;
        session.keepDraft();
        session.unmount();
        if (this.root && this.els) unfoldAtOnce(this.root, this.els.page);
        if (!this.recallWasClean && this.layerView.isClean()) {
            this.layerView.reveal();
            this.layerView.finish();
        }
        if (this.panel === "recall") {
            this.panel = null;
            this.renderPanel();
        }
    }

    // ── panels ───────────────────────────────────────────────────────────────

    private toggle(panel: Exclude<Panel, null>): void {
        // Asked for again while it slides away: it stays (#754, #812 MF-2) — any panel of the drawer.
        if (this.panel === panel && this.alongsideLeaving !== undefined) {
            (this.root?.win ?? window).clearTimeout(this.alongsideLeaving);
            this.alongsideLeaving = undefined;
            this.els?.panel.removeClass(c("reader-panel--leaving"));
            if (panel === "context") this.alongside?.remember(true);
            this.syncPanelButtons(panel);
            return;
        }
        if (this.panel === panel) {
            this.closePanel();
            return;
        }
        this.panel = panel;
        // Whether Alongside is open is kept on this device (#754 FR-13).
        this.alongside?.remember(panel === "context");
        this.renderPanel();
        // A panel open over the page keeps the chrome with it, in deep reading too (#764 FR-3).
        this.wake();
    }

    private renderPanel(): void {
        if (!this.els) return;
        const host = this.els.panel;
        // In portrait on a tablet or a phone the panel is a bottom sheet (FR-7); Alongside lies beside
        // the column (#754 FR-14); the other panels are a card over the page.
        const asSheet = this.panel !== null && this.panelIsSheet();
        // One drawer (#812 FR-1): every panel lies beside the column — the page reflows next to it,
        // never under it. Only the overview, a page of cards, keeps its own shape.
        const shape = this.panel === null ? null : asSheet ? "sheet" : this.panel === "overview" ? "card" : "side";
        // Another panel in the drawer already open (#812 FR-5): its content changes, the drawer stays.
        const swap = shape !== null && shape !== "card" && shape === this.panelShape && this.panelShown !== null && this.panelShown !== this.panel;
        // Alongside, still open in the same shape, moves in place: its cards follow the reading, never
        // a redraw (#754 FR-19).
        if (this.panel === "context" && shape === this.panelShape && this.alongside?.isMounted(host)) {
            this.alongside.update();
            return;
        }
        // Where the Type panel's markers were, so the one that changed slides from there (#753 FR-14).
        const markers = this.panel === "type" || this.panel === "layers" ? snapshotMarkers(host) : undefined;
        this.dropOverview();
        // The proposals in Alongside go with it, with no verdict (#756 AC-7).
        this.vaultMoves?.dismissAll();
        // The AI moves' cards are kept: their answers are still coming (#759 FR-14).
        this.aiMoves?.detach();
        // The claim sheet stays while Alongside does — drawn again, it goes back in; otherwise it goes.
        if (this.panel !== "context") this.claimLink?.drop();
        this.alongside?.unmount();
        // Another panel, or none: recall ends — the page comes back, nothing written (#760 FR-7).
        if (this.recall && this.panel !== "recall") this.endRecall();
        this.recall?.unmount();
        (this.root?.win ?? window).clearTimeout(this.alongsideLeaving);
        this.alongsideLeaving = undefined;
        // Search keeps its field, its words and its focus through a redraw (#812 FR-6): the same element
        // goes back into the drawer. Leaving it for another panel takes its marks away (decision 7).
        const keptSearch = this.panel === "search" ? this.searchEl : null;
        if (keptSearch) keptSearch.remove();
        if (this.panelShown === "search" && this.panel !== "search") this.closeSearch();
        // Type drawn again after a pick keeps where you had scrolled it to (#809 FR-14).
        const typeScroll = this.panel === "type" && this.panelShape === shape ? host.scrollTop : 0;
        host.empty();
        this.panelScope?.unload();
        const scope = new Component();
        scope.load();
        this.panelScope = scope;
        this.panelShape = shape;
        host.toggleClass(c("reader-panel--open"), this.panel !== null);
        host.toggleClass(c("reader-panel--sheet"), asSheet);
        // A sheet lifts the bar above it, so its door stays in reach (#777 FR-3).
        this.root?.toggleClass(c("reader--sheet"), asSheet);
        this.syncPanelButtons(this.panel);
        host.toggleClass(c("reader-panel--side"), shape === "side");
        host.removeClass(c("reader-panel--leaving"));
        // The column makes room for Alongside, the paragraph you are reading kept where it is (FR-17).
        this.setDrawerColumn(shape === "side");
        // The overview opens the sheet at its full height: a page of cards (#776 D5, P8).
        if (asSheet) this.openSheet(host, scope, this.panel === "overview");
        else this.dropSheet();
        if (this.panel === "contents") this.renderContents(host);
        else if (this.panel === "overview") this.renderOverviewPanel(host);
        else if (this.panel === "type") {
            // Pause at chapter ends is one value with Settings → Reading (#755 FR-8): as it is there now.
            this.prefs = { ...this.prefs, chapterPause: this.chapterPauseOn() };
            // A designed book you never chose a layout for reads *Spread* (#771): the row says so, and
            // only a layout you pick is kept as your choice.
            const shown = this.runMode() ? { ...this.prefs, layout: this.runLayout() } : this.prefs;
            renderTypePanel(host, shown, scope, (next) => this.savePrefs(next.layout === shown.layout ? { ...next, layout: this.prefs.layout } : next), markers, { ...this.typeContext(), close: { label: "reader_close_type", onClose: () => this.closeFromPanel(), scope } });
            if (typeScroll) host.scrollTop = typeScroll;
        }
        else if (this.panel === "layers") this.renderLayers(host, scope, markers);
        else if (this.panel === "search" && keptSearch) host.appendChild(keptSearch);
        else if (this.panel === "recall") this.recall?.mount(host, scope, { label: "reader_close_recall", onClose: () => this.closeFromPanel(), scope });
        else if (this.panel === "context") {
            this.alongside?.mount(host, scope);
            this.aiMoves?.attach(this.alongside?.proposalsHost() ?? null);
            this.claimLink?.attach(host);
            // The margin's list, drawn again in the panel, takes the layers as they are.
            this.layerView.apply();
        }
        this.panelShown = this.panel;
        // A swap fades what the drawer holds in, a beat, opacity and a few pixels only (#812 MF-3).
        if (swap && this.motionAllowed()) for (const child of Array.from(host.children)) child.addClass(c("reader-drawer-swap"));
    }

    /**
     * The column narrows for Alongside on a wide pane, or widens back, in one layout — and the
     * paragraph at the reading line stays where your eye is (#754 FR-17, AC-10).
     */
    private setDrawerColumn(on: boolean): void {
        const root = this.root;
        if (!root || root.hasClass(c("reader--drawer")) === on) return;
        this.holdReadingLine(() => root.toggleClass(c("reader--drawer"), on));
    }

    /** Keep the block at the reading line, and how far into it the line is, through `change`. */
    private holdReadingLine(change: () => void): void {
        const stage = this.els?.stage;
        // A paper in Page view lays its pages out again for the new width, the page you were on kept (#767).
        if (stage && this.runMode() && this.pageRun) {
            change();
            this.pageRun.reshape();
            return;
        }
        // In pages the pager keeps its own place through the stage's change, on its own observer (#753).
        if (!stage || this.pagedNow() || this.runMode()) {
            change();
            return;
        }
        const line = stage.getBoundingClientRect().top + stage.clientHeight * READING_LINE;
        const el = this.blockElements().find((block) => {
            const r = block.getBoundingClientRect();
            return r.top + r.height > line;
        });
        const was = el?.getBoundingClientRect();
        change();
        if (!el || !was) return;
        const within = was.height > 0 ? Math.min(1, Math.max(0, (line - was.top) / was.height)) : 0;
        const now = el.getBoundingClientRect();
        const shift = now.top + within * now.height - (was.top + within * was.height);
        if (Math.abs(shift) >= 1) stage.scrollTop = Math.max(0, stage.scrollTop + shift);
        const blocks = this.blocks();
        if (blocks.length > 0) this.place = placeAt(blocks, stage.scrollTop);
    }

    /** The *Think* row's moves (#756 FR-1): in a book or a paper, answered by your vault. */
    private thinkMoves(): ThinkMove[] {
        if (!this.sourcePath || !this.vaultMoves) return [];
        const run = (move: VaultMoveId) => (passage: ThinkPassage, from: ProposalBox) => {
            const book = this.sourcePath;
            if (!book) return;
            void this.vaultMoves?.run(move, { ...passage, book, bookTitle: this.source?.title ?? noteName(book) }, from);
        };
        // The AI's six after them (#759), by the gate as it is each time the popover opens (FR-3).
        const ask = (move: ReaderAiMoveId) => (passage: ThinkPassage, from: ProposalBox) => {
            const book = this.sourcePath;
            if (!book) return;
            const around = this.highlights?.contextOf(passage.quote) ?? { paragraph: passage.quote.exact, previous: "" };
            this.aiMoves?.run(move, { ...passage, ...around, book, bookTitle: this.source?.title ?? noteName(book) }, from);
        };
        return [
            { id: "contradict", label: "reader_move_contradict", run: run("contradict") },
            { id: "connect", label: "reader_move_connect", run: run("connect") },
            ...(this.aiMoves?.thinkMoves(ask) ?? []),
        ];
    }

    /**
     * *Cite* (#768 FR-1): a passage of the book, the paper or the article open now, from what its note
     * (or its frontmatter) says and where the passage is (#751). Never a write.
     */
    private citeAction(): ((passage: ThinkPassage, from: { left: number; top: number; width: number; height: number }) => void) | null {
        const path = this.sourcePath;
        const doc = this.source;
        const panel = this.citePanel;
        if (!path || !doc || !panel) return null;
        return (passage, from) => {
            const locator = passage.locator;
            panel.show({
                source: citeSourceOf(this.app, path, doc.format, doc.title || noteName(path)),
                file: path,
                ...(locator.chapter ? { chapterKey: locator.chapter } : {}),
                // An article is cited as a page of the web: its section is no place a style names.
                place: doc.format === "article" ? {} : { ...(locator.page ? { page: locator.page } : {}), chapter: locator.label },
                passage: passage.quote.exact,
                from,
            });
        };
    }

    /** The form chosen last (#768 FR-2), kept in the plugin's data. */
    private saveCiteForm(form: CiteForm): void {
        const settings = this.plugin?.settings;
        if (!settings || settings.citeForm === form) return;
        settings.citeForm = form;
        void this.plugin?.saveSettings?.()?.catch?.((error: unknown) => log.error(`[Reader] could not save: ${String(error)}`));
    }

    /**
     * *Add it* (#768 FR-4): the source's details in the Library, at the field a citation lacks. From
     * the Library, its own leaf comes back on the detail (#733); otherwise the Library opens beside.
     */
    private addCiteField(file: string, field: MissingField): void {
        if (this.back) return exitReader(this.app, this.leaf, { ...this.back, detail: file, field });
        void openLibrary(this.app, file, undefined, field);
    }

    /** *Claim* and *Link to an idea* (#762 FR-1): in a book or a paper, where a passage has a page. */
    private passageActions(): PassageActions | null {
        const book = this.sourcePath;
        const claimLink = this.claimLink;
        if (!book || !claimLink) return null;
        const full = (passage: ThinkPassage): VaultMovePassage => ({ ...passage, book, bookTitle: this.source?.title ?? noteName(book) });
        return {
            claim: (passage, from) => claimLink.claim(full(passage), from),
            link: (passage, container, from, close) => void claimLink.link({ ...full(passage), paragraph: this.highlights?.contextOf(passage.quote).paragraph }, container, from, close),
        };
    }

    /**
     * *Claim* on an accepted *What's the claim* (#762 FR-1): the sheet, its sentence prefilled — from
     * its row in *From this reading*, or from Think, which opened the Reader for it.
     */
    private claimFromThought(thought: Thought, from?: ProposalBox): void {
        const book = this.sourcePath;
        if (!book || thought.about !== book || !thought.quote || !thought.locator || !this.claimLink) return;
        const stage = this.els?.stage.getBoundingClientRect();
        const origin = from ?? (stage ? { left: stage.left + stage.width / 2 - 40, top: stage.top + stage.height * READING_LINE, width: 80, height: 24 } : { left: 0, top: 0, width: 0, height: 0 });
        this.claimLink.claim({ quote: thought.quote, locator: thought.locator, book, bookTitle: this.source?.title ?? noteName(book) }, origin, { accepted: thought });
    }

    /** The thought `id` names, from Think's store, and the sheet for it. */
    private async claimFromId(id: string): Promise<void> {
        try {
            const store = this.vaultMovesDeps.store ?? ThoughtStore.getInstance();
            const thought = (await store.all()).find((candidate) => candidate.id === id);
            if (thought?.madeBy?.move === "claim") this.claimFromThought(thought);
        } catch (error) {
            log.warn(`[Reader] the claim could not be opened: ${error instanceof Error ? error.name : "error"}`);
        }
    }

    /** What the two gestures lend of the Reader (#762): Alongside's panel, its rows, the peek. */
    private claimLinkView(): ClaimLinkView {
        const vault = this.vaultMovesView();
        return {
            app: this.app,
            host: () => this.root ?? this.contentEl,
            openAlongside: () => {
                const closed = this.panel !== "context";
                if (closed || this.alongsideLeaving !== undefined) this.toggle("context");
                const panel = this.els?.panel;
                return panel && this.panel === "context" ? { panel, opened: closed } : null;
            },
            closeAlongside: () => {
                if (this.panel === "context") this.closePanel();
            },
            nearFor: (text) => vault.nearFor(text),
            fromReadingBox: () => vault.fromReadingBox(),
            addFromReading: (entry) => vault.addFromReading(this.ledgered(entry)),
            claimed: (id, path) => void this.highlights?.markClaimed(id, path),
            unclaimed: (id, path) => void this.highlights?.markClaimed(id, path, false),
            peek: (anchor, path, name) => this.openPeek(anchor, path, name),
        };
    }

    /** What Look up and Translate lend of the Reader (#766): its root, the page's language, the settings, the queue. */
    // ── Snapshot (#763) ──────────────────────────────────────────────────────

    /** Whether Snapshot is offered: a paper's printed pages in Page view, a scan's too (FR-1, FR-4). */
    private snapshotOffered(): boolean {
        return this.runMode() && this.source?.format === "pdf" && typeof this.source.pages?.render === "function";
    }

    private snapshotView(root: HTMLElement): SnapshotView {
        return {
            app: this.app,
            undoable: (run) => this.undoLedger.offer(run),
            root,
            owner: this,
            stage: () => this.els?.stage ?? null,
            margin: () => this.els?.margin ?? null,
            regionAt: (box: SnapshotBox) => (this.runMode() ? (this.pageRun?.regionAt(box) ?? null) : null),
            capture: async (region, scale) => {
                const render = this.source?.pages?.render?.bind(this.source.pages);
                if (!render) return null;
                const blob = await captureRegion(render, () => this.scratchCanvas(root), region.page, { scale, rotation: region.rotation, frame: region.frame });
                return blob ? this.snapshotOf(blob, "figure", region.page) : null;
            },
            modeChanged: (on) => {
                this.snapshotButton?.setAttribute("aria-pressed", String(on));
                this.snapshotButton?.toggleClass("is-active", on);
                if (!on) return;
                // One pointer owner at a time: the ink palette steps aside, and so does a popover.
                this.ink?.closePalette(false);
                this.highlights?.hidePopover();
            },
            canThink: () => Boolean((this.highlightDeps.store ?? ThoughtStore.getInstance()).folder()),
            pageNoteAdded: (thought) => this.highlights?.addPageNote(thought) ?? null,
            pageNoteRemoved: (id) => this.highlights?.removePageNote(id),
        };
    }

    /** A canvas a capture is drawn in, off the page: made in the Reader's window, never shown. */
    private scratchCanvas(host: HTMLElement): HTMLCanvasElement {
        const canvas = host.createEl("canvas");
        canvas.remove();
        return canvas;
    }

    /** A capture, with where it came from: its name, its place and its `source::` citation (#751). */
    private snapshotOf(blob: Blob, kind: SnapshotCapture["kind"], index: number): SnapshotCapture | null {
        const doc = this.source;
        const path = this.sourcePath;
        if (!doc || !path) return null;
        const chapter = doc.chapters[index];
        const label = this.sourceLabel(index);
        const place = doc.format === "pdf" ? `p. ${chapter?.page ?? index + 1}` : `ch. ${index + 1}`;
        return {
            blob,
            kind,
            label,
            name: snapshotName(doc.title, place),
            citation: recallCitation({ file: path, ...(chapter?.key ? { chapter: chapter.key } : {}), label, ...(chapter?.page ? { page: chapter.page } : {}), bookTitle: doc.title }),
            source: path,
            locator: this.locatorOf(index),
        };
    }

    /**
     * *Snapshot this image* (FR-2): a book's picture as the book holds it — its own bytes — or a page
     * of a paper drawn as its picture, drawn again whole at twice its size on screen.
     */
    private async snapshotImage(el: HTMLElement, from: SnapshotBox): Promise<void> {
        const doc = this.source;
        const index = this.index;
        if (!doc || !this.snapshot) return;
        let blob: Blob | null = null;
        let kind: SnapshotCapture["kind"] = "image";
        try {
            const archived = el.getAttribute("data-zf-src");
            if (archived && doc.imageBytes) blob = await doc.imageBytes(archived);
            else if (!archived && doc.pages?.render) {
                const size = await doc.pages.size(index);
                const scale = captureScale(from.width / Math.max(1e-6, size.width), size);
                blob = await captureRegion(doc.pages.render.bind(doc.pages), () => this.scratchCanvas(this.root ?? this.contentEl), index, { scale, rotation: 0 });
                kind = "figure";
            }
        } catch (error) {
            log.warn(`[Reader] a picture could not be captured: ${error instanceof Error ? error.message : String(error)}`);
        }
        const shot = blob && this.source === doc ? this.snapshotOf(blob, kind, index) : null;
        if (shot) this.snapshot.show(shot, from);
    }

    private lookupView(): LookupView {
        return {
            app: this.app,
            host: () => this.root,
            bookLanguage: () => this.pageLanguage,
            uiLanguage: () => getLanguage(),
            settings: () => dictionarySettings(this.plugin?.settings?.dictionaries),
            saveTranslateInto: async (tag) => {
                const settings = this.plugin?.settings;
                if (!settings) return;
                settings.dictionaries = { ...dictionarySettings(settings.dictionaries), translateInto: tag };
                await this.plugin?.saveSettings?.();
            },
            // The one queue every request of the Reader waits in (#759 FR-9).
            queue: () => this.aiMoves?.queue ?? null,
        };
    }

    /** What the AI moves lend of the Reader (#759): Alongside, as the vault moves have it, and its dot. */
    private aiMovesView(): AiMovesView {
        const vault = this.vaultMovesView();
        return {
            app: this.app,
            openAlongside: () => vault.openAlongside(),
            fromReadingBox: () => vault.fromReadingBox(),
            addFromReading: (entry) => vault.addFromReading(entry),
            dot: (on) => this.alongsideDot?.toggleClass("is-shown", on),
            claim: (thought, from) => this.claimFromThought(thought, from),
            language: () => getLanguage(),
        };
    }

    /** What the moves lend of the Reader (#756): Alongside, where their answers arrive. */
    private vaultMovesView(): VaultMovesView {
        return {
            app: this.app,
            openAlongside: () => {
                const closed = this.panel !== "context";
                // Closed, it opens; sliding away, it stays (#754).
                if (closed || this.alongsideLeaving !== undefined) this.toggle("context");
                const host = this.alongside?.proposalsHost();
                return host ? { host, opened: closed } : null;
            },
            nearFor: (text) => this.alongside?.nearFor(text) ?? null,
            fromReadingBox: () => this.alongside?.fromReadingBox() ?? null,
            addFromReading: (entry) => this.alongside?.addFromReading(this.ledgered(entry)),
            ruleOut: (book, chapterKey, path) => this.alongside?.ruleOut(book, chapterKey, path),
            tension: (id) => this.highlights?.markTension(id),
        };
    }

    /** What Alongside reads of the Reader (#754). */
    private alongsideView() {
        return {
            app: this.app,
            owner: this,
            reading: () => this.alongsideReading(),
            passage: () => this.alongsidePassage(),
            marks: () => [...(this.highlights?.items() ?? []), ...(this.highlights?.detachedItems() ?? [])],
            renderHighlights: (host: HTMLElement, scope: Component) => this.highlights?.renderList(host, scope),
            peek: (anchor: HTMLElement, path: string, name: string) => this.openPeek(anchor, path, name),
            close: () => this.closeFromPanel(),
        };
    }

    /** The book and the chapter on screen; in a note reading, the reading and its note. */
    private alongsideReading(): AlongsideReading | null {
        if (!this.path || this.ended) return null;
        if (this.sourcePath) {
            const chapter = this.source?.chapters[this.index];
            const pdf = sourceFormat(this.sourcePath) === "pdf";
            return {
                book: this.sourcePath,
                bookTitle: this.source?.title ?? noteName(this.sourcePath),
                chapterKey: chapter?.key ?? (pdf ? `page:${this.index}` : String(this.index)),
                source: true,
            };
        }
        const note = this.reading();
        if (!note) return null;
        return { book: this.path.seed, bookTitle: noteName(this.path.seed), chapterKey: note, source: false, chapterNote: note };
    }

    /** What Alongside is near (FR-2): the words you selected, a PDF's page in Page view, or the paragraph at the reading line. */
    private alongsidePassage(): AlongsidePassage | null {
        const els = this.els;
        if (!els) return null;
        const selection = (this.root?.win ?? window).getSelection?.();
        const selected = selection && !selection.isCollapsed && selection.rangeCount > 0 ? selection.toString().trim() : "";
        if (selected && selection && els.page.contains(selection.getRangeAt(0).commonAncestorContainer)) {
            const start = selection.getRangeAt(0).startContainer;
            const el = start.nodeType === 1 ? (start as HTMLElement) : start.parentElement;
            return { text: selected, kind: "selection", anchor: el?.closest<HTMLElement>("p, blockquote, li, h1, h2, h3, h4, h5, h6, figure, table, pre") ?? null };
        }
        if (this.sourcePath && (this.sourceView === "page" || this.runMode())) {
            const page = this.runMode() && this.pageRun ? els.page.querySelector<HTMLElement>(`[data-page="${this.pageRun.page()}"]`) : els.page;
            return { text: page?.textContent ?? "", kind: "page", anchor: null };
        }
        const block = this.blockAtReadingLine();
        return { text: block?.textContent ?? "", kind: "paragraph", anchor: block };
    }

    /** The block under the reading line, a third of the way down the stage (#751 FR-6). */
    private blockAtReadingLine(): HTMLElement | null {
        const stage = this.els?.stage;
        if (!stage) return null;
        const elements = this.pagedNow() && this.pager ? this.pager.visibleBlocks() : this.blockElements();
        if (elements.length === 0) return null;
        const line = stage.getBoundingClientRect().top + stage.clientHeight * READING_LINE;
        const at = blockAtLine(
            elements.map((el) => {
                const r = el.getBoundingClientRect();
                return { top: r.top, height: r.height };
            }),
            line
        );
        return at >= 0 ? elements[at] : null;
    }

    /** What the Type panel says besides its rows (#757): the language of the hyphens, Page view's note. */
    private typeContext() {
        const run = this.runMode() ? this.pageRun : null;
        const { hint } = this.justifyHere();
        return {
            // What the hyphens do here (#809 FR-8): said only when the probe answered.
            ...(hint?.kind === "hyphenated" ? { hyphenatedAs: hint.language } : {}),
            ...(hint?.kind === "missing" ? { hyphenationMissing: hint.language } : {}),
            pageView: Boolean(this.sourcePath && this.sourceView === "page" && this.source?.hasPageView),
            // Page view's own rows (#767 FR-13): shown in Page view only.
            ...(run
                ? {
                      pageRun: {
                          fit: run.framing(),
                          level: run.zoomLevel(),
                          across: run.isAcross(),
                          scroll: this.runLayout() === "scroll",
                          // A designed page is never turned or cropped (#771).
                          ...(run.designed() ? { designed: true } : {}),
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
        panelHead(host, "reader_contents", this.panelCloseFor("reader_close_contents"));
        this.path?.chapters.forEach((chapter, i) => {
            const row = host.createEl("button", {
                cls: [c("reader-toc-row"), ...(i === this.index ? [c("reader-toc-row--current")] : [])].join(" "),
                attr: { type: "button" },
            });
            const visited = new Set(this.path?.chapters.flatMap((other, j) => (this.visited.has(other.path) ? [j] : [])) ?? []);
            const state = chapterState(i, this.index, visited, this.ended);
            this.tocState(row, state);
            row.createSpan({ cls: c("reader-toc-name"), text: noteName(chapter.path) });
            row.createSpan({ cls: c("reader-toc-role"), text: t(ROLE_KEY[chapter.role]) });
            row.setAttribute("aria-label", `${noteName(chapter.path)} · ${t(TOC_STATE_KEY[state])}`);
            if (i === this.index) row.setAttribute("aria-current", "step");
            this.panelScope?.registerDomEvent(row, "click", () => this.show(i));
        });
        this.scrollToCurrent(host);
    }

    /**
     * A book's or a paper's Contents (#761 FR-4): **Contents · Bookmarks · Where you've been**, as
     * tabs of Obsidian's own chips. Changing tab slides the list in from the side of the tab, in one
     * gesture (FR-16). No tab counts anything (FR-12).
     */
    private renderSourceTabs(host: HTMLElement): void {
        // A tab kept from before is read as it is now: an old Overview is Contents (#784 FR-2).
        this.contentsTab = normalizeContentsTab(this.contentsTab);
        const tabs = host.createDiv({ cls: c("reader-tabs"), attr: { role: "tablist", "aria-label": t("reader_contents") } });
        for (const tab of CONTENTS_TABS) {
            const on = tab.id === this.contentsTab;
            const button = tabs.createEl("button", {
                cls: [c("reader-tab"), ...(on ? ["is-active"] : [])].join(" "),
                attr: { type: "button", role: "tab", "aria-selected": String(on) },
                text: t(tab.label),
            });
            this.panelScope?.registerDomEvent(button, "click", () => this.chooseTab(tab.id));
        }
        // What Contents used to list as rows, now its head's own actions (#812 FR-11): recall the
        // chapter you are in (#760), and everything you marked in this book (#721).
        const scope = this.panelScope;
        const sourcePath = this.sourcePath;
        if (scope) {
            const actions = tabs.createDiv({ cls: c("reader-panel-actions") });
            if (this.recallSpan()) panelAction(actions, "pencil-line", "reader_recall", () => this.startRecall(), scope).addClass(c("reader-recall-door"));
            if (sourcePath) panelAction(actions, "notebook-pen", "notebook_title", () => void openLibrary(this.app, undefined, sourcePath), scope);
        }
        // Contents' own way out, at the end of its tabs (#777 FR-1).
        const close = this.panelCloseFor("reader_close_contents");
        if (close) panelClose(tabs, close);
        const list = host.createDiv({ cls: c("reader-tab-list"), attr: { role: "tabpanel" } });
        if (this.contentsTab === "bookmarks") this.renderBookmarks(list);
        else if (this.contentsTab === "trail") this.renderTrail(list);
        else this.renderSourceContents(list);
        if (this.contentsTab === "contents") this.scrollToCurrent(host);
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

    private chooseTab(raw: ContentsTab): void {
        const tab = normalizeContentsTab(raw);
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
     * screen holds a bookmark. It hangs at the pane's top-right corner, placed by the stylesheet alone
     * (#784 FR-3). No count, ever (FR-12).
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
    private openSheet(host: HTMLElement, scope: Component, tall = false): void {
        const root = this.root;
        if (!root) return;
        const snaps = sheetSnaps(root.getBoundingClientRect().height, this.safeTop());
        const kept = this.sheet?.height ?? 0;
        this.sheet = { height: tall ? snaps.full : kept > 0 ? Math.min(kept, snaps.full) : snaps.half, snaps };
        host.toggleClass(c("reader-panel--tall"), tall);
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

    // ── layers, and read it clean (#758) ─────────────────────────────────────

    /** The reading the layers are remembered for: a source's path, or the note a reading began from. */
    private layerKey(): string | null {
        return this.sourcePath ?? this.path?.seed ?? null;
    }

    private layerPrefs(): { target: MarkLayer; hidden: MarkLayer[] } {
        return layerPrefsOf(normalizeLayerPrefs(this.plugin?.settings?.readerLayers), this.layerKey());
    }

    /** The layer new marks go to in this reading (FR-4). */
    private layerTarget(): MarkLayer {
        return this.layerPrefs().target;
    }

    private saveLayerPrefs(next: { target: MarkLayer; hidden: readonly MarkLayer[] }): void {
        const settings = this.plugin?.settings;
        const key = this.layerKey();
        if (!settings || !key) return;
        settings.readerLayers = withLayerPrefs(normalizeLayerPrefs(settings.readerLayers), key, next);
        void this.plugin?.saveSettings?.();
    }

    /**
     * Something was drawn, or another reading opened: the marks take the layers as they are. A reading
     * opened anew has its own hidden layers, and every mark shown — clean lasts a sitting (FR-8).
     */
    private syncLayers(): void {
        const key = this.layerKey();
        if (key !== this.layersKey) {
            this.layersKey = key;
            this.layerView.load(this.layerPrefs().hidden);
            this.showCleanPill(false, false);
        } else this.layerView.apply();
        this.syncLayerBar();
    }

    /** The bar: the target's name beside the button when it is not reading; active while a layer is hidden. */
    private syncLayerBar(): void {
        const target = this.layerTarget();
        const label = this.layerLabel;
        if (label) {
            label.setText(target === DEFAULT_LAYER ? "" : t(LAYER_LABEL[target]));
            label.toggleClass(c("reader-hidden"), target === DEFAULT_LAYER);
            this.panelButtons?.layers.setAttribute("aria-label", target === DEFAULT_LAYER ? t("reader_layers") : `${t("reader_layers")} · ${t("reader_layers_new_to", t(LAYER_LABEL[target]))}`);
        }
        this.syncPanelButtons(this.panel);
    }

    private renderLayers(host: HTMLElement, scope: Component, markers?: ReturnType<typeof snapshotMarkers>): void {
        const prefs = this.layerPrefs();
        renderLayersPanel(
            host,
            { present: this.layerView.present(), hidden: this.layerView.hiddenLayers(), target: prefs.target, clean: this.layerView.isClean() },
            scope,
            {
                show: (layer, on) => this.showLayer(layer, on),
                target: (layer) => {
                    this.saveLayerPrefs({ target: layer, hidden: this.layerView.hiddenLayers() });
                    this.syncLayerBar();
                    this.renderPanel();
                },
                hideAll: () => this.hideAnnotations(),
                reveal: () => this.revealThinking(),
            },
            { label: "reader_close_layers", onClose: () => this.closeFromPanel(), scope },
            markers
        );
    }

    /** One layer shown or hidden (FR-5, FR-16): its ink fades, and the choice is kept for the source. */
    private showLayer(layer: MarkLayer, on: boolean): void {
        if (on) this.layerView.showLayer(layer);
        else this.layerView.hideLayer(layer);
        this.saveLayerPrefs({ target: this.layerTarget(), hidden: this.layerView.hiddenLayers() });
        this.syncLayerBar();
        if (this.panel === "layers") this.renderPanel();
    }

    /** *Hide my annotations* (FR-8, FR-15): every mark away in one quiet fade, and the pill slides in. Nothing is written. */
    private hideAnnotations(): void {
        this.layerView.hideAll();
        this.showCleanPill(true);
        if (this.panel === "layers") this.renderPanel();
    }

    /**
     * *Reveal my thinking* (FR-9): from the pill or the panel. The panel steps aside, so the page is
     * there to watch your reading of it happen again. Nothing is written.
     */
    private revealThinking(): void {
        if (!this.layerView.isClean()) return;
        this.showCleanPill(false);
        if (this.panel === "layers") this.closePanel();
        this.layerView.reveal();
    }

    /** The pill in or out: it slides 8 px and fades (FR-15); under reduced motion it is simply there. */
    private showCleanPill(on: boolean, animate = true): void {
        // The margin's heading and meaning counts go with the marks while you read clean.
        this.root?.toggleClass(c("reader--clean"), on);
        const pill = this.cleanPill;
        if (!pill || pill.hasClass(c("reader-hidden")) === !on) return;
        const frames = [
            { opacity: 0, transform: "translateX(-50%) translateY(-8px)" },
            { opacity: 1, transform: "translateX(-50%) translateY(0px)" },
        ];
        if (on) {
            pill.removeClass(c("reader-hidden"));
            if (animate && motionWelcome(pill)) pill.animate(frames, { duration: MOTION.base, easing: MOTION.ease });
            return;
        }
        if (!animate || !motionWelcome(pill)) {
            pill.addClass(c("reader-hidden"));
            return;
        }
        const leaving = pill.animate([...frames].reverse(), { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" });
        const done = () => {
            pill.addClass(c("reader-hidden"));
            leaving?.cancel?.();
        };
        if (leaving) leaving.onfinish = done;
        else done();
    }

    /** Whether a mark is on screen now: the ones that are come back in order, the others are simply there. */
    private onScreen(el: HTMLElement): boolean {
        const stage = this.els?.stage?.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        if (!stage || !(stage.height > 0)) return true;
        return box.top + box.height > stage.top && box.top < stage.top + stage.height;
    }

    /** Whether words are being selected now: a reveal never runs then (FR-14). */
    private selecting(): boolean {
        const selection = (this.root?.win ?? (typeof window === "undefined" ? undefined : window))?.getSelection?.();
        return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
    }

    /**
     * A panel's own × (#777 FR-1): the steps Esc takes — the claim sheet goes first, nothing written,
     * then the panel, in the same move Esc plays.
     */
    private closeFromPanel(): void {
        if (this.claimLink?.isOpen()) {
            this.claimLink.dismissNewest();
            return;
        }
        this.closePanel();
    }

    /** The × for the panel drawn now, its listener on the panel's scope. */
    private panelCloseFor(label: "reader_close_contents" | "reader_close_overview"): PanelClose | undefined {
        const scope = this.panelScope;
        return scope ? { label, onClose: () => this.closeFromPanel(), scope } : undefined;
    }

    /** Each panel's button on the bar: pressed, and Obsidian's active look, while its panel is open. */
    private syncPanelButtons(open: Panel): void {
        if (!this.panelButtons) return;
        // The overview's own door is pressed while it is open (#776 FR-1, #784 FR-1).
        const overview = open === "overview";
        for (const [id, button] of Object.entries(this.panelButtons)) {
            const on = id === open;
            // Layers reads as active while any layer is hidden, open or not (#758 FR-5).
            button.toggleClass("is-active", on || (id === "layers" && this.layerView.hiddenLayers().length > 0));
            button.setAttribute("aria-pressed", String(on));
        }
        this.els?.overview.toggleClass("is-active", overview);
        this.els?.overview.setAttribute("aria-pressed", String(overview));
    }

    /** Close the panel. A sheet slides down and away first; a card, or reduced motion, goes at once. */
    private closePanel(ms: number = MOTION.base): void {
        const host = this.els?.panel;
        if (!host || !this.panel) return;
        if (this.panel === "context") this.alongside?.remember(false);
        // Recall ends as its card begins to go: the page is on its way back already (#760).
        if (this.panel === "recall") this.endRecall();
        // Leaving the overview without a pick: the card grows back into the page (#776 FR-22).
        if (this.panel === "overview") this.returnToPage();
        // The bar lets go of the button at once: the panel is on its way out.
        this.syncPanelButtons(null);
        // Alongside slides back to the column's edge, then the column widens, your line kept (#754 FR-17).
        if (host.hasClass(c("reader-panel--side")) && this.motionAllowed()) {
            if (this.alongsideLeaving !== undefined) return;
            host.addClass(c("reader-panel--leaving"));
            const leaving = this.panel;
            this.alongsideLeaving = (this.root?.win ?? window).setTimeout(() => {
                this.alongsideLeaving = undefined;
                if (this.panel !== leaving || !host.hasClass(c("reader-panel--leaving"))) return;
                this.panel = null;
                this.renderPanel();
            }, MOTION.base);
            return;
        }
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
        this.els?.panel.removeClass(c("reader-panel--closing"), c("reader-panel--tall"));
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
        // Ink goes with its words through a rotation or a Split View (#745 FR-11).
        this.layoutInk();
        // In pages the pager lays the chapter out again on its own observer, keeping the line (#753).
        if (this.pagedNow()) {
            if (this.panel) this.renderPanel();
            return;
        }
        const blocks = this.blocks();
        // A passage just landed on stays at the reading line (#751); anything else keeps its top line.
        const held = this.passageHold !== null ? this.heldPassage() : null;
        if (held && this.pager) this.pager.reveal(held, false, READING_LINE);
        else if (this.place && blocks.length > 0) stage.scrollTop = scrollFor(this.place, blocks);
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
        // Input during a move jumps it to its end (#751 FR-15): the place is already set under it. And
        // from then on the page is yours: a landed passage is no longer held at the reading line.
        this.registerDomEvent(stage, "wheel", () => this.takeOver(), { passive: true });
        this.registerDomEvent(this.contentEl, "keydown", () => this.takeOver(), { capture: true });
        this.registerDomEvent(stage, "pointerdown", (event: PointerEvent) => {
            this.takeOver();
            this.onPointerDown(event);
        });
        this.registerDomEvent(stage, "pointermove", (event: PointerEvent) => this.onPointerMove(event));
        // Two fingers drawn together on a flowing page, as touches (#776 FR-23).
        this.registerDomEvent(stage, "touchstart", (event: TouchEvent) => this.onPinchTouch(event), { passive: false });
        this.registerDomEvent(stage, "touchmove", (event: TouchEvent) => this.onPinchTouch(event), { passive: false });
        this.registerDomEvent(stage, "touchend", (event: TouchEvent) => this.onPinchTouchEnd(event));
        this.registerDomEvent(stage, "touchcancel", (event: TouchEvent) => this.onPinchTouchEnd(event));
        this.registerDomEvent(stage, "pointerup", (event: PointerEvent) => this.onPointerUp(event));
        this.registerDomEvent(stage, "pointercancel", (event: PointerEvent) => {
            this.snapshot?.cancel(event);
            this.ink?.cancel(event);
            // The system took a finger (a pinch, a gesture of its own): no two-finger back from it.
            this.fingers.delete(event?.pointerId);
            this.twoFinger = null;
            this.twoStart = null;
            this.twoKind = "pending";
            // A pinch the browser took from the pointers goes on in the touches; anything else springs back.
            if (this.pinchLive && !this.touchPinch) this.releasePinch();
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
        // Snapshot mode owns the pointer (#763 AC-6): a drag draws its rectangle — no selection, no scroll, no turn.
        if (this.snapshot?.claims(event)) {
            this.dropTouch();
            return;
        }
        // Ink is asked before a gesture starts (#745): a pen or a mouse with the palette open writes,
        // and a palm on the glass does nothing at all. A finger goes on as it always has.
        if (this.ink?.claims(event)) {
            this.dropTouch();
            return;
        }
        // Two fingers on the page are the trail's way back (#761 FR-10), never a turn: whatever the
        // first finger had started goes back.
        if (touchPointer(event)) {
            this.fingers.set(event.pointerId, { x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY });
            if (this.fingers.size >= 2) {
                this.dropTouch();
                if (!this.twoFinger) {
                    this.twoFinger = [];
                    // Two fingers are decided once (#776 D13): a pinch, back, or a tap.
                    this.twoKind = "pending";
                    this.twoStart = { spread: this.fingerSpread(), at: event.timeStamp ?? Date.now() };
                }
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
        if (this.snapshot?.move(event)) return;
        if (this.ink?.move(event)) return;
        const finger = this.fingers.get(event.pointerId);
        if (finger) {
            finger.x = event.clientX;
            finger.y = event.clientY;
        }
        if (this.twoFinger) {
            this.onTwoFingers(event);
            return;
        }
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
        if (this.pageRun && this.runMode() && (this.runLayout() === "scroll" || this.pageRun.overflowsAcross())) {
            this.touch = null;
            return;
        }
        if (touch.dir === 0) this.beginSwipe(touch);
        this.requestTouchFrame(touch);
    }

    private onPointerUp(event: PointerEvent): void {
        if (this.snapshot?.release(event)) {
            this.swallowClickUntil = Date.now() + TAP_CLICK_MS;
            return;
        }
        if (this.ink?.up(event)) {
            // A stroke that ended on a link is a stroke, never a click on the link.
            this.swallowClickUntil = Date.now() + TAP_CLICK_MS;
            return;
        }
        const finger = this.fingers.get(event.pointerId);
        // The page as the fingers leave it, before one of them is gone (#776 FR-23).
        const pinched = this.pinchLive;
        this.fingers.delete(event.pointerId);
        if (this.twoFinger) {
            if (finger) this.twoFinger.push({ dx: event.clientX - finger.x0, dy: event.clientY - finger.y0 });
            if (this.fingers.size > 0) return;
            const moves = this.twoFinger;
            const start = this.twoStart;
            this.twoFinger = null;
            this.twoStart = null;
            this.swallowClickUntil = Date.now() + TAP_CLICK_MS;
            const kind = this.twoKind !== "pending" ? this.twoKind : twoFingers({ moves, spread0: start?.spread ?? 0, spread: start?.spread ?? 0, ms: (event.timeStamp ?? Date.now()) - (start?.at ?? 0), lifted: true });
            this.twoKind = "pending";
            if (pinched) {
                this.releasePinch();
                return;
            }
            // Both fingers swept right: one step back along the trail.
            // A pinch in Page view is a zoom, never the way back (#767).
            if (kind === "back" && !this.pageRun?.pinchedRecently()) this.backFromJump();
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

    /** How far apart the first two fingers on the page are. */
    private fingerSpread(): number {
        const [a, b] = [...this.fingers.values()];
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }

    /**
     * Two fingers moving on the page (#776 D13, FR-23): decided once; drawn together on a flowing
     * page, the page shrinks under them 1:1, about the point between them — nothing redrawn. Page view
     * and a designed book pinch in their own run (#767), which asks for the overview past its zoom.
     */
    private onTwoFingers(event: PointerEvent): void {
        const start = this.twoStart;
        const stage = this.els?.stage;
        if (!start || !stage || this.fingers.size < 2) return;
        const moves = [...this.fingers.values()].map((f) => ({ dx: f.x - f.x0, dy: f.y - f.y0 }));
        const spread = this.fingerSpread();
        if (this.twoKind === "pending") this.twoKind = twoFingers({ moves, spread0: start.spread, spread, ms: (event.timeStamp ?? Date.now()) - start.at, lifted: false });
        if (this.twoKind !== "pinch" || !this.pinchesHere()) return;
        const [a, b] = [...this.fingers.values()];
        this.applyPinch(Math.min(1, spread / Math.max(1, start.spread)), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }

    /** Whether two fingers drawn together here shrink the page: a flowing page, not in ink or the overview. */
    private pinchesHere(): boolean {
        if (this.runMode() || !this.sourcePath || this.ended || this.ink?.isOpen()) return false;
        return this.panel !== "overview";
    }

    /**
     * The same pinch, as touches (#776 FR-23): WebKit hands a page its two fingers as touches too, and
     * a browser that reads a pinch as its own would cancel the pointers — so the page follows whichever
     * it hears, and takes the touch from the browser once it is a pinch inward.
     */
    private onPinchTouch(event: TouchEvent): void {
        const touches = event.touches;
        if (!touches || touches.length < 2 || !this.pinchesHere()) return;
        const a = touches[0];
        const b = touches[1];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (!this.touchPinch) {
            this.touchPinch = { d0: d };
            return;
        }
        const d0 = Math.max(1, this.touchPinch.d0);
        if (!this.pinchLive && (d >= d0 || (d0 - d) / d0 <= PINCH_SHARE)) return;
        if (event.cancelable) event.preventDefault();
        this.twoKind = "pinch";
        this.applyPinch(Math.min(1, d / d0), { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
    }

    private onPinchTouchEnd(event: TouchEvent): void {
        if (event.touches && event.touches.length >= 2) return;
        this.touchPinch = null;
        if (this.pinchLive) this.releasePinch();
    }

    /** The page under the fingers, 1:1, about the point between them — nothing laid out or redrawn. */
    private applyPinch(scale: number, mid: { x: number; y: number }): void {
        const stage = this.els?.stage;
        if (!stage) return;
        const box = stage.getBoundingClientRect();
        this.pinchLive = { scale };
        stage.addClass(c("reader-stage--pinching"));
        stage.setCssProps({
            "--zf-pinch-s": String(Math.round(scale * 1000) / 1000),
            "--zf-pinch-x": `${Math.round(mid.x - box.left)}px`,
            "--zf-pinch-y": `${Math.round(mid.y - box.top)}px`,
        });
    }

    /**
     * A pinch let go (FR-23): small enough, the page carries on into its card — the overview opens
     * from that scale; short of it, the page springs back. A finger moving it is never an animation;
     * the spring is, and under reduced motion it is simply back.
     */
    private releasePinch(): void {
        const stage = this.els?.stage;
        const scale = this.pinchLive?.scale ?? 1;
        this.pinchLive = null;
        if (!stage) return;
        const clear = () => {
            stage.removeClass(c("reader-stage--pinching"));
            stage.setCssProps({ "--zf-pinch-s": "1" });
        };
        if (pinchRelease(scale) === "card") {
            clear();
            this.openOverview(scale);
            return;
        }
        if (!this.motionAllowed() || typeof stage.animate !== "function") {
            clear();
            return;
        }
        const spring = stage.animate([{ scale: String(scale) }, { scale: "1" }], { duration: MOTION.base, easing: MOTION.ease });
        stage.setCssProps({ "--zf-pinch-s": "1" });
        spring.onfinish = clear;
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
        else this.page(edgeTurn(zone, this.designedTurns() ? "page" : this.effectiveLayout(), this.bookDirection()));
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
        // In a right-to-left designed book the leaf follows the finger, and the book turns the way it reads (#771).
        const turn = this.turnLooks(dir);
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
        if (!this.canTurn(turn)) {
            touch.rubber = true;
            this.els.stage.addClass(c("reader-stage--rubber"));
            return;
        }
        const motion = readingMotion(this.plugin?.settings?.readingMotion).chapter;
        touch.scrub = beginChapterScrub(this.root, this.els.stage, this.els.page, motion, dir, this.turnLabel(turn));
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
        this.go(touch.dir === 0 ? 0 : this.turnLooks(touch.dir), this.pagedNow() && touch.dir < 0 ? "end" : "start");
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

    // ── listen (#765) ────────────────────────────────────────────────────────

    /** The window's speech, and whether the device has a voice of its own (FR-2, FR-8). */
    private setUpListen(root: HTMLElement): void {
        const port = this.listenDeps.speech !== undefined ? this.listenDeps.speech : speechPortOf(root.win);
        if (!port) return;
        const session = new ListenSession(this.listenView(), port);
        this.listen = session;
        session.whenVoices((available) => {
            if (this.listen !== session) return;
            this.listenOffered = available;
            this.renderListenButton();
        });
    }

    private listenView(): ListenView {
        const win = () => this.root?.win ?? window;
        return {
            body: () => this.els?.page.querySelector<HTMLElement>(`.${c("reader-body")}`) ?? null,
            stage: () => this.els?.stage ?? null,
            pager: () => this.pager,
            chapter: () => this.index,
            isLast: () => this.index >= (this.path?.chapters.length ?? 1) - 1,
            // A reading turn (#755): listening is on, so no chapter end pauses it.
            turn: () => this.go(1),
            landsIn: () => Math.max(0, this.turnLandsAt - Date.now()),
            motion: () => this.motionAllowed(),
            lang: () => this.listenLang,
            prefs: () => this.listenPrefs,
            savePrefs: (prefs) => {
                this.listenPrefs = prefs;
                this.app?.saveLocalStorage?.(LISTEN_STORAGE_KEY, prefs);
            },
            setListening: (on) => {
                this.listening = on;
                this.root?.toggleClass(c("reader--listening"), on);
            },
            changed: () => this.renderListenBar(),
            setTimeout: (fn, ms) => win().setTimeout(fn, ms),
            clearTimeout: (id) => win().clearTimeout(id),
        };
    }

    /** Listen is offered here: a voice on the device, and words on the page (FR-8). */
    private listenAvailable(): boolean {
        return Boolean(this.listen && this.listenOffered && !this.listenHidden() && !this.source?.imageOnly);
    }

    /**
     * Where the button is not drawn at all: no voice of the device's own (FR-8), the end card, a
     * designed book (pictures, no text), and a paper in Page view — Listen reads the Reading view.
     */
    private listenHidden(): boolean {
        if (!this.listen || !this.listenOffered || this.ended) return true;
        if (this.sourcePath && !this.source) return true;
        // A scanned paper is read as printed, and says why it cannot be heard (FR-8): shown, disabled.
        if (this.source?.imageOnly) return false;
        return Boolean(this.source?.designed) || this.runMode();
    }

    /** The bar's *Listen*: hidden, offered — or, in a scanned PDF, shown disabled with its reason (FR-8, AC-7). */
    private renderListenButton(): void {
        const button = this.listenButton;
        if (!button) return;
        const hidden = this.listenHidden();
        button.toggleClass(c("reader-hidden"), hidden);
        if (hidden && this.listen?.active()) this.stopListening();
        const scanned = Boolean(this.source?.imageOnly);
        const label = t(scanned ? "reader_listen_scanned" : "reader_listen");
        button.toggleClass("is-disabled", scanned);
        if (scanned) button.setAttribute("aria-disabled", "true");
        else button.removeAttribute("aria-disabled");
        button.setAttribute("aria-label", label);
        setTooltip(button, label, { placement: "top" });
        button.setAttribute("aria-pressed", String(Boolean(this.listen?.active())));
    }

    private openListen(event: MouseEvent): void {
        const session = this.listen;
        // A scanned PDF has no text to read: the button says so, and does nothing (FR-8).
        if (!session || !this.listenAvailable()) return;
        this.listenLang = this.readingLang();
        openListenMenu(event, { session, start: (mode) => this.startListening(mode), lang: () => this.listenLang });
    }

    /**
     * The language the voice reads in (FR-2): the book's note's `language` (#743), the book's own or
     * its chapter's (#757), an article's `lang`; else none, and the device's default voice reads.
     */
    private readingLang(): string | null {
        const noted = this.sourcePath ? languageTag(bookNoteOf(this.app, this.sourcePath)?.details.language) : undefined;
        return noted ?? this.pageLanguage ?? languageTag(this.source?.language) ?? null;
    }

    /** Begin reading aloud (FR-1): *From here*, *This chapter*, or the selected words. */
    private startListening(mode: ListenMode, span?: TextSpan): void {
        const session = this.listen;
        if (!session || !this.listenAvailable()) return;
        this.listenLang = this.readingLang();
        const from = mode === "here" ? this.listenFrom() : { at: 0, top: false };
        if (!session.start(mode, { from: from.at, top: from.top, onScreen: (el) => this.onScreen(el), ...(span ? { span } : {}) })) return;
        this.renderListenBar();
    }

    /** Where *From here* begins: the paragraph you last tapped, while it is on screen; else the top of the page. */
    private listenFrom(): { at: number; top: boolean } {
        const body = this.els?.page.querySelector<HTMLElement>(`.${c("reader-body")}`);
        if (!body) return { at: 0, top: false };
        const tapped = this.lastTapped;
        if (tapped && tapped.chapter === this.index && body.contains(tapped.el) && this.onScreen(tapped.el)) {
            return { at: offsetAt(body, tapped.el, 0) ?? 0, top: false };
        }
        const top = this.pager?.firstVisible() ?? null;
        if (!top) return { at: 0, top: true };
        if ("startContainer" in top) return { at: offsetAt(body, top.startContainer, top.startOffset) ?? 0, top: true };
        return { at: offsetAt(body, top, 0) ?? 0, top: true };
    }

    /** A tap on the page notes its paragraph, for *From here*. */
    private noteTapped(target: EventTarget | null): void {
        const el = (target as HTMLElement | null)?.closest?.("p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, td, th, figcaption, pre") as HTMLElement | null;
        if (el && this.els?.page.contains(el)) this.lastTapped = { el, chapter: this.index };
    }

    /** The chapter on the page was drawn: the voice goes on there, or keeps its place (FR-12). */
    private listenDrawn(): void {
        this.lastTapped = null;
        if (!this.listen?.active()) return;
        this.listenLang = this.readingLang();
        this.listen.chapterDrawn();
    }

    /** The listening bar, as the session is: drawn while it reads, taken away when it stops. */
    private renderListenBar(): void {
        const session = this.listen;
        const root = this.root;
        if (session?.active() && root) {
            if (!this.listenBar) {
                this.listenScope?.unload();
                const scope = new Component();
                scope.load();
                this.listenScope = scope;
                this.listenBar = new ListenBar(root, { session, owner: scope, mark: () => void this.listenMark(), lang: () => this.listenLang });
            } else this.listenBar.update();
        } else if (this.listenBar) {
            this.listenBar.remove();
            this.listenBar = null;
            this.listenScope?.unload();
            this.listenScope = null;
        }
        this.listenButton?.setAttribute("aria-pressed", String(Boolean(session?.active())));
    }

    private stopListening(): void {
        this.listen?.stop();
        this.renderListenBar();
    }

    /**
     * *Mark* (FR-6): the sentence being read, kept as a highlight with the meaning used last and the
     * layer new marks go to. The voice goes on. Returns whether there was a sentence to keep.
     */
    private listenMark(): boolean {
        const sentence = this.listen?.active() ? this.listen.sentence() : null;
        if (!sentence || !this.highlights) return false;
        void this.highlights.markSpan(sentence.start, sentence.end);
        return true;
    }

    /** A key of the listening bar: taken only while listening — otherwise it goes on to the app. */
    private listenKey(run: () => void): boolean {
        if (!this.listen?.active()) return false;
        run();
        return true;
    }

    // ── undo by key (#810) ───────────────────────────────────────────────────

    /**
     * Ctrl/⌘+Z (#810 FR-15–FR-19): the reading's last write not yet taken back, exactly as its Undo
     * does it — refused, and said, when it was changed since; a quiet line when there is nothing left.
     * Always takes the key while the Reader is up: it is the Reader's, never another view's.
     */
    private undoLast(): boolean {
        const take = this.undoLedger.takeLast();
        if (!take) {
            this.highlights?.say("reader_undo_nothing");
            return true;
        }
        void take().then((outcome) => {
            if (outcome === "refused") this.highlights?.say("reader_undo_refused");
            else if (outcome === "undone") this.highlights?.say("reader_undo_done");
        });
        return true;
    }

    /**
     * A line in *From this reading* whose Undo is the reading's too (#810 FR-16, FR-17): a claim, a
     * link to an idea, an accepted move. The button and Ctrl/⌘+Z share one guard.
     */
    private ledgered<T extends { undo?: () => Promise<boolean> }>(entry: T): T {
        return entry.undo ? { ...entry, undo: this.ledgerUndo(entry.undo) } : entry;
    }

    /** An Undo that answers whether it worked, offered to the ledger: true only when it ran and worked. */
    private ledgerUndo(undo: () => Promise<boolean>): () => Promise<boolean> {
        let done = false;
        const guarded = this.undoLedger.offer(async () => {
            done = await undo();
        });
        return async () => (await guarded()) === "undone" && done;
    }

    /** A fire-and-forget Undo, offered to the ledger: the button and the key share one guard. */
    private ledgerRun(run: () => unknown): () => void {
        const guarded = this.undoLedger.offer(run);
        return () => void guarded();
    }

    /**
     * The book being read was renamed (#810): what it made has followed it, and so does the reading —
     * its next writes are about the new path, never the old one.
     */
    private followRename(from: string, to: string): void {
        if (this.sourcePath !== from) return;
        this.sourcePath = to;
        this.highlights?.repath(from, to);
        this.app.workspace.requestSaveLayout();
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
                // On the overview's cards the arrows, Home, End and Space move between cards (#776 FR-16).
                if (modifiers?.length === 0 && OVERVIEW_KEYS.has(key) && (event.target as HTMLElement | null)?.closest?.(`.${c("reader-overview")}`)) return true;
                // On the selection popover's buttons the arrows walk them, Space presses one (#811 FR-12).
                if (modifiers?.length === 0 && OVERVIEW_KEYS.has(key) && (event.target as HTMLElement | null)?.closest?.(`.${c("reader-hl-pop")}`)) return true;
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
        const turning = (key: string, shifted: boolean) =>
            taken(() => this.leafKey(key, shifted) || this.runIntent(this.designedTurns() ? designedKeyIntent(key, shifted, this.bookDirection()) : keyIntent(this.effectiveLayout(), key, shifted, this.bookDirection())));
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
        // While listening with nothing selected, H keeps the sentence being read (#765 FR-6).
        bind(none, "H", () => (this.highlights?.highlightCurrent(false) ?? false) || this.listenMark());
        // The listening bar's keys (#765 FR-10): only while the voice reads; otherwise the app's.
        bind(none, "K", () => this.listenKey(() => this.listen?.toggle()));
        bind(none, "[", () => this.listenKey(() => this.listen?.step(-1)));
        bind(none, "]", () => this.listenKey(() => this.listen?.step(1)));
        bind(shift, "H", () => this.highlights?.highlightCurrent(true) ?? false);
        // B bookmarks the place you are reading, or takes the bookmark on this screen away (#761).
        bind(none, "B", () => this.toggleBookmark());
        // P opens and closes the ink palette (#745); Ctrl/⌘+Z undoes the last ink while it is open.
        bind(none, "P", taken(() => this.ink?.togglePalette()));
        // Ctrl/⌘+Z (#810 FR-15, FR-20, FR-21): the ink palette's own undo first, while it is open; then
        // the reading's last write. A text field keeps its own (the `isTyping` pass-through above).
        bind(["Mod"], "Z", () => (this.ink?.undoKey() ?? false) || this.undoLast());
        // 1–4 with words selected: keep them as an idea, a question, a quote, or to discuss (#720).
        for (const n of [1, 2, 3, 4]) bind(none, String(n), () => this.highlights?.chooseMeaning(n - 1) ?? false);
        // Tab from the page into the selection popover (#811 FR-12, D2); with none open, Tab is the app's.
        scope.register(none, "Tab", (event: KeyboardEvent) => !(this.highlights?.focusInPopover(event.target) ?? false));
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
        // Back to the whole framing: a paper's width, a designed page whole (#771 FR-14).
        bind(["Mod"], "0", zoom((run) => run.frame(run.designed() ? "page" : "width")));
    }

    /** Esc: one thing at a time, nearest first — then deep reading, then the reader itself (#764 FR-6). */
    private escape(): void {
        const step = escapeStep({
            proposal: Boolean(this.ink?.reading.hasCards() || this.vaultMoves?.hasCards() || this.aiMoves?.hasCards() || this.claimLink?.hasCards() || this.lookup?.hasCards() || this.snapshot?.hasCards()),
            shortcuts: Boolean(this.shortcuts),
            note: Boolean(this.notePop || this.citePanel?.isOpen()),
            search: Boolean(this.searchEl),
            popover: Boolean(this.highlights?.hasPopover()),
            peek: Boolean(this.peek),
            listen: Boolean(this.listen?.active()),
            snapshot: Boolean(this.snapshot?.active()),
            palette: Boolean(this.ink?.isOpen()),
            detour: this.detours.length > 0,
            panel: Boolean(this.panel),
            reanchor: Boolean(this.highlights?.isReanchoring()),
            deep: this.deep,
        });
        switch (step) {
            case "proposal":
                // The newest card of all, whoever opened it — ink's reading or a move (#748, #756, #759).
                // The claim sheet is one of them (#762): Esc takes it away, nothing written.
                // The look-up card is one too (#766): Esc puts it back into the words.
                // A snapshot's card too (#763): Esc is its Cancel, nothing written.
                dismissNewestOf([this.ink?.reading, this.vaultMoves, this.aiMoves, this.claimLink, this.lookup, this.snapshot]);
                return;
            case "shortcuts":
                return this.closeShortcuts();
            case "note":
                return this.closeNote();
            case "search":
                // Search is the drawer's (#812 FR-7): Esc closes the drawer, and its marks with it.
                return this.panel === "search" ? this.closePanel() : this.closeSearch();
            case "popover":
                // An open *More* folds first, then the popover goes (#811 FR-13).
                return this.highlights?.escapePopover();
            case "peek":
                return this.closePeek();
            case "listen":
                return this.stopListening();
            case "snapshot":
                return this.snapshot?.leave();
            case "palette":
                return this.ink?.closePalette();
            case "detour":
                return void this.backFromDetour();
            case "panel":
                return this.closePanel();
            case "reanchor":
                return this.highlights?.cancelReanchor();
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
        // A page turned or scrolled by your key while listening: the page stops following (#765 FR-14).
        this.listen?.userScrolled();
        const stage = this.els?.stage;
        if (!stage || this.ended || this.pause) {
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
        this.listen?.userScrolled();
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
        // Gestures (#746 G3): what a pen or a finger does on the page.
        card.createDiv({ cls: c("reader-shortcuts-group"), text: t("reader_shortcuts_gestures") });
        const gestures = card.createEl("dl", { cls: c("reader-shortcuts-list") });
        for (const row of GESTURES) {
            const keys = gestures.createEl("dt", { cls: c("reader-shortcuts-keys") });
            for (const key of row.keys) keys.createEl("kbd", { text: kbdCap(key) });
            gestures.createEl("dd", { cls: c("reader-shortcuts-label"), text: t(row.label) });
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
     * The visible page a popover may open into (#811 FR-14): the stage, down to where the bar begins
     * while it shows. Empty (top = bottom) before the page is laid out.
     */
    private pageRoom(): { top: number; bottom: number } {
        const stage = this.els?.stage?.getBoundingClientRect();
        if (!stage) return { top: 0, bottom: 0 };
        const bar = this.root?.querySelector<HTMLElement>(`.${c("reader-bar")}`)?.getBoundingClientRect();
        const barTop = bar && bar.height > 0 && bar.top > stage.top ? bar.top : Infinity;
        return { top: stage.top, bottom: Math.min(stage.top + stage.height, barTop) };
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
        const top = Math.max(0, (el.getBoundingClientRect().top - box.top) / stageScale(stage, box.height) + stage.scrollTop - stage.clientHeight * READING_LINE);
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

type Box = { left: number; top: number; width: number; height: number };

/** An element's box on screen. */
function boxOf(el: HTMLElement): Box {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** A card on its way to its page, or back (#776): its paper, and a copy of what is drawn on it. */
function cardGhost(root: HTMLElement, sheet: HTMLElement): HTMLElement {
    const ghost = root.createDiv({ cls: c("reader-overview-ghost") });
    ghost.remove();
    const picture = sheet.querySelector<HTMLElement>(`.${c("reader-overview-picture")}`);
    if (picture) {
        const copy = picture.cloneNode(true) as HTMLElement;
        copyLive(picture, copy);
        copy.addClass(c("reader-overview-ghost-picture"));
        ghost.appendChild(copy);
    }
    return ghost;
}

/** A preview keeps its first `keep` blocks (#776 D11): the rest of the chapter is let go, never hidden. */
function pruneBlocks(body: HTMLElement, keep: number): void {
    let parent: Element = body;
    for (let depth = 0; depth < 3 && parent.children.length === 1 && (parent.firstElementChild?.children.length ?? 0) > 1; depth++) {
        parent = parent.firstElementChild as Element;
    }
    for (const child of Array.from(parent.children).slice(keep)) child.remove();
}
