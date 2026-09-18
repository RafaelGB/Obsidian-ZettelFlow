import { Menu, TFile } from "obsidian";
import { PluginComponent } from "architecture";
import { activateSurface } from "architecture/plugin";
import { t } from "architecture/lang";
import ZettelFlow from "main";

/**
 * The door from a note into the Lab (#473, epic #472).
 *
 * Cultivate assumes you already know what you want to add: it offers *write the counterpoint*,
 * and if at that moment you do not know, there is nowhere to go. The Lab has the mirror-image
 * gap — a room you must remember to walk into, with no way to arrive **from** anything, so a
 * doubt about the note on your screen has to be retyped from memory. Most never are.
 *
 * This is the door. It carries the note across as the thread's **subject** and writes **nothing**
 * to it: leaving a question unanswered is not an edit, and a bridge that dirties your vault is a
 * bridge nobody crosses twice.
 */
export class ThinkAboutComponent extends PluginComponent {
    constructor(plugin: ZettelFlow) {
        super(plugin);
        this.plugin = plugin;
    }

    private plugin: ZettelFlow;

    onLoad(): void {
        this.plugin.addCommand({
            id: "think-about-this-note",
            name: t("command_think_about"),
            checkCallback: (checking: boolean) => {
                const file = this.plugin.app.workspace.getActiveFile();
                if (!file || file.extension !== "md") return false;
                if (!checking) thinkAbout(this.plugin, file.path);
                return true;
            },
        });

        this.plugin.registerEvent(
            this.plugin.app.workspace.on("file-menu", (menu: Menu, file) => {
                if (!(file instanceof TFile) || file.extension !== "md") return;
                menu.addItem((item) =>
                    item
                        .setTitle(t("command_think_about"))
                        .setIcon("lightbulb")
                        .onClick(() => thinkAbout(this.plugin, file.path))
                );
            })
        );
    }
}

/** Open the Lab with this note as the thread's subject. Writes nothing to the note. */
export function thinkAbout(plugin: ZettelFlow, path: string): void {
    void activateSurface(plugin.app, "zettelflow-home", "lab", { about: path });
}
