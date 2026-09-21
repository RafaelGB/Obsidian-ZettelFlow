import { App, SuggestModal } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { MOVE_VERBS, type MoveVerb } from "application/thinking/move";

type LocaleKey = Parameters<typeof t>[0];

/**
 * Which move? (#496, epic #489)
 *
 * #493 put the eleven moves in the command palette and called that one gesture. It is one gesture
 * *for someone who already knows the feature exists* — and the palette is where you go looking
 * for something you know is there, never where you discover anything. The most important
 * capability of the epic ended up effectively invisible, which is a worse failure than the one it
 * was avoiding.
 *
 * So the moves are reached the way everything else in Obsidian is reached: you **right-click**.
 * That needs one menu entry rather than eleven — a context menu is shared with the core app and
 * every other plugin, and filling it with our vocabulary would be rude — and one entry needs
 * somewhere to branch. A nested submenu would be the most native answer and it is still not in
 * Obsidian's typings at 1.13.1, so this is the next one: the picker every user already knows from
 * the quick switcher.
 *
 * **A picker is not a form.** It opens focused, arrows move, enter chooses, and nothing has to be
 * typed. It asks *which* move — the one irreducible question, since there are eleven — and asks
 * nothing else. No *why*, no confirmation, no second step.
 *
 * Each row carries its **primitive** beside the verb, so eleven options read as five kinds. That
 * is the entire reason the vocabulary has a shape.
 */
export class MovePicker extends SuggestModal<MoveVerb> {
    constructor(app: App, noteName: string, private readonly onPick: (verb: MoveVerb) => void) {
        super(app);
        // The note is named in the placeholder, so the picker says what it is about without a
        // title bar repeating it.
        this.setPlaceholder(t("move_pick_placeholder", noteName));
    }

    getSuggestions(query: string): MoveVerb[] {
        const needle = query.trim().toLowerCase();
        if (needle === "") return [...MOVE_VERBS];
        // Matched on what the user reads, not on the stored id: nobody is searching for
        // "set-aside" — they are typing "aside", or the name of the kind it belongs to.
        return MOVE_VERBS.filter((verb) => {
            const label = t(verb.labelKey as LocaleKey).toLowerCase();
            const primitive = t(`move_primitive_${verb.primitive}` as LocaleKey).toLowerCase();
            return label.includes(needle) || primitive.includes(needle);
        });
    }

    renderSuggestion(verb: MoveVerb, el: HTMLElement): void {
        el.addClass(c("move-pick-row"));
        el.createDiv({ cls: c("move-pick-verb"), text: t(verb.labelKey as LocaleKey) });
        el.createDiv({
            cls: c("move-pick-primitive"),
            text: t(`move_primitive_${verb.primitive}` as LocaleKey),
        });
    }

    onChooseSuggestion(verb: MoveVerb): void {
        this.onPick(verb);
    }
}
