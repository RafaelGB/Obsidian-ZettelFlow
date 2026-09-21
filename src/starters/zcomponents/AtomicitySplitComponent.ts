import { PluginComponent, log } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin/services/FileService";
import { parseNote } from "application/notes/atomicitySplit";
import { AtomicitySplitModal } from "zettelkasten/modals/AtomicitySplitModal";
import { App, MarkdownView, Notice, TFile } from "obsidian";

export class AtomicitySplitComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "split-note-into-atomic-notes",
            name: t("command_atomicity_split"),
            callback: () => void this.run(),
        });
    }

    private async run(): Promise<void> {
        const file = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (!file) {
            log.warn("AtomicitySplit: no active markdown note to split");
            new Notice(t("atomicity_no_active"));
            return;
        }
        await splitNote(this.plugin.app, file);
    }
}

/**
 * Split one note into atomic notes (#501, epic #497).
 *
 * Extracted from the command so it can be reached by **the note a move was made on** rather than
 * by whatever happens to be in the editor — a right-click in the file explorer must not split
 * the note you are reading. One implementation, two doors, the same shape #484 used for the
 * graph.
 *
 * `onDone` fires only when notes were actually created, which is what lets a move record the
 * provenance of a real transformation rather than an intention: cancelled, or nothing to split,
 * and nothing is recorded.
 */
export async function splitNote(app: App, file: TFile, onDone?: (created: number) => void): Promise<void> {
    try {
        const parsed = parseNote(await FileService.getContent(file));
        if (parsed.sections.length < 2) {
            new Notice(t("atomicity_nothing_to_split"));
            return;
        }
        new AtomicitySplitModal(app, file, parsed, onDone).open();
    } catch (error) {
        log.error(`AtomicitySplit: could not read the note — ${String(error)}`);
        new Notice(t("atomicity_error_notice"));
    }
}
