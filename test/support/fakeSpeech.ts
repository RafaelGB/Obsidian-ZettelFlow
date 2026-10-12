/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SpeechEngine, SpeechPort, UtteranceLike } from "architecture/components/core/reader/readerListenSession";
import type { VoiceLike } from "architecture/components/core/reader/readerListen";

/**
 * A speech engine for tests (#765): `window.speechSynthesis` without a sound. `speak` queues one
 * utterance after another, as the real engine does; `endCurrent()` says the one being spoken is done
 * (its `end`, then the next one starts); `cancel()` drops the queue — and, as Chrome does, answers the
 * dropped utterance with an `interrupted` error. `voicesLater()` lists the voices only on
 * `voiceschanged`, as Chrome lists them late. Every call is kept, for a test to say what was heard.
 */
export class FakeSpeech implements SpeechEngine {
    readonly spoken: UtteranceLike[] = [];
    readonly cancels: number[] = [];
    private queue: UtteranceLike[] = [];
    private listeners = new Set<() => void>();
    private listed: VoiceLike[];

    constructor(private voices: VoiceLike[] = [FakeSpeech.voice()]) {
        this.listed = voices;
    }

    static voice(over: Partial<VoiceLike> = {}): VoiceLike {
        const name = over.name ?? "Hazel";
        return { voiceURI: name, name, lang: "en-GB", localService: true, default: true, ...over };
    }

    /** The voices are not listed until `voiceschanged` (Chrome). */
    voicesLater(): this {
        this.listed = [];
        return this;
    }

    /** The voices arrive. */
    listVoices(voices: VoiceLike[] = this.voices): void {
        this.voices = voices;
        this.listed = voices;
        for (const fn of [...this.listeners]) fn();
    }

    getVoices(): VoiceLike[] {
        return this.listed;
    }

    speak(utterance: UtteranceLike): void {
        this.spoken.push(utterance);
        this.queue.push(utterance);
    }

    cancel(): void {
        this.cancels.push(this.spoken.length);
        const dropped = this.queue;
        this.queue = [];
        for (const utterance of dropped) utterance.onerror?.({ error: "interrupted" });
    }

    addEventListener(_type: "voiceschanged", listener: () => void): void {
        this.listeners.add(listener);
    }

    removeEventListener(_type: "voiceschanged", listener: () => void): void {
        this.listeners.delete(listener);
    }

    /** The utterance being spoken now. */
    get speaking(): UtteranceLike | null {
        return this.queue[0] ?? null;
    }

    /** What is being said now. */
    get text(): string | null {
        return this.speaking?.text ?? null;
    }

    /** The utterance being spoken ends: its `end`, and the next in the queue is spoken. */
    endCurrent(): void {
        const done = this.queue.shift();
        done?.onend?.({});
    }

    /** The engine fails the utterance being spoken. */
    failCurrent(error = "synthesis-failed"): void {
        const done = this.queue.shift();
        done?.onerror?.({ error });
    }

    /** The utterance being spoken is lost: no `end` will ever come (an engine's bug). */
    loseCurrent(): void {
        this.queue.shift();
    }
}

/** A plain utterance, as `new SpeechSynthesisUtterance(text)` makes one. */
export function fakeUtterance(text: string): UtteranceLike {
    return { text, lang: "", rate: 1, voice: null, onend: null, onerror: null };
}

/** The port a Reader is handed in a test. */
export function fakeSpeechPort(engine: FakeSpeech = new FakeSpeech()): SpeechPort & { engine: FakeSpeech } {
    return { engine, utter: fakeUtterance } as any;
}
