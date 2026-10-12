import { c, log } from "architecture";
import {
    VOICES_PATIENCE_MS,
    chooseVoice,
    followScroll,
    localVoices,
    paragraphsOf,
    sentenceAtTop,
    sentenceFrom,
    sentenceWatchdogMs,
    sentencesWithin,
    splitSentences,
    type ListenParagraph,
    type ListenPrefs,
    type Sentence,
    type VoiceLike,
} from "./readerListen";
import type { NodeLike } from "./readerMarks";

/**
 * **Listen** (#765): the book read aloud, sentence by sentence, in the device's own voices — and the
 * page following the voice. One `SpeechSynthesisUtterance` per sentence (FR-3); the paragraph read is
 * tinted (`reader-listen-now`) and kept in view, by one smooth move near the bottom, never per
 * sentence (FR-11). It writes nothing (FR-9): a mark is the Reader's highlight engine, asked by the view.
 *
 * Speech is never paused and resumed: WebKit's `resume()` after a lock is unreliable, so a pause is a
 * `cancel()` that remembers the sentence, and play speaks that sentence again (AC-6).
 */

/** An utterance, as far as Listen sets one: `SpeechSynthesisUtterance`'s own fields. */
export interface UtteranceLike {
    text: string;
    lang: string;
    rate: number;
    voice: VoiceLike | null;
    onend: ((event: unknown) => void) | null;
    onerror: ((event: { error?: string }) => void) | null;
}

/** The engine, as far as Listen uses it: `window.speechSynthesis`. */
export interface SpeechEngine {
    getVoices(): VoiceLike[];
    speak(utterance: UtteranceLike): void;
    cancel(): void;
    addEventListener?(type: "voiceschanged", listener: () => void): void;
    removeEventListener?(type: "voiceschanged", listener: () => void): void;
}

/** The Web Speech API of one window, or a test's stand-in for it. */
export interface SpeechPort {
    engine: SpeechEngine;
    utter(text: string): UtteranceLike;
}

/** The window's speech, where it has one — `null` where the API is missing (FR-8). */
export function speechPortOf(win: Window | undefined | null): SpeechPort | null {
    const w = win as (Window & { speechSynthesis?: SpeechEngine; SpeechSynthesisUtterance?: new (text: string) => UtteranceLike }) | null | undefined;
    const engine = w?.speechSynthesis;
    const Utterance = w?.SpeechSynthesisUtterance;
    if (!engine || typeof engine.speak !== "function" || typeof Utterance !== "function") return null;
    return { engine, utter: (text) => new Utterance(text) };
}

/** Where the voice starts and where it stops (FR-1, FR-3). */
export type ListenMode = "here" | "chapter" | "selection";

export type ListenState = "idle" | "speaking" | "paused" | "turning";

/** The pages in *Page* and *Spread* (#753): the page read is kept in view, not the scroll. */
export interface ListenPager {
    paged: boolean;
    onScreen(el: HTMLElement): boolean;
    reveal(el: HTMLElement, travel?: boolean): number;
}

/** What the session asks of the Reader. */
export interface ListenView {
    /** The chapter's text on the page now: its body. */
    body(): HTMLElement | null;
    stage(): HTMLElement | null;
    pager(): ListenPager | null;
    /** The chapter on the page, and whether it is the book's last. */
    chapter(): number;
    isLast(): boolean;
    /** A reading turn to the next chapter, by the reader's own chapter motion (FR-12). */
    turn(): void;
    /** How long until the turn now playing lands (0 under reduced motion). */
    landsIn(): number;
    motion(): boolean;
    /** The language the book is read in, for the voice (FR-2). */
    lang(): string | null;
    prefs(): ListenPrefs;
    savePrefs(prefs: ListenPrefs): void;
    /** Listening began or ended: no chapter end pauses meanwhile (#755). */
    setListening(on: boolean): void;
    /** The bar draws itself again. */
    changed(): void;
    setTimeout(fn: () => void, ms: number): number;
    clearTimeout(id: number | undefined): void;
}

const NOW = c("reader-listen-now");
const PARA = c("reader-listen-para");

export class ListenSession {
    private state: ListenState = "idle";
    private mode: ListenMode = "here";
    private paragraphs: ListenParagraph<HTMLElement>[] = [];
    private sentences: Sentence[] = [];
    private index = 0;
    private chapterAt = -1;
    private token = 0;
    private watchdog: number | undefined;
    private landing: number | undefined;
    /** The utterance being spoken, held: an engine that loses it to the collector never says `end`. */
    private current: UtteranceLike | null = null;
    private tinted: HTMLElement | null = null;
    private following = true;
    private failed = false;
    private voicesTimer: number | undefined;

    constructor(
        private readonly view: ListenView,
        private readonly port: SpeechPort
    ) {}

    // ── what the bar reads ─────────────────────────────────────────────────

    status(): ListenState {
        return this.state;
    }

    active(): boolean {
        return this.state !== "idle";
    }

    isFollowing(): boolean {
        return this.following;
    }

    hasFailed(): boolean {
        return this.failed;
    }

    /** The sentence being read (or the one play reads next): its span in the chapter's text. */
    sentence(): Sentence | null {
        return this.sentences[this.index] ?? null;
    }

    /** The device's own voices (FR-2). */
    voices(): VoiceLike[] {
        return localVoices(this.port.engine.getVoices?.() ?? []);
    }

    rate(): number {
        return this.view.prefs().rate;
    }

    voice(): VoiceLike | null {
        return chooseVoice(this.port.engine.getVoices?.() ?? [], this.view.lang(), this.view.prefs().voice);
    }

    /**
     * Whether the device has a voice of its own, now or once its voices are listed — Chrome lists them
     * late, after `voiceschanged`. `ready` is called once it is known (at most a second later).
     */
    whenVoices(ready: (available: boolean) => void): void {
        if (this.voices().length > 0) {
            ready(true);
            return;
        }
        const engine = this.port.engine;
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            engine.removeEventListener?.("voiceschanged", finish);
            this.view.clearTimeout(this.voicesTimer);
            ready(this.voices().length > 0);
        };
        engine.addEventListener?.("voiceschanged", finish);
        this.voicesTimer = this.view.setTimeout(finish, VOICES_PATIENCE_MS);
    }

    // ── start and stop ─────────────────────────────────────────────────────

    /**
     * Begin (FR-1): *From here* at `from` (the chapter's offset of the paragraph at the top of the
     * page, or the one you last tapped), *This chapter* at its start, *Read aloud* over `span` only.
     */
    start(mode: ListenMode, options: { from?: number; top?: boolean; span?: { start: number; end: number }; onScreen?: (el: HTMLElement) => boolean } = {}): boolean {
        this.interrupt();
        this.mode = mode;
        this.failed = false;
        this.following = true;
        if (!this.read()) return false;
        if (mode === "selection") {
            this.sentences = options.span ? sentencesWithin(this.sentences, options.span) : [];
            this.index = 0;
        } else {
            const from = options.from ?? 0;
            const onScreen = options.onScreen;
            // From the top of the page: the first paragraph that begins there (FR-1); a tapped one, at once.
            this.index =
                mode !== "here"
                    ? 0
                    : options.top && onScreen
                      ? sentenceAtTop(this.sentences, this.paragraphs, from, (para) => {
                            const el = this.paragraphs[para]?.el;
                            return Boolean(el && onScreen(el));
                        })
                      : sentenceFrom(this.sentences, from);
        }
        if (this.sentences.length === 0) {
            this.stop();
            return false;
        }
        const was = this.state;
        this.state = "speaking";
        if (was === "idle") this.view.setListening(true);
        this.speak();
        return true;
    }

    /** Stop listening (FR-5): the voice, the tint, the bar. Leaving the Reader does this too. */
    stop(): void {
        this.interrupt();
        this.view.clearTimeout(this.landing);
        this.view.clearTimeout(this.voicesTimer);
        this.untint();
        const was = this.state;
        this.state = "idle";
        this.sentences = [];
        this.paragraphs = [];
        this.current = null;
        if (was !== "idle") {
            this.view.setListening(false);
            this.view.changed();
        }
    }

    pause(): void {
        if (this.state !== "speaking") return;
        this.interrupt();
        this.state = "paused";
        this.view.changed();
    }

    play(): void {
        if (this.state !== "paused") return;
        this.failed = false;
        this.state = "speaking";
        this.speak();
    }

    toggle(): void {
        if (this.state === "speaking") this.pause();
        else if (this.state === "paused") this.play();
    }

    /** The previous or the next sentence (FR-5): spoken at once while speaking, shown while paused. */
    step(delta: 1 | -1): void {
        if (this.state !== "speaking" && this.state !== "paused") return;
        const next = Math.max(0, Math.min(this.sentences.length - 1, this.index + delta));
        if (next === this.index) return;
        this.index = next;
        if (this.state === "speaking") {
            this.interrupt();
            this.speak();
        } else {
            this.tint();
            this.view.changed();
        }
    }

    /** A speed or a voice chosen in the bar: kept on this device, and heard from this sentence on. */
    choose(prefs: Partial<ListenPrefs>): void {
        this.view.savePrefs({ ...this.view.prefs(), ...prefs });
        if (this.state === "speaking") {
            this.interrupt();
            this.speak();
        } else this.view.changed();
    }

    /** The page was hidden — an iPad locked, another app (FR-7, AC-6): paused at its sentence. */
    hidden(): void {
        if (this.state === "speaking") this.pause();
    }

    /** You moved the page yourself (FR-14): it stops following until *Back to the voice*. */
    userScrolled(): void {
        if (this.state === "idle" || !this.following) return;
        this.following = false;
        this.view.changed();
    }

    /** *Back to the voice* (FR-14): the paragraph read, back in view in one move, and followed again. */
    backToVoice(): void {
        this.following = true;
        if (this.tinted) this.follow(this.tinted, true);
        this.view.changed();
    }

    /**
     * The chapter on the page was drawn: after a turn the voice goes on as it lands (FR-12); a chapter
     * you went to yourself is read from its start (*From here*) or ends the listening; the same chapter
     * drawn again keeps its place.
     */
    chapterDrawn(): void {
        if (this.state === "idle") return;
        const chapter = this.view.chapter();
        if (this.state !== "turning" && chapter === this.chapterAt) {
            const at = this.sentences[this.index]?.start ?? 0;
            const selection = this.mode === "selection" ? this.sentences : null;
            if (!this.read()) return this.stop();
            this.sentences = selection ?? this.sentences;
            this.index = Math.max(0, this.sentences.findIndex((sentence) => sentence.start >= at));
            this.tint();
            return;
        }
        if (this.mode !== "here") return this.stop();
        const turning = this.state === "turning";
        this.view.clearTimeout(this.landing);
        const begin = () => {
            if (this.state === "idle" || this.view.chapter() !== chapter) return;
            if (!this.read() || this.sentences.length === 0) return turning && !this.view.isLast() ? this.turnOn() : this.stop();
            this.index = 0;
            if (turning) this.state = "speaking";
            if (this.state === "speaking") this.speak();
            else this.tint();
        };
        // The voice goes on as the turn lands — at once under reduced motion (FR-12, FR-15).
        const wait = turning ? this.view.landsIn() : 0;
        if (wait > 0) this.landing = this.view.setTimeout(begin, wait);
        else begin();
    }

    // ── inside ─────────────────────────────────────────────────────────────

    /** The chapter on the page as paragraphs and sentences. */
    private read(): boolean {
        const body = this.view.body();
        if (!body) return false;
        this.untint();
        this.paragraphs = paragraphsOf(body as unknown as NodeLike) as unknown as ListenParagraph<HTMLElement>[];
        this.sentences = splitSentences(this.paragraphs);
        this.chapterAt = this.view.chapter();
        return true;
    }

    private speak(): void {
        const sentence = this.sentences[this.index];
        if (!sentence) return this.end();
        const id = ++this.token;
        const prefs = this.view.prefs();
        const voice = this.voice();
        const utterance = this.port.utter(sentence.text);
        utterance.rate = prefs.rate;
        utterance.voice = voice;
        const lang = voice?.lang ?? this.view.lang();
        if (lang) utterance.lang = lang;
        utterance.onend = () => {
            if (id === this.token) this.advance();
        };
        utterance.onerror = (event) => {
            if (id !== this.token) return;
            // A cancel of our own says *interrupted* or *canceled*: not a failure.
            if (event?.error === "interrupted" || event?.error === "canceled") return;
            this.fail(event?.error ?? "error");
        };
        this.current = utterance;
        this.view.clearTimeout(this.watchdog);
        this.watchdog = this.view.setTimeout(() => {
            if (id !== this.token || this.state !== "speaking") return;
            log.debug(`[Reader] listen: no end for sentence ${this.index}; going on`);
            this.advance();
        }, sentenceWatchdogMs(sentence.text, prefs.rate));
        this.tint();
        this.port.engine.speak(utterance);
        this.view.changed();
    }

    private advance(): void {
        this.view.clearTimeout(this.watchdog);
        if (this.state !== "speaking") return;
        this.index++;
        if (this.index < this.sentences.length) this.speak();
        else this.end();
    }

    /** The end of what was asked (FR-3): *From here* turns the chapter and goes on; the rest stop. */
    private end(): void {
        if (this.mode === "here" && !this.view.isLast()) this.turnOn();
        else this.stop();
    }

    private turnOn(): void {
        this.state = "turning";
        this.view.changed();
        this.view.turn();
    }

    private fail(error: string): void {
        log.warn(`[Reader] listen: the voice stopped (${error})`);
        this.interrupt();
        this.failed = true;
        this.state = "paused";
        this.view.changed();
    }

    /** Silence now, and every answer of what was being said ignored. */
    private interrupt(): void {
        this.token++;
        this.view.clearTimeout(this.watchdog);
        // What it was saying answers nothing now: its `end` and its error are let go.
        if (this.current) this.current.onend = null;
        this.current = null;
        if (this.state === "speaking" || this.state === "turning") this.port.engine.cancel();
    }

    /** The paragraph of the sentence read takes the tint; the old one gives it back (FR-11). */
    private tint(): void {
        const sentence = this.sentences[this.index];
        const el = sentence ? (this.paragraphs[sentence.para]?.el ?? null) : null;
        if (!el || el === this.tinted) return;
        this.tinted?.removeClass(NOW);
        el.addClass(PARA, NOW);
        this.tinted = el;
        this.follow(el);
    }

    private untint(): void {
        this.tinted = null;
        for (const paragraph of this.paragraphs) paragraph.el?.removeClasses?.([NOW, PARA]);
    }

    /** Keep the paragraph read in view (FR-4, FR-11): one move near the bottom; the page in pages. */
    private follow(el: HTMLElement, force = false): void {
        if (!this.following && !force) return;
        const motion = this.view.motion();
        const pager = this.view.pager();
        if (pager?.paged) {
            if (force || !pager.onScreen(el)) pager.reveal(el, motion);
            return;
        }
        const stage = this.view.stage();
        if (!stage) return;
        const para = el.getBoundingClientRect();
        const view = stage.getBoundingClientRect();
        const top = followScroll({ paraTop: para.top, paraBottom: para.top + para.height, viewTop: view.top, viewHeight: view.height, scrollTop: stage.scrollTop }, force);
        if (top === null) return;
        stage.scrollTo({ top, behavior: motion ? "smooth" : "auto" });
    }
}
