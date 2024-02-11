import { Flow, canvas } from "architecture/plugin/canvas";
import ZettelFlow from "main";
import { SelectorMenuModal } from "zettelkasten";

export class EditorMenu {
    public static setup(plugin: ZettelFlow) {
        new EditorMenu(plugin);
    }
    constructor(private plugin: ZettelFlow) {
        plugin.registerEvent(this.onContextEditor);
    }
    private onContextEditor =
        this.plugin.app.workspace.on('editor-menu', (menu, editor, info) => {

            menu.addItem((item) => {
                item.setTitle('ZettelFlow template')
                    .setIcon('pencil')
                    .setSection('insert')
                    .onClick(async () => {
                        let flow: Flow | undefined;
                        if (this.plugin.settings.ribbonCanvas) {
                            flow = await canvas.flows.update(this.plugin.settings.editorCanvas);
                        }
                        new SelectorMenuModal(this.plugin.app, this.plugin, flow, info).open();
                    });
            });
        });
}