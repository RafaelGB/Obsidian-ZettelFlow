import { c } from "architecture";
import { OPENING_MS } from "./readerLookup";

/**
 * **A chapter that is slow to open says so, quietly** (#825, Motion and feel).
 *
 * A chapter is almost always on the page before you could notice it was being drawn — and then
 * nothing at all is shown: a waiting state that flashed on every open would be worse than none. Only
 * past the Reader's one "only say it if it is slow" delay (`OPENING_MS`, the look-up's own, #766) does
 * the page area show the pen about to write (#759's breathing ink) instead of an empty page.
 *
 * It is laid over the page **at once**, invisible, and the stylesheet fades it in after the delay. A
 * timer could not: drawing the chapter holds the main thread, and on a slow device a 150 ms timer fired
 * after 1.6 s, over an empty page (#825 T11). An opacity animation runs on the compositor, so the pen
 * appears on time however busy the page is — and a fast open takes it away before it is ever seen.
 *
 * It lies over the stage as the turn's sheet does, a sibling of it: never inside the chapter's body,
 * so the word count, search and the highlights never see it, and never in the paged strip.
 *
 * Returns the disarm: called once the chapter is drawn (or the open is overtaken).
 */
export function armChapterWait(root: HTMLElement, stage: HTMLElement, label: string): () => void {
    const wait = root.createDiv({ cls: c("reader-chapter-wait"), attr: { role: "status" } });
    wait.setCssProps({ "--zf-wait-delay": `${OPENING_MS}ms` });
    // Right after the stage, as the turn's sheet: over the page, under the bars.
    root.insertBefore(wait, stage.nextSibling);
    const ink = wait.createDiv({ cls: c("reader-ink-wait"), attr: { "aria-hidden": "true" } });
    for (let i = 0; i < 3; i++) ink.createSpan();
    // Said in words for a screen reader: the status region announces its text, not a label.
    wait.createSpan({ cls: c("visually-hidden"), text: label });
    return () => wait.remove();
}
