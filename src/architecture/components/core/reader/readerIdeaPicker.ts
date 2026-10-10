import { c } from "architecture";
import { MOTION, motionWelcome } from "./readerMotion";

/**
 * **The idea picker** (#756 FR-7; #762's *Link to an idea* reuses it) — a search over your ideas,
 * drawn in place where the choice was offered: a field and a short list, ↑ ↓ to move, Enter to
 * pick, Esc to go back. The caller says what can be picked (the notes in scope, the near ones first
 * before you type); the picker only chooses. It writes nothing.
 */

export interface PickerChoice {
    /** What a pick hands back: a vault path. */
    value: string;
    label: string;
}

/** What the picker says when nothing matches (#762 FR-9): a line, and perhaps one way on. */
export interface PickerEmpty {
    text: string;
    action?: { label: string; run(query: string): void };
}

export interface IdeaPickerOptions {
    /** The choices for what is typed — the empty query lists the ones to offer first. */
    choices(query: string): readonly PickerChoice[];
    placeholder: string;
    /** An accessible name for the list. */
    label: string;
    /** `row` is the row picked, for a flight from it (#762 FR-14). */
    onPick(choice: PickerChoice, row?: HTMLElement): void;
    onCancel(): void;
    /** What an empty list says (#762 FR-9). Absent: an empty list says nothing. */
    empty?(query: string): PickerEmpty | null;
    /** The button it was asked from (#762 FR-14): it grows from there. Absent: from its top. */
    from?: { left: number; top: number; width: number; height: number };
}

export interface IdeaPicker {
    el: HTMLElement;
    input: HTMLInputElement;
    /** Say one line under the field — *Already linked to this passage* (#762 FR-7). */
    say(text: string): void;
    /** Close the way it came (scale back and fade, `fast`), then go; at once under reduced motion. */
    close(done?: () => void): void;
}

/** How many choices are shown at once: a few, never a page of them. */
export const PICKER_SHOWN = 6;

export function mountIdeaPicker(container: HTMLElement, options: IdeaPickerOptions): IdeaPicker {
    const el = container.createDiv({ cls: c("reader-idea-picker") });
    const input = el.createEl("input", { cls: c("reader-idea-picker-input"), attr: { type: "search", placeholder: options.placeholder, "aria-label": options.placeholder } });
    const line = el.createDiv({ cls: [c("reader-idea-picker-line"), c("reader-hidden")], attr: { "aria-live": "polite" } });
    const list = el.createDiv({ cls: c("reader-idea-picker-list"), attr: { role: "listbox", "aria-label": options.label } });
    let shown: readonly PickerChoice[] = [];
    let active = 0;
    let closing = false;

    const draw = () => {
        const query = input.value.trim();
        shown = options.choices(query).slice(0, PICKER_SHOWN);
        active = Math.min(active, Math.max(0, shown.length - 1));
        list.empty();
        const empty = shown.length === 0 ? options.empty?.(query) : null;
        if (empty) {
            list.createDiv({ cls: c("reader-idea-picker-empty"), text: empty.text });
            const action = empty.action;
            if (action) {
                const go = list.createEl("button", { cls: c("reader-idea-picker-action"), attr: { type: "button" }, text: action.label });
                go.addEventListener("click", () => action.run(query));
            }
        }
        shown.forEach((choice, i) => {
            const row = list.createEl("button", {
                cls: [c("reader-idea-picker-row"), ...(i === active ? ["is-selected"] : [])],
                attr: { type: "button", role: "option", "aria-selected": String(i === active) },
                text: choice.label,
            });
            row.addEventListener("click", () => options.onPick(choice, row));
        });
    };
    input.addEventListener("input", () => {
        active = 0;
        line.addClass(c("reader-hidden"));
        draw();
    });
    input.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (shown.length === 0) return;
            active = (active + (event.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
            draw();
        } else if (event.key === "Enter") {
            event.preventDefault();
            const choice = shown[active];
            if (choice) options.onPick(choice, list.children[active] as HTMLElement | undefined);
        } else if (event.key === "Escape") {
            // Back to the choice as it was offered: Esc here never closes more than the picker.
            event.preventDefault();
            event.stopPropagation();
            options.onCancel();
        }
    });
    draw();
    // It grows from where it was asked for (0.96 → 1 and a fade, `fast`); under reduced motion it is there.
    const from = options.from;
    if (from) {
        const box = el.getBoundingClientRect();
        el.setCssProps({
            "--zf-origin-x": `${Math.round(from.left + from.width / 2 - box.left)}px`,
            "--zf-origin-y": `${Math.round(from.top + from.height / 2 - box.top)}px`,
        });
    }
    const grow = [
        { transform: "scale(0.96)", opacity: 0 },
        { transform: "scale(1)", opacity: 1 },
    ];
    let growing: Animation | null = motionWelcome(el) ? el.animate(grow, { duration: MOTION.fast, easing: MOTION.ease }) : null;
    input.focus?.({ preventScroll: true });
    return {
        el,
        input,
        say: (text: string) => {
            line.setText(text);
            line.removeClass(c("reader-hidden"));
        },
        close: (done?: () => void) => {
            if (closing) return;
            closing = true;
            let over = false;
            const gone = () => {
                if (over) return;
                over = true;
                el.remove();
                done?.();
            };
            try {
                growing?.finish();
            } catch {
                // Already done.
            }
            growing = null;
            if (!motionWelcome(el)) return gone();
            // The way it came: back to the button, fading.
            const back = el.animate([...grow].reverse(), { duration: MOTION.fast, easing: MOTION.ease, fill: "forwards" });
            back.onfinish = gone;
            (el.win ?? window).setTimeout(gone, MOTION.fast + 300);
        },
    };
}
