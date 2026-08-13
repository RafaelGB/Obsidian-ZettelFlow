import { PluginComponent, log } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin/services/FileService";
import { parseNote } from "application/notes/atomicitySplit";
import { AtomicitySplitModal } from "zettelkasten/modals/AtomicitySplitModal";
import { MarkdownView, Notice } from "obsidian";

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

        try {
            const parsed = parseNote(await FileService.getContent(file));
            if (parsed.sections.length < 2) {
                new Notice(t("atomicity_nothing_to_split"));
                return;
            }
            new AtomicitySplitModal(this.plugin.app, file, parsed).open();
        } catch (error) {
            log.error(`AtomicitySplit: could not read the active note — ${String(error)}`);
            new Notice(t("atomicity_error_notice"));
        }
    }
}
