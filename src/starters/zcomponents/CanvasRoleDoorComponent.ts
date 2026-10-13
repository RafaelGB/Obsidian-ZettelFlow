import { Menu, TFile } from "obsidian";
import { CanvasView } from "obsidian/canvas";
import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import { flowFolders, flowRole, type FlowFolders } from "architecture/plugin/canvas/flowRole";
import { AssignRoleModal } from "config/modals/AssignRoleModal";
import ZettelFlow from "main";

/** The slice of Obsidian's menu the door uses — so the decision is testable without one. */
export interface MenuItemLike {
    setTitle(title: string): MenuItemLike;
    setIcon(icon: string): MenuItemLike;
    onClick(callback: () => void): MenuItemLike;
}
export interface MenuLike {
    addItem(build: (item: MenuItemLike) => void): unknown;
}

/**
 * Puts the entry in the menu when it belongs there: a canvas that does not already create notes.
 * Returns whether it did.
 */
export function canvasRoleDoorEntry(menu: MenuLike, path: string, folders: FlowFolders, open: (path: string) => void): boolean {
    if (!path.endsWith(".canvas") || flowRole(path, folders) === "create") return false;
    menu.addItem((item) =>
        item
            .setTitle(t("canvas_role_door_create"))
            .setIcon("file-plus")
            .onClick(() => open(path))
    );
    return true;
}

/**
 * **Use this canvas to create notes** — the door on the canvas itself (#793).
 *
 * The welcome screen told a newcomer to "open a canvas and give it the *Creates notes* role", and
 * the canvas had no way to do it: a canvas without a role shows nothing of ZettelFlow — no *Create
 * a step*, no empty-state card — so the one person following the instructions met a canvas that
 * ignored them. The role was only in Settings → Your flows, behind a path field.
 *
 * Now the canvas's own menu (right-click it in the file explorer, or its view's ⋯) offers the
 * role it is almost always given first. It opens the same {@link AssignRoleModal} the settings
 * use — the cost is stated before it is paid — and, once given, the open canvas grows its step
 * tools straight away instead of on its next edit.
 */
export class CanvasRoleDoorComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("file-menu", (menu: Menu, file) => {
                if (!(file instanceof TFile)) return;
                canvasRoleDoorEntry(menu, file.path, flowFolders(this.plugin.settings), (path) =>
                    new AssignRoleModal(this.plugin.app, this.plugin, path, "create", () =>
                        this.refreshOpenCanvas(path)
                    ).open()
                );
            })
        );
    }

    /** Re-fire the canvas events, so the step tools appear on the canvas that just became a flow. */
    private refreshOpenCanvas(path: string): void {
        const { workspace } = this.plugin.app;
        for (const leaf of workspace.getLeavesOfType("canvas")) {
            const view = leaf.view as CanvasView | undefined;
            if (view?.file?.path !== path || !view.canvas) continue;
            workspace.trigger("zettelflow-node-connection-drop-menu", view.canvas);
            workspace.trigger("zettelflow-canvas-render", view.canvas);
        }
    }
}
