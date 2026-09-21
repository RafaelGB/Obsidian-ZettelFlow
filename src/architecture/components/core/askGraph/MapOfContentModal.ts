import { App, Modal, Notice, Setting } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { createMapOfContent } from "architecture/plugin/explore/createMapOfContent";
import { MAP_ENTRY_LIMIT, type MapRequest } from "application/explore/mapOfContent";
import { FolderSuggest } from "architecture/settings/suggesters/FolderSuggest";

/**
 * The map, before it exists (#486, epic #481).
 *
 * Nothing happens until you say so, and cancelling changes nothing at all. The name and the folder
 * are **proposed, never imposed** — the name is seeded from the query because that is what makes a
 * map recognisable later, and both are editable right here. That editability is the whole of
 * [§XIII](../../../../../docs/development/constitution.md) for this feature: no new setting was
 * added, because the form is the place to author it.
 *
 * It states the counts before you decide, including how many a long selection will leave out — a
 * cap you can see is a fact; a cap you cannot is a silent truncation.
 */
export class MapOfContentModal extends Modal {
    private name: string;
    private folder: string;

    constructor(
        app: App,
        private readonly request: Omit<MapRequest, "name">,
        /** The query the selection came from — the seed for the name, nothing more. */
        query: string,
        private readonly onDone: (path: string) => void
    ) {
        super(app);
        this.name = query.trim() || t("explore_map_default_name");
        this.folder = app.workspace.getActiveFile()?.parent?.path ?? "";
        if (this.folder === "/") this.folder = "";
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass(c("explore-map"));
        contentEl.createEl("h2", { text: t("explore_map_title") });

        const listed = Math.min(this.request.matches.length, MAP_ENTRY_LIMIT);
        contentEl.createDiv({
            cls: c("explore-map-count"),
            text:
                this.request.matches.length > listed
                    ? t("explore_map_count_capped", String(listed), String(this.request.matches.length))
                    : t("explore_map_count", String(listed)),
        });

        new Setting(contentEl).setName(t("explore_map_name")).addText((text) =>
            text.setValue(this.name).onChange((value) => (this.name = value))
        );
        new Setting(contentEl).setName(t("explore_map_folder")).addText((text) => {
            text.setValue(this.folder).onChange((value) => (this.folder = value));
            new FolderSuggest(text.inputEl);
        });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText(t("explore_map_cancel")).onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText(t("explore_map_create"))
                    .setCta()
                    .onClick(() => void this.create())
            );
    }

    private async create(): Promise<void> {
        const path = await createMapOfContent({
            ...this.request,
            name: this.name,
            folder: this.folder.trim(),
            heading: t("moc_heading_default"),
        });
        this.close();
        if (!path) {
            new Notice(t("explore_map_failed"));
            return;
        }
        new Notice(t("explore_map_created", String(Math.min(this.request.matches.length, MAP_ENTRY_LIMIT))));
        this.onDone(path);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
