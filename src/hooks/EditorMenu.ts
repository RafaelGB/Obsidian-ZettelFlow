import { t } from "architecture/lang";
import { Flow, canvas } from "architecture/plugin/canvas";
import ZettelFlow from "main";
import { MarkdownFileInfo, MarkdownView, Notice } from "obsidian";
import { SelectorMenuModal } from "zettelkasten";

export class EditorMenu {
    public static setup(plugin: ZettelFlow) {
        new EditorMenu(plugin);
    }
    constructor(private plugin: ZettelFlow) {
        plugin.registerEvent(this.onContextEditor);
        this.plugin.addCommand({
            id: 'editor-menu-flow',
            name: t('command_open_editor_workflow'),
            callback: async () => {
                const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView) {
                    await this.editorMenu(activeView);
                } else {
                    new Notice(t('notification_editor_menu_no_active_view'));
                }
            }
        });
    }
    private onContextEditor =
        this.plugin.app.workspace.on('editor-menu', (menu, _, info) => {
            menu.addItem((item) => {
                item.setTitle(t('editor_menu_rigth_click_title'))
                    .setIcon('pencil')
                    .setSection('insert')
                    .onClick(async () => {
                        await this.editorMenu(info);
                    });
            });
        });

    private async editorMenu(info: MarkdownView | MarkdownFileInfo) {
        let flow: Flow | undefined;
        if (this.plugin.settings.ribbonCanvas) {
            flow = await canvas.flows.update(this.plugin.settings.editorCanvas);
        }
        new SelectorMenuModal(this.plugin.app, this.plugin, flow, info)
            .enableEditor(true)
            .enableEmbedded(info.file === undefined)
            .open();
    }
}