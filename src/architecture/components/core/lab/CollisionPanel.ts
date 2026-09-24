import { Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import type { Collision, CollisionDistance } from "architecture/knowledge/state";

/** What a card needs to show. Resolved by the caller, so this panel never reads a model. */
export interface CollisionCard {
    path: string;
    title: string;
    /** What the note claims, when it says anything (#561). One sentence is plenty to think with. */
    claim?: string;
}

export interface CollisionDeps {
    /** Draw a pair at this distance, or nothing. The seed and the model belong to the caller. */
    draw(distance: CollisionDistance): Collision | null;
    card(path: string): CollisionCard;
    open(path: string): void;
    /** Tells the surface which pair is on screen, so the composer can be armed about both notes. */
    onPair(pair: Collision | null): void;
}

/**
 * Two things nowhere near each other, and one question (#567, epic #559).
 *
 * The Lab shipped with four moves and a promise that there would not be a fifth: *collision,
 * constraints, perspectives, question transformations belong to the operator engine in phase 2.*
 * This is the collision, and it is the whole of phase 2 for now — one operator, not a catalogue.
 *
 * What arrives on screen is two note titles, what each of them claims when it claims anything, and
 * a question. What must **not** arrive is anything resembling an answer: no hint, no example, no
 * generated analogy, no AI. #497 already decided that for the moves — *the system provides the
 * frame, you provide the content* — and here it is not a constraint but the point. If the system
 * could say what two distant notes share, there would be nothing left to do.
 *
 * It writes nothing. Answering is the Lab's ordinary composer, and the thought it makes carries
 * both notes as its subject — so both of their timelines say a thought was written about them,
 * through a link that was already in the data (#540).
 */
export class CollisionPanel extends Component {
    private distance: CollisionDistance = "far";
    private pair: Collision | null = null;

    constructor(
        private readonly host: HTMLElement,
        private readonly deps: CollisionDeps
    ) {
        super();
    }

    onload(): void {
        this.pair = this.deps.draw(this.distance);
        this.deps.onPair(this.pair);
        this.render();
    }

    onunload(): void {
        this.deps.onPair(null);
        this.host.empty();
    }

    /** Draw another one. Declining a pair costs nothing and records nothing. */
    private again(): void {
        this.pair = this.deps.draw(this.distance);
        this.deps.onPair(this.pair);
        this.render();
    }

    private render(): void {
        this.host.empty();
        this.host.addClass(c("collision"));
        this.host.createEl("h4", { text: t("collision_title") });
        this.host.createDiv({ cls: c("collision-intro"), text: t("collision_intro") });

        this.renderDistance();

        if (!this.pair) {
            // One plain sentence. No empty cards, no apology, and no suggestion to go and write
            // more notes — a vault this small is not doing anything wrong (#516).
            this.host.createDiv({ cls: c("collision-empty"), text: t("collision_nothing_far_enough") });
            return;
        }

        const pair = this.host.createDiv({ cls: c("collision-pair") });
        this.renderCard(pair, this.deps.card(this.pair.a));
        this.renderCard(pair, this.deps.card(this.pair.b));

        const again = this.host.createEl("button", { cls: c("collision-again"), text: t("collision_another") });
        this.registerDomEvent(again, "click", () => this.again());
    }

    /**
     * How far apart — a fact about the graph, and the only difficulty dial this product may have,
     * because you choose it and it is never assigned to you.
     */
    private renderDistance(): void {
        const row = this.host.createDiv({ cls: c("collision-distance") });
        const options: [CollisionDistance, string][] = [
            ["far", "collision_distance_far"],
            ["very-far", "collision_distance_very_far"],
        ];
        for (const [distance, key] of options) {
            const button = row.createEl("button", {
                cls: c("collision-distance-option"),
                text: t(key as Parameters<typeof t>[0]),
            });
            // Obsidian's own class for "this one is on", before inventing one.
            if (this.distance === distance) button.addClass("is-active");
            this.registerDomEvent(button, "click", () => {
                if (this.distance === distance) return;
                this.distance = distance;
                this.again();
            });
        }
    }

    private renderCard(parent: HTMLElement, card: CollisionCard): void {
        const element = parent.createDiv({ cls: c("collision-card") });
        const title = element.createDiv({ cls: c("collision-card-title"), text: card.title });
        title.setAttribute("title", t("collision_open_note"));
        this.registerDomEvent(title, "click", () => this.deps.open(card.path));
        // The sentence the note claims, when it claims one. Never a summary, never a reason these
        // two were drawn — the pair is a fact about the graph and the rest is yours.
        if (card.claim) element.createDiv({ cls: c("collision-card-claim"), text: card.claim });
    }
}
