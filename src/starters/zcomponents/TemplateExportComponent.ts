import { Modal, Notice, Platform, Setting } from "obsidian";
import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { t } from "architecture/lang";
import { FileService } from "architecture/plugin";
import { FolderSuggest } from "architecture/settings";
import { ConfirmModal } from "architecture/components/settings";
import { buildTemplate, parseTemplate, ZfTemplate } from "application/template/zfTemplate";

export class TemplateExportComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        if (!Platform.isDesktop) return;

        this.plugin.addCommand({
            id: "export-canvas-template",
            name: t("command_export_canvas_template"),
            callback: () => void this.exportCurrentCanvas(),
        });

        this.plugin.addCommand({
            id: "import-canvas-template",
            name: t("command_import_canvas_template"),
            callback: () => this.pickAndImport(),
        });
    }

    private async exportCurrentCanvas(): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        let canvasPath: string | undefined;
        if (activeFile?.extension === "canvas") {
            canvasPath = activeFile.path;
        } else if (this.plugin.settings.ribbonCanvas) {
            canvasPath = this.plugin.settings.ribbonCanvas;
        }

        if (!canvasPath) {
            new Notice(t("export_template_no_canvas"));
            return;
        }

        const canvasFile = await FileService.getFile(canvasPath, false);
        if (!canvasFile) {
            new Notice(t("export_template_no_canvas"));
            return;
        }

        const canvasContent = await FileService.getContent(canvasFile);
        const steps: Array<{ filename: string; content: string }> = [];

        try {
            const canvasData = JSON.parse(canvasContent) as {
                nodes?: Array<{ type?: string; file?: string }>;
            };
            for (const node of canvasData.nodes ?? []) {
                if (node.type === "file" && node.file?.endsWith(".md")) {
                    const stepFile = await FileService.getFile(node.file, false);
                    if (stepFile) {
                        steps.push({
                            filename: stepFile.name,
                            content: await FileService.getContent(stepFile),
                        });
                    }
                }
            }
        } catch {
            // Canvas parse error — export with no steps
        }

        const name = canvasFile.basename;
        const template = buildTemplate(name, "", "", { filename: canvasFile.name, content: canvasContent }, steps);

        const json = JSON.stringify(template, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        // Native createElement (detached) — Obsidian's createEl would append to the document and throw.
        const anchor = activeDocument.createElement("a");
        anchor.href = url;
        anchor.setAttr("download", `${name}.zftemplate`);
        anchor.click();
        URL.revokeObjectURL(url);
        new Notice(t("export_template_success"));
    }

    private pickAndImport(): void {
        const input = activeDocument.createElement("input");
        input.type = "file";
        input.accept = ".zftemplate";
        input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result;
                if (typeof content === "string") {
                    void this.startImport(content);
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    private async startImport(json: string): Promise<void> {
        let template: ZfTemplate;
        try {
            template = parseTemplate(json);
        } catch {
            new Notice(t("import_template_invalid"));
            return;
        }
        new ImportTemplateModal(this.plugin, template).open();
    }
}

class ImportTemplateModal extends Modal {
    private targetFolder = "";

    constructor(
        private plugin: ZettelFlow,
        private template: ZfTemplate
    ) {
        super(plugin.app);
    }

    onOpen(): void {
        this.contentEl.createEl("h2", { text: t("command_import_canvas_template") });

        new Setting(this.contentEl)
            .setName(t("import_template_folder_placeholder"))
            .addSearch((cb) => {
                new FolderSuggest(cb.inputEl);
                cb
                    .setPlaceholder(t("import_template_folder_placeholder"))
                    .onChange((value) => {
                        this.targetFolder = value;
                    });
            });

        new Setting(this.contentEl)
            .addButton((btn) => {
                btn.setButtonText(t("import_template_overwrite"))
                    .setCta()
                    .onClick(() => {
                        this.close();
                        void this.doImport();
                    });
            })
            .addButton((btn) => {
                btn.setButtonText(t("import_template_skip")).onClick(() => {
                    this.close();
                });
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async doImport(): Promise<void> {
        const folder = this.targetFolder || "/";
        const prefix = folder === "/" ? "" : `${folder}/`;

        // Detect conflicts
        const conflicts: string[] = [];
        const canvasPath = `${prefix}${this.template.canvas.filename}`;
        if (await FileService.getFile(canvasPath, false)) {
            conflicts.push(canvasPath);
        }
        for (const step of this.template.steps) {
            const stepPath = `${prefix}${step.filename}`;
            if (await FileService.getFile(stepPath, false)) {
                conflicts.push(stepPath);
            }
        }

        if (conflicts.length > 0) {
            new ConfirmModal(
                this.plugin.app,
                t("import_template_conflict_question"),
                t("import_template_overwrite"),
                t("import_template_skip"),
                async () => this.writeFiles(prefix, true)
            ).open();
        } else {
            await this.writeFiles(prefix, false);
        }
    }

    private async writeFiles(prefix: string, overwrite: boolean): Promise<void> {
        const writeFile = async (path: string, content: string) => {
            const existing = await FileService.getFile(path, false);
            if (existing) {
                if (!overwrite) return;
                await FileService.modify(existing, content);
            } else {
                await FileService.createFile(path, content, false);
            }
        };

        await writeFile(`${prefix}${this.template.canvas.filename}`, this.template.canvas.content);
        for (const step of this.template.steps) {
            await writeFile(`${prefix}${step.filename}`, step.content);
        }
        new Notice(t("import_template_success"));
    }
}
