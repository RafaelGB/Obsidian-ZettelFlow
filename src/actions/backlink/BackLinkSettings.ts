import { FILE_EXTENSIONS, FileService } from "architecture/plugin";
import { FileSuggest, HeadingSuggest } from "architecture/settings";
import { HeadingCache, Setting } from "obsidian";
import { BacklinkElement } from "./model/BackLinkTypes";
import { t } from "architecture/lang";
import { ActionSetting } from "architecture/api";

export const backlinkSettings: ActionSetting = (contentEl, settingHandlerResponse, action) => {

    const { info } = settingHandlerResponse;
    const { optional } = info
    const { hasDefault, insertPattern = "{{wikilink}}", defaultFile = "", defaultHeading } = action as BacklinkElement;
    const name = t('step_builder_element_type_backlink_title');
    const description = t('step_builder_element_type_backlink_description');
    contentEl.createEl("h3", { text: name });
    contentEl.createEl("p", { text: description });
    const patternElement = new Setting(contentEl)
        .setName(t('step_builder_element_type_backlink_insert_pattern_title'))
        .setDesc(t('step_builder_element_type_backlink_insert_pattern_description').concat(insertPattern.replace("{{wikilink}}", "[[note link]]")))
    patternElement.addText((text) => {
        text
            .setPlaceholder('{{wikilink}}')
            .setValue(insertPattern)
            .onChange(async (value) => {
                action.insertPattern = value;
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
                    action.hasDefault = value;
                    if (value) {
                        action.hasUI = optional === true;
                    } else {
                        action.defaultFile = "";
                        action.defaultHeading = {};
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
                        action.defaultFile = value;
                    });
                cb.inputEl.onblur = () => {
                    if (!cb.inputEl.value) {
                        action.defaultHeading = {};
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
                                action.defaultHeading = heading;
                            }
                        });
                });
        }
    }
}