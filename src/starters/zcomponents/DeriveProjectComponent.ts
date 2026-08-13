import { PluginComponent, log } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { Notice } from "obsidian";
import { KnowledgeIndex } from "architecture/knowledge";
import { deriveOutline } from "architecture/knowledge/projects/deriveOutline";
import { renderOutlineMarkdown } from "architecture/knowledge/projects/renderOutlineMarkdown";
import { FileService, FILE_EXTENSIONS } from "architecture/plugin";

/**
 * Registers the `derive-project` command (#173): clusters the active note's folder into an ordered
 * outline (book/course/article structure) and writes/opens a structure note linking every source
 * note. No hotkey, offline, no AI. Safe Notices when the index isn't ready / no active note / the
 * folder has no indexed notes; failures degrade to a Notice + `log.error`.
 */
export class DeriveProjectComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "derive-project",
            name: t("derive_project_command_name"),
            callback: () => void this.derive(),
        });
    }

    private async derive(): Promise<void> {
        const index = KnowledgeIndex.getInstance();
        if (index.status !== "ready") {
            new Notice(t("derive_project_not_ready"));
            return;
        }
        const folder = this.plugin.app.workspace.getActiveFile()?.parent;
        if (!folder) {
            new Notice(t("derive_project_no_active_note"));
            return;
        }
        try {
            const paths = FileService.getTfilesFromFolder(folder.path, FILE_EXTENSIONS.ONLY_MD, false).map(
                (file) => file.path
            );
            const outline = deriveOutline(index.getModel(), paths, { miscTitle: t("derive_project_misc_section") });
            const linked = outline.sections.reduce((total, section) => total + section.notes.length, 0);
            if (linked === 0) {
                new Notice(t("derive_project_empty"));
                return;
            }
            const folderName = folder.name || "Vault";
            const title = `${folderName} — ${t("derive_project_title_suffix")}`;
            const markdown = renderOutlineMarkdown(outline, { title });
            const outPath = `_ZettelFlow/projects/${folderName} outline.md`;
            await FileService.writeFile(outPath, markdown, true);
            new Notice(t("derive_project_success", String(linked), outPath));
        } catch (error) {
            log.error(`[derive-project] failed: ${error instanceof Error ? error.message : "unknown error"}`);
            new Notice(t("derive_project_error"));
        }
    }
}
