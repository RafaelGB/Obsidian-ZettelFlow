import { t } from "architecture/lang";
import { FrontmatterService, YamlService } from "architecture/plugin";
import { canvas } from "architecture/plugin/canvas";
import { isWaitNode } from "architecture/plugin/workflow";
import ZettelFlow from "main";
import { Menu, Notice, TFile } from "obsidian";
import type { Canvas } from "obsidian/canvas";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { StepBuilderMapper, StepBuilderModal } from "zettelkasten";
import { flowFolders, flowRole } from "architecture/plugin/canvas/flowRole";
import CanvasHelper from "architecture/plugin/canvas/extensions/utils/CanvasHelper";

export class CanvasNodeMenu {
    public static setup(plugin: ZettelFlow) {
        new CanvasNodeMenu(plugin);
    }

    constructor(private plugin: ZettelFlow) {
        plugin.registerEvent(this.onCanvasNodeMenuTriggered);
    }

    private onCanvasNodeMenuTriggered = this.plugin.app.workspace.on("canvas:node-menu", (menu, node) => {

        // The canvas the node is on — not the workspace's active file, which a focused file node
        // turns into the note it embeds (#686).
        const file = CanvasHelper.canvasFile(this.plugin, node.canvas as unknown as Canvas);
        if (file === null) {
            return;
        }
        // One question, one answer (#435): this used to forget the hooks folder, so a hook flow's
        // nodes had no menu at all.
        const role = flowRole(file.path, flowFolders(this.plugin.settings));
        if (role === "none") return;

        const data = node.canvas.data;
        const currentNode = data.nodes.find((n) => n.id === node.id);
        if (!currentNode) {
            return;
        }
        const builderMode = role === "create" ? "ribbon" : "editor";
        if (currentNode.type === "file") {
            this.fileNodeItems(menu, currentNode.file, builderMode);
            return;
        }
        if (currentNode.type === "text" || currentNode.type === "group") {
            const zettelFlowSettings = currentNode.zettelflowConfig;
            menu.addItem((item) => {
                // Edit embed
                item
                    .setTitle(t("canvas_node_menu_edit_embed"))
                    .setIcon(RibbonIcon.ACTION)
                    .setSection('pane')
                    .onClick(async () => {
                        const stepSettings = YamlService.instance(zettelFlowSettings).getZettelFlowSettings();
                        new StepBuilderModal(this.plugin, {
                            folder: file.parent || undefined,
                            filename: file.basename,
                            // The node's real kind — a group is not an inline box (#424).
                            type: currentNode.type,
                            menu,
                            ...stepSettings
                        })
                            .setMode("embed")
                            .setBuilder(builderMode)
                            .setNodeId(node.id)
                            .open();
                    })
            }).addItem((item) => {
                // Copy embed to canvas clipboard
                item
                    .setTitle(t("menu_pane_copy_step_configuration"))
                    .setIcon(RibbonIcon.ACTION)
                    .setSection('pane')
                    .onClick(async () => {
                        canvas.clipboard.save(YamlService.instance(zettelFlowSettings).getZettelFlowSettings());
                        this.say(t("canvas_node_menu_step_copied"));
                    })
            });

            // WAIT affordance (#151): mark/unmark this node as a human-confirmation pause.
            menu.addItem((item) => {
                const stepSettings = YamlService.instance(zettelFlowSettings).getZettelFlowSettings();
                const hasWait = isWaitNode(stepSettings);
                item
                    .setTitle(hasWait ? t("canvas_node_menu_unmark_wait") : t("canvas_node_menu_mark_wait"))
                    .setIcon(RibbonIcon.ACTION)
                    .setSection('pane')
                    .onClick(async () => {
                        const next = { ...stepSettings };
                        if (hasWait) delete next.wait;
                        else next.wait = { mode: "confirm" };
                        const flow = await canvas.flows.update(file.path);
                        void flow.editTextNode(node.id, JSON.stringify(next));
                    });
            });

            const clipboardSettings = canvas.clipboard.get();
            if (clipboardSettings) {
                menu.addItem((item) => {
                    // Paste embed from canvas clipboard
                    item
                        .setTitle(t("menu_pane_paste_step_configuration"))
                        .setIcon(RibbonIcon.ACTION)
                        .setSection('pane')
                        .onClick(async () => {
                            const flow = await canvas.flows.update(file.path);
                            void flow.editTextNode(node.id, JSON.stringify(clipboardSettings));
                            this.say(t("canvas_node_menu_step_pasted"));
                        })

                });
            }
        }

    });

    /**
     * A file node's note, on a flow canvas only (#519, #686): a note becomes a step **here**, and a
     * note that already is one is edited, copied or stops being one here. Its markdown is still its
     * template — the step lives in its frontmatter beside it.
     */
    private fileNodeItems(menu: Menu, path: unknown, builderMode: "ribbon" | "editor"): void {
        if (typeof path !== "string") return;
        const note = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(note instanceof TFile) || note.extension !== "md") return;
        const fileService = FrontmatterService.instance(note);
        const isStep = fileService.hasZettelFlowSettings();
        const settings = isStep ? fileService.getZettelFlowSettings() : undefined;
        menu.addItem((item) => {
            item
                .setTitle(isStep ? t("canvas_node_menu_edit_embed") : t("canvas_node_menu_make_step"))
                .setIcon(RibbonIcon.ACTION)
                .setSection("pane")
                .onClick(() => {
                    new StepBuilderModal(this.plugin, {
                        folder: note.parent || undefined,
                        filename: note.basename,
                        menu,
                        ...(settings ? StepBuilderMapper.StepSettings2PartialStepBuilderInfo(settings) : {}),
                    })
                        .setMode("edit")
                        .setBuilder(builderMode)
                        .open();
                });
        });
        if (settings) {
            menu.addItem((item) => {
                item
                    .setTitle(t("menu_pane_copy_step_configuration"))
                    .setIcon(RibbonIcon.ACTION)
                    .setSection("pane")
                    .onClick(() => {
                        canvas.clipboard.save(settings);
                        this.say(t("canvas_node_menu_step_copied"));
                    });
            });
            menu.addItem((item) => {
                item
                    .setTitle(t("menu_pane_remove_step_configuration"))
                    .setIcon(RibbonIcon.ACTION)
                    .setSection("pane")
                    .onClick(async () => {
                        await fileService.removeStepSettings();
                        this.say(t("canvas_node_menu_step_removed"));
                    });
            });
        }
        const clipboardSettings = canvas.clipboard.get();
        if (clipboardSettings) {
            menu.addItem((item) => {
                item
                    .setTitle(t("menu_pane_paste_step_configuration"))
                    .setIcon(RibbonIcon.ACTION)
                    .setSection("pane")
                    .onClick(async () => {
                        await fileService.setZettelFlowSettings(clipboardSettings);
                        this.say(t("canvas_node_menu_step_pasted"));
                    });
            });
        }
    }

    /** What a menu item did, said once the menu has closed — the canvas has nowhere inline to say it. */
    private say(text: string): void {
        new Notice(text);
    }
}