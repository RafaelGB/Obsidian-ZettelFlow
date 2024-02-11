import { t } from "architecture/lang";
import { FrontmatterService } from "architecture/plugin";
import ZettelFlow from "main";
import { Notice, TFile, TFolder } from "obsidian";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { StepBuilderMapper, StepBuilderModal } from "zettelkasten";
import { canvas } from 'architecture/plugin/canvas';

export class FileMenu {
    public static setup(plugin: ZettelFlow) {
        new FileMenu(plugin);
    }

    constructor(private plugin: ZettelFlow) {
        plugin.registerEvent(this.onFileMenuTriggered);
    }
    private onFileMenuTriggered =
        this.plugin.app.workspace.on('file-menu', (menu, file) => {
            if (file instanceof TFolder) {
                menu.addItem((item) => {
                    item
                        .setTitle(t("menu_pane_create_new_step"))
                        .setIcon(RibbonIcon.ID)
                        .onClick(() => {
                            new StepBuilderModal(this.plugin.app, {
                                folder: file,
                                menu
                            })
                                .setMode("create")
                                .open();
                        });
                }
                );
            } else if (file instanceof TFile) {
                const builderMode = this.plugin.settings.ribbonCanvas === file.path ? "ribbon" : "editor";
                if (file.extension === "md") {
                    const fileService = FrontmatterService.instance(file);
                    let mappedInfo = {};
                    let title = t("menu_pane_transform_note_into_step");
                    if (fileService.hasZettelFlowSettings()) {
                        const zettelFlowSettings = fileService.getZettelFlowSettings();
                        mappedInfo = StepBuilderMapper.StepSettings2PartialStepBuilderInfo(zettelFlowSettings);
                        menu.addItem((item) => {
                            // Remove step configuration
                            item
                                .setTitle(t("menu_pane_remove_step_configuration"))
                                .setIcon(RibbonIcon.ID)
                                .onClick(async () => {
                                    await fileService.removeStepSettings();
                                    new Notice("Step configuration removed!");
                                });
                        }).addItem((item) => {
                            // Copy step configuration to canvas clipboard
                            item
                                .setTitle(t("menu_pane_copy_step_configuration"))
                                .setIcon(RibbonIcon.ID)
                                .onClick(async () => {
                                    canvas.clipboard.save(zettelFlowSettings);
                                    new Notice("Step configuration copied!");
                                });
                        });
                        // Change title to edit step if step configuration is present
                        title = t("menu_pane_edit_step");
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(title)
                            .setIcon(RibbonIcon.ID)
                            .onClick(() => {
                                new StepBuilderModal(this.plugin.app, {
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
                            // Paste step configuration from canvas clipboard
                            item
                                .setTitle(t("menu_pane_paste_step_configuration"))
                                .setIcon(RibbonIcon.ID)
                                .onClick(async () => {
                                    await fileService.setZettelFlowSettings(clipboardSettings);
                                    new Notice("Step configuration pasted!");
                                });
                            // Clear canvas clipboard cache
                            canvas.flows.delete(this.plugin.settings.ribbonCanvas);
                        });
                    }
                } else if (file.extension === "canvas") {
                    // Invalidate stored canvas (if was loaded before)
                    canvas.flows.delete(file.path);
                }
            }
        })
}