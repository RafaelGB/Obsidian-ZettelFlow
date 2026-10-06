import { setIcon } from "obsidian";
import { c } from "architecture";

/**
 * **One family** (#702, epic #701): Home, Cultivate and Think used to be three different things —
 * a dashboard of tiles, a form of metrics, and a calm stream you write into. Think is the one that
 * works, so the other two borrow its shape: the same page, the same small eyebrow over a section,
 * the same row of keyboard hints at the foot. These are those shapes, said once.
 *
 * Pure DOM helpers — no state, no writes. The composer, which writes, is {@link renderComposer}.
 */

/** One keyboard hint: the keys, then what they do. */
export interface KeyHint {
    keys: readonly string[];
    label: string;
}

/**
 * The page every mode of the family draws into: a centred column that breathes on a wide pane and
 * tightens in a sidebar, entering with the same motion (reduced-motion safe, in the stylesheet).
 */
export function familyPage(container: HTMLElement, mode: "home" | "cultivate" | "think"): HTMLElement {
    return container.createDiv({ cls: [c("family-page"), c("family-view"), c(`family-page--${mode}`)] });
}

/** The quiet label over a section: an icon and a few words, never a heading that shouts. */
export function eyebrow(parent: HTMLElement, icon: string, text: string): HTMLElement {
    const row = parent.createDiv({ cls: c("family-eyebrow") });
    setIcon(row.createSpan({ cls: c("family-eyebrow-icon") }), icon);
    row.createSpan({ text });
    return row;
}

/** The row of keyboard hints at the foot of a mode — what the keys do here, in plain words. */
export function keyHints(parent: HTMLElement, hints: readonly KeyHint[]): HTMLElement {
    const row = parent.createDiv({ cls: c("family-keys") });
    for (const hint of hints) {
        const item = row.createSpan({ cls: c("family-key") });
        for (const key of hint.keys) item.createEl("kbd", { cls: c("family-kbd"), text: key });
        item.createSpan({ text: hint.label });
    }
    return row;
}
