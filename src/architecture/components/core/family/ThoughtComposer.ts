import { Platform } from "obsidian";
import { c, log } from "architecture";
import { t } from "architecture/lang";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";

type Register = (el: HTMLElement, type: "keydown" | "click", handler: (event: KeyboardEvent | MouseEvent) => void) => void;

export interface ComposerOptions {
    placeholder: string;
    /** The quiet line under the box: what happens to what you write. */
    hint: string;
    /** The renderer's own `registerDomEvent`, so the listeners go when the mode goes. */
    register: Register;
    /**
     * Where the text goes. Think, by default — a thought, never a note. Returns whether it was kept;
     * a store with no folder answers `false` and the hint says why, in place.
     */
    keep?: (text: string) => Promise<boolean>;
    /** Told after a thought is kept, so the caller can redraw what depends on it. */
    onKept?: (text: string) => void;
}

export interface Composer {
    area: HTMLTextAreaElement;
    focus(): void;
}

/** Think's own store: the composer writes a thought, and nothing else (§XII — a thought is not a note). */
async function keepInThink(text: string): Promise<boolean> {
    const store = ThoughtStore.getInstance();
    if (!store.folder()) return false;
    return (await store.write(text)) !== undefined;
}

/**
 * **The composer** (#702): one shape for writing, shared by Home and Think. A thought is kept when
 * you say so — Ctrl/Cmd+Enter or *Keep it* — never on a timer and never in a modal: Home used to
 * open *Quick capture* in a dialog for the lowest-friction thing this plugin does.
 *
 * What it writes is a **thought** in Think (`ThoughtStore.write`), so nothing written here becomes
 * a note unless you crystallize it later. An empty box keeps nothing.
 */
export function renderComposer(host: HTMLElement, options: ComposerOptions): Composer {
    const box = host.createDiv({ cls: c("family-composer") });
    const area = box.createEl("textarea", {
        cls: c("family-composer-text"),
        attr: { rows: "1", placeholder: options.placeholder, "aria-label": options.placeholder },
    });
    const foot = box.createDiv({ cls: c("family-composer-foot") });
    const hint = foot.createSpan({ cls: c("family-composer-hint"), text: options.hint });
    foot.createSpan({ cls: c("family-composer-space") });
    const keepButton = foot.createEl("button", {
        cls: [c("family-composer-keep"), "clickable-icon"],
        attr: { type: "button", "aria-keyshortcuts": "Control+Enter" },
    });
    keepButton.createSpan({ text: t("family_keep") });
    keepButton.createEl("kbd", { cls: c("family-kbd"), text: Platform.isMacOS ? "⌘ ↵" : "Ctrl ↵" });

    const keep = options.keep ?? keepInThink;
    let busy = false;
    const commit = async (): Promise<void> => {
        const text = area.value.trim();
        if (!text || busy) return;
        busy = true;
        try {
            const kept = await keep(text);
            if (!kept) {
                hint.setText(t("family_no_folder"));
                return;
            }
            area.value = "";
            hint.setText(t("family_kept"));
            // Re-run the acknowledgement even on a second keep in a row.
            box.removeClass(c("is-kept"));
            void box.offsetWidth;
            box.addClass(c("is-kept"));
            options.onKept?.(text);
        } catch (error) {
            log.error("[family] could not keep the thought", error);
            hint.setText(t("family_keep_failed"));
        } finally {
            busy = false;
        }
    };

    options.register(area, "keydown", (event) => {
        const key = event as KeyboardEvent;
        if (key.key === "Enter" && (key.metaKey || key.ctrlKey)) {
            key.preventDefault();
            void commit();
        }
    });
    options.register(keepButton, "click", () => void commit());

    return { area, focus: () => area.focus() };
}
