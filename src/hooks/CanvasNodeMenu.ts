import { t } from "architecture/lang";
import { YamlService } from "architecture/plugin";
import { canvas } from "architecture/plugin/canvas";
import ZettelFlow from "main";
import { Notice } from "obsidian";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";
import { StepBuilderModal } from "zettelkasten";

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
        if (file?.path !== this.plugin.settings.ribbonCanvas) {
            return;
        }
        const data = node.canvas.data;
        const currentNode = data.nodes.find((n) => n.id === node.id);
        if (!currentNode) {
            return;
        }

        if (currentNode.type === "text" || currentNode.type === "group") {
            const zettelFlowSettings = currentNode.zettelflowConfig;
            menu.addItem((item) => {
                // Edit embed
                item
                    .setTitle(t("canvas_node_menu_edit_embed"))
                    .setIcon(RibbonIcon.ID)
                    .setSection('pane')
                    .onClick(async () => {
                        const stepSettings = YamlService.instance(zettelFlowSettings).getZettelFlowSettings();
                        new StepBuilderModal(this.plugin.app, {
                            folder: file.parent || undefined,
                            filename: file.basename,
                            type: "text",
                            menu,
                            ...stepSettings
                        })
                            .setMode("embed")
                            .setNodeId(node.id)
                            .open();
                    })
            }).addItem((item) => {
                // Copy embed to canvas clipboard
                item
                    .setTitle(t("menu_pane_copy_step_configuration"))
                    .setIcon(RibbonIcon.ID)
                    .setSection('pane')
                    .onClick(async () => {
                        canvas.clipboard.save(YamlService.instance(zettelFlowSettings).getZettelFlowSettings());
                        new Notice("Embed copied!");
                    })
            });

            const clipboardSettings = canvas.clipboard.get();
            if (clipboardSettings) {
                menu.addItem((item) => {
                    // Paste embed from canvas clipboard
                    item
                        .setTitle(t("menu_pane_paste_step_configuration"))
                        .setIcon(RibbonIcon.ID)
                        .setSection('pane')
                        .onClick(async () => {
                            const flow = await canvas.flows.update(file.path);
                            flow.editTextNode(node.id, JSON.stringify(clipboardSettings));
                            new Notice("Embed pasted!");
                        })

                });
            }
        }

    });
}