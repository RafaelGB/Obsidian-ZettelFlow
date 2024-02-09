import ZettelFlow from "main";

export class EditorMenu {
    public static setup(plugin: ZettelFlow) {
        new EditorMenu(plugin);
    }
    constructor(private plugin: ZettelFlow) {
        plugin.registerEvent(this.onContextEditor);
    }
    private onContextEditor =
        this.plugin.app.workspace.on('editor-change', (menu, file) => {
        })
}