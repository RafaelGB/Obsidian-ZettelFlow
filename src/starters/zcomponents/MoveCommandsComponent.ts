import { Menu, Notice, TFile } from "obsidian";
import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import { type MoveVerb } from "application/thinking/move";
import { isPathExcluded, scopeExcludedPaths } from "architecture/knowledge/scope/knowledgeScope";
import { MoveLog } from "architecture/plugin/thinking/MoveLog";
import { MovePicker } from "architecture/components/core/moves/MovePicker";
import ZettelFlow from "main";

type LocaleKey = Parameters<typeof t>[0];

/**
 * A move on a note (#493, epic #489).
 *
 * Challenging an idea, finding a counterexample, reframing it, branching two readings out of it
 * — these are exactly as useful against a permanent note you wrote last year as against a raw
 * thought. Until now they existed only inside the Lab, which is the space for what does **not**
 * exist yet.
 *
 * This project corrected that mistake once already, out loud: *Cultivate is for notes that exist,
 * the Lab is for creating new things, they have different purposes.* The correction was right.
 * The **move** is the thing they share, and leaving it on one side of that line stranded half the
 * product.
 *
 * ## One gesture, and no form
 *
 * You **right-click** — in the note you are reading, or on its tab or file — and the moves are
 * there. One entry per menu, because a context menu is shared with the core app and every other
 * plugin, and it opens a keyboard-first picker (#496).
 *
 * **There are no move commands.** #493 shipped eleven of them and called the palette one gesture;
 * it is one gesture for someone who already knows the feature exists, and the most important
 * capability of the epic ended up invisible behind twelve rows of clutter. The palette is where
 * you go looking for something you know is there, never where you discover anything.
 *
 * ## Only where a note is knowledge
 *
 * The entry appears only for a note **inside the knowledge scope** (#311). An excluded path never
 * becomes an idea, so it never accrues moves either — the log already refused them, and a refusal
 * you cannot see is the same invisible failure in a different place. Better not to offer it.
 *
 * There is still deliberately **no nested submenu**. `MenuItem.setSubmenu()` is not in Obsidian's
 * typings at 1.13.1, and this plugin already carries one unavoidable internal dependency (the
 * canvas patcher). The picker is the next most native answer, and it is one every user already
 * knows from the quick switcher.
 *
 * Nothing here asks you to **justify or classify** what you did. Naming the move is the one
 * irreducible question; a picker answers it without anything being typed.
 *
 * ## It never writes to the note
 *
 * A move is a fact about what **you** did, kept in the log. The note is not touched — no
 * property, no frontmatter, no body — and the test for that reads the
 * [write record](../../../docs/architecture/reversibility.md), which would carry an entry if it
 * were. That is what makes this safe to use on a note you care about.
 */
export class MoveCommandsComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        // The discovery path, and the only one: right-click the text you are reading, or the file.
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("editor-menu", (menu: Menu, _editor, view) => {
                const path = view.file?.path;
                if (path && path.endsWith(".md") && this.isKnowledge(path)) this.addMenuEntry(menu, path);
            })
        );
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("file-menu", (menu: Menu, file) => {
                if (file instanceof TFile && file.extension === "md" && this.isKnowledge(file.path)) {
                    this.addMenuEntry(menu, file.path);
                }
            })
        );
    }

    /**
     * Whether this note is knowledge at all (#311). An excluded path — a flow canvas, a script
     * folder, the thinking space — never becomes an idea, so offering to challenge it would be
     * offering something the log will silently refuse.
     */
    private isKnowledge(path: string): boolean {
        return !isPathExcluded(path, scopeExcludedPaths(this.plugin.settings));
    }

    /** One entry, never eleven: the menu is not ours to fill. */
    private addMenuEntry(menu: Menu, path: string): void {
        menu.addItem((item) =>
            item
                .setTitle(t("move_pick_title"))
                .setIcon("brain")
                .onClick(() => this.pick(path))
        );
    }

    private pick(path: string): void {
        const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
        new MovePicker(this.plugin.app, name, (verb) => recordMoveOn(verb, path)).open();
    }
}

/**
 * Write the move down and say so. Acknowledged the moment it lands — a log that fills up silently
 * teaches you it is not there.
 */
export function recordMoveOn(entry: MoveVerb, path: string, because?: string): void {
    const log = MoveLog.getInstance();
    const history = log.forSubject(path);
    const from = history.length > 0 ? history[history.length - 1].id : undefined;
    const recorded = log.record({
        primitive: entry.primitive,
        verb: entry.verb,
        subject: path,
        ...(from ? { from } : {}),
        ...(because ? { because } : {}),
    });
    const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
    new Notice(recorded ? t("move_recorded", t(entry.labelKey as LocaleKey), name) : t("move_not_recorded"));
}
