import { AbstractHandlerClass } from "architecture/patterns";
import { FILE_EXTENSIONS, FileService } from "architecture/plugin";
import { FileSuggest, HeadingSuggest } from "architecture/settings";
import { HeadingCache, Setting } from "obsidian";
import { StepBuilderModal } from "zettelkasten";
import { BacklinkElement } from "./model/BackLinkTypes";
import { t } from "architecture/lang";

export class BackLinkHandler extends AbstractHandlerClass<StepBuilderModal> {
    name = t('step_builder_element_type_backlink_title');
    description = t('step_builder_element_type_backlink_description');
    handle(settingHandlerResponse: StepBuilderModal): StepBuilderModal {
        const { info } = settingHandlerResponse;
        const { element, contentEl, optional } = info
        const { type, hasDefault, insertPattern = "{{wikilink}}", defaultFile = "", defaultHeading } = element as BacklinkElement;
        if (type === "backlink") {
            contentEl.createEl("h3", { text: this.name });
            contentEl.createEl("p", { text: this.description });
            const patternElement = new Setting(contentEl)
                .setName(t('step_builder_element_type_backlink_insert_pattern_title'))
                .setDesc(t('step_builder_element_type_backlink_insert_pattern_description').concat(insertPattern.replace("{{wikilink}}", "[[note link]]")))
            patternElement.addText((text) => {
                text
                    .setPlaceholder('{{wikilink}}')
                    .setValue(insertPattern)
                    .onChange(async (value) => {
                        element.insertPattern = value;
                        patternElement
                            .descEl
                            .setText(t('step_builder_element_type_backlink_insert_pattern_description').concat(value.replace("{{wikilink}}", "[[note link]]")));
                    });
            });
            new Setting(contentEl)
                .setName(t('step_builder_element_type_backlink_trigger_default_title'))
                .setDesc(t('step_builder_element_type_backlink_trigger_default_description'))
                .addToggle((toggle) => {
                    toggle
                        .setValue(hasDefault)
                        .onChange(async (value) => {
                            element.hasDefault = value;
                            if (value) {
                                element.hasUI = optional === true;
                            } else {
                                element.defaultFile = "";
                                element.defaultHeading = {};
                            }
                            settingHandlerResponse.refresh();
                        })
                });

            if (hasDefault) {
                new Setting(contentEl)
                    .setName(t('step_builder_element_type_backlink_search_file_title'))
                    .setDesc(t('step_builder_element_type_backlink_search_file_description'))
                    .addSearch((cb) => {
                        new FileSuggest(
                            cb.inputEl,
                            FileService.PATH_SEPARATOR,
                        ).setExtensions(FILE_EXTENSIONS.ONLY_MD);

                        cb.setPlaceholder(t('step_builder_element_type_backlink_search_file_placeholder'))
                            .setValue(defaultFile)
                            .onChange(async (value) => {
                                element.defaultFile = value;
                            });
                        cb.inputEl.onblur = () => {
                            if (!cb.inputEl.value) {
                                element.defaultHeading = {};
                            }
                            settingHandlerResponse.refresh();
                        }
                    });

                if (defaultFile) {
                    new Setting(contentEl)
                        .setName(t('step_builder_element_type_backlink_search_file_heading_title'))
                        .setDesc(t('step_builder_element_type_backlink_search_file_heading_description'))
                        .addSearch((cb) => {
                            new HeadingSuggest(
                                cb.inputEl,
                                defaultFile,
                            );
                            cb.setPlaceholder(t('step_builder_element_type_backlink_search_file_heading_placeholder'))
                                .setValue(defaultHeading?.heading || "")
                                .onChange(async () => {
                                    if (cb.inputEl.dataset.heading) {
                                        const heading: HeadingCache = JSON.parse(cb.inputEl.dataset.heading);
                                        element.defaultHeading = heading;
                                    }
                                });
                        });
                }
            }

        }
        return this.goNext(settingHandlerResponse);
    }
}