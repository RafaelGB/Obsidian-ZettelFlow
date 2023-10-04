import { AbstractHandlerClass } from "architecture/patterns";
import { FILE_EXTENSIONS, FileService } from "architecture/plugin";
import { FileSuggest } from "architecture/settings";
import { Setting } from "obsidian";
import { SectionElement, StepBuilderModal } from "zettelkasten";
type BacklinkElement = {
    hasDefault: boolean,
    defaultFile?: string,
} & SectionElement;
export class BackLinkHandler extends AbstractHandlerClass<StepBuilderModal> {
    name = "Backlink";
    description = "Backlink";
    handle(settingHandlerResponse: StepBuilderModal): StepBuilderModal {
        const { info } = settingHandlerResponse;
        const { element, contentEl } = info
        const { type, hasDefault, defaultFile = "" } = element as BacklinkElement;
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
                            });
                    });
            }
        }
        return this.goNext(settingHandlerResponse);
    }
}