import { Modal, type App } from "obsidian";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { ThoughtStore } from "architecture/plugin/thinking/ThoughtStore";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import { openReader } from "architecture/components/core/reader/openReader";
import { normalizeReaderPrefs, readerClassNames } from "architecture/components/core/reader/readerPrefs";
import { CrystallizeModal } from "architecture/components/core/lab/CrystallizeModal";
import { planCrystallization } from "application/thinking/crystallize";
import { setAside } from "application/thinking/incubation";
import { thoughtPath, type Thought } from "application/thinking/thought";
import { ReviewCards, type ReviewDeps } from "./ReviewCards";

/**
 * The few cards, in a modal dressed as the Reader (#678): its font, size and theme, so a highlight
 * comes back looking the way it looked when you marked it. Esc is the modal's, as everywhere.
 */
export class ReviewModal extends Modal {
    private cards: ReviewCards | undefined;

    constructor(
        app: App,
        private readonly due: Thought[]
    ) {
        super(app);
    }

    onOpen(): void {
        const prefs = normalizeReaderPrefs(ObsidianApi.getOwnPlugin()?.settings?.readerPrefs);
        const { plugin, obsidian } = readerClassNames(prefs);
        // Not the reader's own frame — that one fills a leaf — only the way it sets its type.
        // Nor how a chapter is laid out (#753): a card is not paged.
        const look = plugin.filter((name) => name !== "reader" && !name.startsWith("reader--layout-")).map((name) => c(name));
        this.modalEl.addClasses([c("review-modal"), ...look, ...obsidian]);
        this.setTitle(t("review_title"));
        this.cards = new ReviewCards(this.contentEl, this.due, reviewDeps(this.app, () => this.close()));
        this.cards.load();
        this.cards.keys(this.scope);
    }

    onClose(): void {
        this.cards?.unload();
        this.cards = undefined;
        this.contentEl.empty();
    }
}

/** The world the cards act on: Think's store, the judgement record, the Reader, crystallize. */
export function reviewDeps(app: App, close: () => void): ReviewDeps {
    const store = ThoughtStore.getInstance();
    return {
        store,
        record: (thought, verdict) => {
            JudgementLog.getInstance().record({
                path: thought.about ?? "",
                subject: `highlight:${thought.id}`,
                origin: "human",
                verdict,
            });
        },
        openReader: (thought) => {
            close();
            if (thought.about) void openReader(app, { seed: thought.about, highlight: thought.id });
        },
        toNote: (thought, done) => {
            // The plan quotes the passage and cites where it was read (#679), so the note is sourced.
            const plan = planCrystallization([thought], { [thought.id]: thoughtPath(store.folder(), thought) });
            if (!plan) return;
            new CrystallizeModal(
                app,
                plan,
                (path) => {
                    // Made into a note, it leaves the bench and the review with it — set aside,
                    // never deleted, exactly as crystallizing in Think does (#590).
                    if (path) {
                        void store
                            .save(setAside(thought, "crystallized", Date.now()))
                            .catch((error) => log.warn("[review] could not set the highlight aside", error));
                    }
                    done(path);
                },
                thought.about
            ).open();
        },
        close,
        now: () => Date.now(),
    };
}

/** Open the review on whatever is due. With nothing due, the cards say so — no toast. */
export async function openReview(app: App): Promise<void> {
    const due = await ThoughtStore.getInstance().dueHighlights();
    new ReviewModal(app, due).open();
}
