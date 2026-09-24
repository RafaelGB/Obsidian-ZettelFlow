import { Menu, TFile } from "obsidian";
import { PluginComponent } from "architecture";
import { t } from "architecture/lang";
import { isPathExcluded, scopeExcludedPaths } from "architecture/knowledge/scope/knowledgeScope";
import { ClaimDoorModal } from "architecture/components/core/claims/ClaimDoorModal";
import ZettelFlow from "main";

/** The slice of Obsidian's `MenuItem` this entry uses — so the rule can be tested without a vault. */
export interface MenuItemLike {
    setTitle(title: string): MenuItemLike;
    setIcon(icon: string): MenuItemLike;
    onClick(handler: () => void): MenuItemLike;
}

/** The slice of Obsidian's `Menu` this entry uses. `Menu` itself is not in the test mock. */
export interface MenuLike {
    addItem(build: (item: MenuItemLike) => void): unknown;
}

/**
 * The entry itself, pure enough to test: whether it was offered, and to whom.
 *
 * Returns `false` — and adds nothing — for anything that is not a note inside the knowledge scope.
 * An excluded path never becomes an idea (#311), so it never carries a claim, and a refusal you
 * cannot see is an invisible failure in a different place (#496). Absent, never disabled.
 */
export function claimDoorEntry(
    menu: MenuLike,
    path: string,
    excluded: string[],
    open: (path: string) => void
): boolean {
    if (!path.endsWith(".md")) return false;
    if (isPathExcluded(path, excluded)) return false;
    menu.addItem((item) =>
        item
            .setTitle(t("claim_door_menu"))
            .setIcon("quote")
            .onClick(() => open(path))
    );
    return true;
}

/**
 * The claim gets a door (#561, epic #558).
 *
 * The `claim` field has existed since #148 and nobody has ever written one, because the only way to
 * was to type YAML into a note by hand — the failure §XIII is written for. This is the correction,
 * and it is deliberately **not** a command: the palette is where you go looking for something you
 * know is there, never where you discover anything (#496).
 *
 * So it goes where the moves already are — you right-click the note you are reading, or its tab, or
 * its file — and it opens one sentence box. Two listeners cover all three places, because a tab
 * header's context menu fires `file-menu` too.
 */
export class ClaimDoorComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("editor-menu", (menu: Menu, _editor, view) => {
                const path = view.file?.path;
                if (path) claimDoorEntry(menu, path, this.excluded(), (target) => this.open(target));
            })
        );
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("file-menu", (menu: Menu, file) => {
                if (file instanceof TFile) {
                    claimDoorEntry(menu, file.path, this.excluded(), (target) => this.open(target));
                }
            })
        );
    }

    private excluded(): string[] {
        return scopeExcludedPaths(this.plugin.settings);
    }

    private open(path: string): void {
        const file = this.plugin.app.vault.getFileByPath(path);
        if (file instanceof TFile) new ClaimDoorModal(this.plugin.app, file).open();
    }
}
