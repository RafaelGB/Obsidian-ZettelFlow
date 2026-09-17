import { t } from "architecture/lang";
import { YamlService } from "architecture/plugin";
import { canvas } from "architecture/plugin/canvas";
import { isWaitNode } from "architecture/plugin/workflow";
import ZettelFlow from "main";
import { Notice } from "obsidian";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { StepBuilderModal } from "zettelkasten";
import { flowFolders, flowRole } from "architecture/plugin/canvas/flowRole";

export class CanvasNodeMenu {
    public static setup(plugin: ZettelFlow) {
        new CanvasNodeMenu(plugin);
    }

    constructor(private plugin: ZettelFlow) {
        plugin.registerEvent(this.onCanvasNodeMenuTriggered);
    }

    private onCanvasNodeMenuTriggered = this.plugin.app.workspace.on("canvas:node-menu", (menu, node) => {

        // Check if canvas is the zettelFlow canvas and if the node is embedded
        const file = this.plugin.app.workspace.getActiveFile();
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
                        new Notice("Embed copied!");
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
                            new Notice("Embed pasted!");
                        })

                });
            }
        }

    });
}