import { Notice } from "obsidian";
import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import { MOVE_VERBS, type MoveVerb } from "application/thinking/move";
import { MoveLog } from "architecture/plugin/thinking/MoveLog";
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
 * The **command palette** is the door, and it is the reason eleven verbs can each be one gesture
 * without becoming a menu nobody reads: you type "challenge", you press enter, it is done. Every
 * command is separately hotkey-bindable.
 *
 * There is deliberately **no context-menu submenu**. Nesting a menu needs `MenuItem.setSubmenu()`,
 * which Obsidian ships at runtime and does not declare in its typings — an internal API reached
 * by a cast, for a convenience. This plugin already carries one unavoidable internal dependency
 * (the canvas patcher) and it is not worth a second for a right-click. **Cultivate** is the
 * in-context door instead, and it is the better one anyway: it is where you are already deciding
 * what to do with a note.
 *
 * Nothing here opens a dialogue asking you to classify what you just did. If naming a move took
 * longer than making one, nobody would ever make one.
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
        for (const entry of MOVE_VERBS) {
            this.plugin.addCommand({
                // Stable from the first release: these are bindable, so the label may change and
                // the id may not.
                id: `move-${entry.verb}`,
                name: t(entry.labelKey as LocaleKey),
                checkCallback: (checking: boolean) => {
                    const file = this.plugin.app.workspace.getActiveFile();
                    if (!file || file.extension !== "md") return false;
                    if (!checking) recordMoveOn(entry, file.path);
                    return true;
                },
            });
        }

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
