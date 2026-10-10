import { c, log } from "architecture";
import { t } from "architecture/lang";
import type { Thought } from "application/thinking/thought";
import { renderInkThumb } from "architecture/components/core/reader/readerInkThumb";

/**
 * **Ink in Think** (#745 FR-13): a card of handwriting written in the Reader shows the drawing itself
 * — never a passage, never a highlight's meaning chip — with where it was written and the way back to
 * it. The drawing is read from its file and drawn from its points; nothing is inserted as markup.
 */
export function renderInkCard(
    box: HTMLElement,
    thought: Thought,
    parts: {
        /** The drawing's file, as text. */
        drawing: (thought: Thought) => Promise<string | undefined>;
        /** The source's name, as the shelf shows it. */
        name: string;
        /** Back to the very spot in the Reader, when the source is still there. */
        open?: () => void;
        /** Where the card's listeners live. */
        listen: (el: HTMLElement, run: () => void) => void;
        /** The chip under the drawing (#748): *Read as text*, or what it was read as. */
        chip?: (parent: HTMLElement) => void;
    }
): HTMLElement {
    const block = box.createDiv({ cls: c("lab-ink") });
    const picture = block.createDiv({ cls: c("lab-ink-drawing") });
    parts.chip?.(block);
    const meta = block.createDiv({ cls: c("lab-quote-meta") });
    meta.createSpan({ cls: c("lab-ink-label"), text: t("lab_ink_label") });
    meta.createSpan({ text: parts.name });
    if (parts.open) {
        const open = meta.createEl("button", { cls: c("lab-quote-open"), text: t("lab_highlight_open_reader"), attr: { type: "button" } });
        parts.listen(open, parts.open);
    }
    void parts
        .drawing(thought)
        .then((text) => {
            if (text !== undefined) renderInkThumb(picture, text);
        })
        .catch((error: unknown) => log.warn(`[lab] could not draw an ink note: ${String(error)}`));
    return block;
}
