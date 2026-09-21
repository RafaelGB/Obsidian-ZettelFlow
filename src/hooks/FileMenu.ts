import { t } from "architecture/lang";
import { FrontmatterService, ObsidianConfig } from "architecture/plugin";
import ZettelFlow from "main";
import { Notice, TFile, TFolder } from "obsidian";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { StepBuilderMapper, StepBuilderModal } from "zettelkasten";
import { flowFolders, flowRole } from "architecture/plugin/canvas/flowRole";
import { canvas } from 'architecture/plugin/canvas';

export class FileMenu {


    // Set up FileMenu functionality.
    public static setup(plugin: ZettelFlow) {
        new FileMenu(plugin);
    }
    constructor(private plugin: ZettelFlow) {
        // Register file modification and file menu events.
        plugin.registerEvent(this.onFileMenuTriggered);
    }

    // Register a custom file menu event.
    private onFileMenuTriggered =
        this.plugin.app.workspace.on('file-menu', (menu, file) => {
            const { foldersFlowsPath } = this.plugin.settings;
            if (file instanceof TFolder) {
                menu.addItem((item) => {
                    item
                        .setTitle("Edit folder workflow")
                        .setIcon(RibbonIcon.ID)
                        .onClick(async () => {
                            await ObsidianConfig.openCanvasFile(file, foldersFlowsPath);
                        });
                });
            } else if (file instanceof TFile) {
                const builderMode =
                    flowRole(file.path, flowFolders(this.plugin.settings)) === "create"
                        ? "ribbon"
                        : "editor";
                if (file.extension === "md") {
                    const fileService = FrontmatterService.instance(file);
                    // A note becomes a step **on a canvas**, nowhere else (#519). This menu used to
                    // offer "Transform note into step" on every markdown file in the vault, which
                    // is noise on almost all of them and misleading on the rest: a step only means
                    // something inside a flow, so the builder opened for a note no flow references.
                    // What is left acts on a note that already *is* one.
                    if (!fileService.hasZettelFlowSettings()) return;
                    const zettelFlowSettings = fileService.getZettelFlowSettings();
                    const mappedInfo = StepBuilderMapper.StepSettings2PartialStepBuilderInfo(zettelFlowSettings);
                    menu.addItem((item) => {
                        // Remove step configuration.
                        item
                            .setTitle(t("menu_pane_remove_step_configuration"))
                            .setIcon(RibbonIcon.ID)
                            .onClick(async () => {
                                await fileService.removeStepSettings();
                                new Notice("Step configuration removed!");
                            });
                    }).addItem((item) => {
                        // Copy step configuration to canvas clipboard.
                        item
                            .setTitle(t("menu_pane_copy_step_configuration"))
                            .setIcon(RibbonIcon.ID)
                            .onClick(async () => {
                                canvas.clipboard.save(zettelFlowSettings);
                                new Notice("Step configuration copied!");
                            });
                    });
                    menu.addItem((item) => {
                        item
                            .setTitle(t("menu_pane_edit_step"))
                            .setIcon(RibbonIcon.ID)
                            .onClick(() => {
                                new StepBuilderModal(this.plugin, {
                                    folder: file.parent || undefined,
                                    filename: file.basename,
                                    menu,
                                    ...mappedInfo
                                })
                                    .setMode("edit")
                                    .setBuilder(builderMode)
                                    .open();
                            });
                    });
                    const clipboardSettings = canvas.clipboard.get();
                    if (clipboardSettings) {
                        menu.addItem((item) => {
                            // Paste step configuration from canvas clipboard.
                            item
                                .setTitle(t("menu_pane_paste_step_configuration"))
                                .setIcon(RibbonIcon.ID)
                                .onClick(async () => {
                                    await fileService.setZettelFlowSettings(clipboardSettings);
                                    new Notice("Step configuration pasted!");
                                });
                            // Clear the canvas clipboard cache.
                            canvas.flows.delete(this.plugin.settings.ribbonCanvas);
                        });
                    }
                } else if (file.extension === "canvas") {
                    // Invalidate the stored canvas (if it was loaded previously).
                    canvas.flows.delete(file.path);
                }
            }
        })
}