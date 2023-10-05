import { AbstractHandlerClass } from "architecture/patterns";
import { FILE_EXTENSIONS, FileService } from "architecture/plugin";
import { FileSuggest, HeadingSuggest } from "architecture/settings";
import { HeadingCache, Setting } from "obsidian";
import { StepBuilderModal } from "zettelkasten";
import { BacklinkElement } from "./model/BackLinkTypes";

export class BackLinkHandler extends AbstractHandlerClass<StepBuilderModal> {
    name = "Backlink";
    description = "Insert backlink to note";
    handle(settingHandlerResponse: StepBuilderModal): StepBuilderModal {
        const { info } = settingHandlerResponse;
        const { element, contentEl } = info
        const { type, hasDefault, defaultFile = "", defaultHeading } = element as BacklinkElement;
        if (type === "backlink") {
            contentEl.createEl("h3", { text: this.name });
            contentEl.createEl("p", { text: this.description });
            new Setting(contentEl)
                .setName("Target folder")
                .setDesc("Note to insert backlink")
                .addToggle((toggle) => {
                    toggle
                        .setValue(hasDefault)
                        .onChange(async (value) => {
                            element.hasDefault = value;
                            element.isAction = !value;
                            settingHandlerResponse.refresh();
                        })
                });

            if (hasDefault) {
                new Setting(contentEl)
                    .setName("Target file")
                    .setDesc("Note to insert backlink")
                    .addSearch((cb) => {
                        new FileSuggest(
                            cb.inputEl,
                            FileService.PATH_SEPARATOR,
                        ).setExtensions(FILE_EXTENSIONS.ONLY_MD);

                        cb.setPlaceholder("Default file")
                            .setValue(defaultFile)
                            .onChange(async (value) => {
                                element.defaultFile = value;
                                settingHandlerResponse.refresh();
                            });
                    });
            }
            if (defaultFile) {
                new Setting(contentEl)
                    .setName("Heading")
                    .setDesc("Heading to insert backlink")
                    .addSearch((cb) => {
                        new HeadingSuggest(
                            cb.inputEl,
                            defaultFile,
                        );

                        cb.setPlaceholder("Heading...")
                            .setValue(defaultHeading?.heading || "")
                            .onChange(async (value) => {
                                const heading: HeadingCache = JSON.parse(value);
                                element.defaultHeading = heading;
                            });
                    });
            }

        }
        return this.goNext(settingHandlerResponse);
    }
}