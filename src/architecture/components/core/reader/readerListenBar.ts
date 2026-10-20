import { Menu, Platform, SuggestModal, getLanguage, setIcon, setTooltip, type App, type Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { MOTION, motionWelcome } from "./readerMotion";
import { LISTEN_RATES, languageName, rateLabel, voiceName, type VoiceEntry, type VoiceLike, type VoiceOffer } from "./readerListen";
import type { ListenMode, ListenSession } from "./readerListenSession";

type LocaleKey = Parameters<typeof t>[0];

/**
 * **Listen**'s two surfaces (#765): the menu under the bar's *Listen* button (FR-1, FR-7) and the
 * listening bar at the foot of the column while the voice reads (FR-5) — pause and play, the previous
 * and the next sentence, the speed, the voice, *Mark*, *Back to the voice* and stop. The bar rises
 * 8 px with a fade as it comes and sinks as it goes (FR-13); under reduced motion it is simply there.
 */

/** How many voices the menu lists, of the reading language's; the rest are in *Other languages…*. */
const MENU_VOICES = 6;

/** The bar's list item that opens the search, not a voice. */
const MORE = "zettelflow:other-languages";

/**
 * A voice as the lists say it (#863): its own name, *(default)* on the one that reads unless you choose,
 * and its language when it is not the reading language's.
 */
function voiceLabel(voice: VoiceLike, offer: VoiceOffer<VoiceLike>, lang: string | null): string {
    const name = voiceName(voice);
    if (voice === offer.auto) return t("reader_listen_default", name);
    const target = lang ?? offer.auto?.lang;
    const foreign = !target || voice.lang.toLowerCase().split(/[-_]/)[0] !== target.toLowerCase().split(/[-_]/)[0];
    return foreign ? `${name} · ${languageName(voice.lang, getLanguage())}` : name;
}

/** *Other languages…* (#863): every voice of the device, found by its name or its language. */
export class VoiceSearchModal extends SuggestModal<VoiceEntry<VoiceLike>> {
    constructor(
        app: App,
        private readonly session: ListenSession
    ) {
        super(app);
        this.setPlaceholder(t("reader_listen_voice_search"));
    }

    getSuggestions(query: string): VoiceEntry<VoiceLike>[] {
        return this.session.entries(getLanguage(), query);
    }

    renderSuggestion(entry: VoiceEntry<VoiceLike>, el: HTMLElement): void {
        const offer = this.session.offer();
        const name = entry.voice === offer.auto ? t("reader_listen_default", entry.name) : entry.name;
        el.createDiv({ text: entry.voice === offer.current ? `✓ ${name}` : name });
        el.createEl("small", { text: entry.language });
    }

    onChooseSuggestion(entry: VoiceEntry<VoiceLike>): void {
        this.session.chooseVoice(entry.voice.voiceURI);
    }
}

export interface ListenMenuDeps {
    app: App;
    session: ListenSession;
    /** Begin *From here* or *This chapter*. */
    start(mode: Exclude<ListenMode, "selection">): void;
    lang(): string | null;
}

/** The *Listen* menu (FR-1): *From here*, *This chapter*, the voice — and on iPad and iPhone, the limit. */
export function openListenMenu(event: MouseEvent, deps: ListenMenuDeps): Menu {
    const menu = new Menu();
    menu.addItem((item) =>
        item
            .setTitle(t("reader_listen_from_here"))
            .setIcon("play")
            .onClick(() => deps.start("here"))
    );
    menu.addItem((item) =>
        item
            .setTitle(t("reader_listen_chapter"))
            .setIcon("list-start")
            .onClick(() => deps.start("chapter"))
    );
    const offer = deps.session.offer();
    const voices = offer.near.slice(0, MENU_VOICES);
    if (voices.length > 1 || offer.more) {
        menu.addSeparator();
        menu.addItem((item) => item.setTitle(t("reader_listen_voice")).setIcon("audio-lines").setDisabled(true));
        for (const voice of voices) {
            menu.addItem((item) =>
                item
                    .setTitle(voiceLabel(voice, offer, deps.lang()))
                    .setChecked(voice.voiceURI === offer.current?.voiceURI)
                    .onClick(() => deps.session.chooseVoice(voice.voiceURI))
            );
        }
        if (offer.more || offer.near.length > voices.length) {
            menu.addItem((item) =>
                item
                    .setTitle(t("reader_listen_other_languages"))
                    .setIcon("languages")
                    .onClick(() => new VoiceSearchModal(deps.app, deps.session).open())
            );
        }
    }
    // What a web view cannot do, said where you are (FR-7): never discovered by losing your place.
    if (Platform.isIosApp) {
        menu.addSeparator();
        menu.addItem((item) => item.setTitle(t("reader_listen_ios")).setIcon("info").setDisabled(true));
    }
    menu.showAtMouseEvent(event);
    return menu;
}

export interface ListenBarDeps {
    app: App;
    session: ListenSession;
    /** Keep the sentence being read as a highlight (FR-6). */
    mark(): void;
    lang(): string | null;
    owner: Component;
}

/** The listening bar (FR-5), drawn once while the voice reads and brought up to date as it changes. */
export class ListenBar {
    readonly el: HTMLElement;
    private readonly playButton: HTMLElement;
    private readonly back: HTMLElement;
    private readonly line: HTMLElement;
    private readonly rate: HTMLSelectElement;
    private readonly voice: HTMLSelectElement;
    private leaving = false;
    /** The voice list as drawn: it is drawn again only when it changes. */
    private voicesKey = "";

    constructor(
        host: HTMLElement,
        private readonly deps: ListenBarDeps
    ) {
        const session = deps.session;
        const bar = host.createDiv({ cls: c("reader-listen-bar"), attr: { role: "toolbar", "aria-label": t("reader_listen") } });
        this.el = bar;
        this.button(bar, "skip-back", "reader_listen_previous", () => session.step(-1));
        this.playButton = this.button(bar, "pause", "reader_listen_pause", () => session.toggle());
        this.button(bar, "skip-forward", "reader_listen_next", () => session.step(1));
        this.rate = bar.createEl("select", { cls: ["dropdown", c("reader-listen-rate")].join(" "), attr: { "aria-label": t("reader_listen_rate") } });
        for (const rate of LISTEN_RATES) this.rate.createEl("option", { text: rateLabel(rate), attr: { value: String(rate) } });
        deps.owner.registerDomEvent(this.rate, "change", () => session.choose({ rate: Number(this.rate.value) }));
        this.voice = bar.createEl("select", { cls: ["dropdown", c("reader-listen-voice")].join(" "), attr: { "aria-label": t("reader_listen_voice") } });
        deps.owner.registerDomEvent(this.voice, "change", () => {
            if (this.voice.value !== MORE) return session.chooseVoice(this.voice.value);
            // *Other languages…* opens the search; the list keeps the voice that reads until you pick one.
            this.voice.value = session.voice()?.voiceURI ?? "";
            new VoiceSearchModal(deps.app, session).open();
        });
        const mark = bar.createEl("button", { cls: c("reader-listen-mark"), attr: { type: "button" } });
        setIcon(mark.createSpan({ cls: c("reader-listen-mark-icon") }), "highlighter");
        mark.createSpan({ text: t("reader_listen_mark") });
        setTooltip(mark, t("reader_key_listen_mark"), { placement: "top" });
        deps.owner.registerDomEvent(mark, "click", () => deps.mark());
        this.back = bar.createEl("button", { cls: [c("reader-listen-back"), c("reader-hidden")].join(" "), attr: { type: "button" }, text: t("reader_listen_back") });
        deps.owner.registerDomEvent(this.back, "click", () => session.backToVoice());
        this.line = bar.createSpan({ cls: [c("reader-listen-line"), c("reader-hidden")].join(" "), text: t("reader_listen_failed"), attr: { role: "status" } });
        this.button(bar, "square", "reader_listen_stop", () => session.stop());
        this.update();
        // It rises into place (FR-13): 8 px and a fade, in the shared beat.
        if (motionWelcome(bar)) {
            bar.animate(
                [
                    { opacity: 0, transform: "translateY(8px)" },
                    { opacity: 1, transform: "translateY(0)" },
                ],
                { duration: MOTION.base, easing: MOTION.ease }
            );
        }
    }

    /** The bar as the session is now: play or pause, following or not, a failed voice. */
    update(): void {
        const session = this.deps.session;
        const speaking = session.status() === "speaking" || session.status() === "turning";
        this.playButton.empty();
        setIcon(this.playButton, speaking ? "pause" : "play");
        const label = t(speaking ? "reader_listen_pause" : "reader_listen_play");
        this.playButton.setAttribute("aria-label", label);
        setTooltip(this.playButton, label, { placement: "top" });
        this.back.toggleClass(c("reader-hidden"), session.isFollowing());
        this.line.toggleClass(c("reader-hidden"), !session.hasFailed());
        const prefs = this.rateValue();
        if (this.rate.value !== prefs) this.rate.value = prefs;
        this.fillVoices();
    }

    /** The voice list (#863): the reading language's voices, the default marked, then *Other languages…*. */
    private fillVoices(): void {
        const offer = this.deps.session.offer();
        const lang = this.deps.lang();
        const options = offer.near.map((voice) => ({ value: voice.voiceURI, text: voiceLabel(voice, offer, lang), title: voice.name }));
        if (offer.more) options.push({ value: MORE, text: t("reader_listen_other_languages"), title: "" });
        const key = options.map((option) => `${option.value}\u0000${option.text}`).join("\u0001");
        if (key !== this.voicesKey) {
            this.voicesKey = key;
            this.voice.empty();
            for (const option of options) this.voice.createEl("option", { text: option.text, attr: { value: option.value, ...(option.title ? { title: option.title } : {}) } });
        }
        const current = offer.current?.voiceURI;
        if (current && this.voice.value !== current) this.voice.value = current;
    }

    /** Away it goes (FR-13): it sinks as it fades; at once under reduced motion. */
    remove(): void {
        if (this.leaving) return;
        this.leaving = true;
        const bar = this.el;
        if (!motionWelcome(bar)) {
            bar.remove();
            return;
        }
        const sink = bar.animate(
            [
                { opacity: 1, transform: "translateY(0)" },
                { opacity: 0, transform: "translateY(8px)" },
            ],
            { duration: MOTION.base, easing: MOTION.ease, fill: "forwards" }
        );
        sink.onfinish = () => bar.remove();
        bar.win.setTimeout(() => bar.remove(), MOTION.base + 200);
    }

    private rateValue(): string {
        return String(this.deps.session.rate());
    }

    private button(parent: HTMLElement, icon: string, key: LocaleKey, run: () => void): HTMLElement {
        const button = parent.createEl("button", { cls: ["clickable-icon", c("reader-listen-button")].join(" "), attr: { type: "button", "aria-label": t(key) } });
        setIcon(button, icon);
        setTooltip(button, t(key), { placement: "top" });
        this.deps.owner.registerDomEvent(button, "click", run);
        return button;
    }
}
