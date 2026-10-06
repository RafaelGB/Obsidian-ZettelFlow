import type { App } from "obsidian";
import { log } from "architecture";
import { planCrystallization } from "application/thinking/crystallize";
import { setAside } from "application/thinking/incubation";
import { thoughtPath, type Thought } from "application/thinking/thought";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { CrystallizeModal } from "architecture/components/core/lab/CrystallizeModal";

/**
 * **From passage to note** (#683, epic #675): a highlight made in a PDF or an EPUB, crystallized
 * the way Think crystallizes — the same preview, the same §XII verdict, the same one door between
 * thinking and the vault (#468). The plan quotes the passage and cites where it was read
 * (`source:: [[book.epub]] p. 42`, L6), so the note is counted as sourced and the Library counts it
 * as born from the book. The note is the only thing written: never the source (L5) — a PDF or an
 * EPUB is never offered as a place to append to.
 *
 * Made into a note, the highlight is set aside — never deleted — exactly as crystallizing in Think
 * and in the review does (#590).
 */
export function crystallizeHighlight(app: App, thought: Thought, done?: (path?: string) => void): void {
    const store = ThoughtStore.getInstance();
    const plan = planCrystallization([thought], { [thought.id]: thoughtPath(store.folder(), thought) });
    if (!plan) return;
    new CrystallizeModal(
        app,
        plan,
        (path) => {
            if (path) {
                void store
                    .save(setAside(thought, "crystallized", Date.now()))
                    .catch((error) => log.warn("[library] could not set the highlight aside", error));
            }
            done?.(path);
        },
        thought.about
    ).open();
}
