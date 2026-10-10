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

export interface IdeaPickerOptions {
    /** The choices for what is typed — the empty query lists the ones to offer first. */
    choices(query: string): readonly PickerChoice[];
    placeholder: string;
    /** An accessible name for the list. */
    label: string;
    onPick(choice: PickerChoice): void;
    onCancel(): void;
}

export interface IdeaPicker {
    el: HTMLElement;
    input: HTMLInputElement;
}

/** How many choices are shown at once: a few, never a page of them. */
export const PICKER_SHOWN = 6;

export function mountIdeaPicker(container: HTMLElement, options: IdeaPickerOptions): IdeaPicker {
    const el = container.createDiv({ cls: c("reader-idea-picker") });
    const input = el.createEl("input", { cls: c("reader-idea-picker-input"), attr: { type: "search", placeholder: options.placeholder, "aria-label": options.placeholder } });
    const list = el.createDiv({ cls: c("reader-idea-picker-list"), attr: { role: "listbox", "aria-label": options.label } });
    let shown: readonly PickerChoice[] = [];
    let active = 0;

    const draw = () => {
        shown = options.choices(input.value.trim()).slice(0, PICKER_SHOWN);
        active = Math.min(active, Math.max(0, shown.length - 1));
        list.empty();
        shown.forEach((choice, i) => {
            const row = list.createEl("button", {
                cls: [c("reader-idea-picker-row"), ...(i === active ? ["is-selected"] : [])],
                attr: { type: "button", role: "option", "aria-selected": String(i === active) },
                text: choice.label,
            });
            row.addEventListener("click", () => options.onPick(choice));
        });
    };
    input.addEventListener("input", () => {
        active = 0;
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
            if (choice) options.onPick(choice);
        } else if (event.key === "Escape") {
            // Back to the choice as it was offered: Esc here never closes more than the picker.
            event.preventDefault();
            event.stopPropagation();
            options.onCancel();
        }
    });
    draw();
    // It grows from where it was asked for (0.96 → 1 and a fade, `fast`); under reduced motion it is there.
    if (motionWelcome(el)) {
        el.animate(
            [
                { transform: "scale(0.96)", opacity: 0 },
                { transform: "scale(1)", opacity: 1 },
            ],
            { duration: MOTION.fast, easing: MOTION.ease }
        );
    }
    input.focus?.({ preventScroll: true });
    return { el, input };
}
