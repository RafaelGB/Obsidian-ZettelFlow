import { FILE_EXTENSIONS, FileService } from "architecture/plugin";
import { FileSuggest, HeadingSuggest } from "architecture/settings";
import { HeadingCache, Setting } from "obsidian";
import { BacklinkElement } from "./typing";
import { t } from "architecture/lang";
import { Action, ActionSetting } from "architecture/api";
import { AbstractStepModal } from "zettelkasten/modals/AbstractStepModal";
import { navbarAction } from "architecture/components/settings";

export const backlinkSettings: ActionSetting = (contentEl, modal, action) => {
    const name = t('step_builder_element_type_backlink_title');
    const description = t('step_builder_element_type_backlink_description');
    navbarAction(contentEl, name, description, action, modal);

    const backlinkContentEl = contentEl.createDiv();
    backlinkDetails(modal, action, backlinkContentEl);
}

export function backlinkDetails(modal: AbstractStepModal, action: Action, contentEl: HTMLElement, readonly: boolean = false): void {
    const { info } = modal;
    const { optional } = info
    const { hasDefault, insertPattern = "{{wikilink}}", defaultFile = "", defaultHeading } = action as BacklinkElement;
    const patternElement = new Setting(contentEl)
        .setName(t('step_builder_element_type_backlink_insert_pattern_title'))
        .setDesc(t('step_builder_element_type_backlink_insert_pattern_description').concat(insertPattern.replace("{{wikilink}}", "[[note link]]")))
    patternElement.addText((text) => {
        text
            .setDisabled(readonly)
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
                .setDisabled(readonly)
                .setValue(hasDefault)
                .onChange(async (value) => {
                    action.hasDefault = value;
                    if (value) {
                        action.hasUI = optional === true;
                    } else {
                        action.defaultFile = "";
                        action.defaultHeading = {};
                    }
                    refresh(modal, action, contentEl);
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

                cb
                    .setDisabled(readonly)
                    .setPlaceholder(t('step_builder_element_type_backlink_search_file_placeholder'))
                    .setValue(defaultFile)
                    .onChange(async (value) => {
                        action.defaultFile = value;
                    });
                cb.inputEl.onblur = () => {
                    if (!cb.inputEl.value) {
                        action.defaultHeading = {};
                    }
                    refresh(modal, action, contentEl);
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
                    cb
                        .setDisabled(readonly)
                        .setPlaceholder(t('step_builder_element_type_backlink_search_file_heading_placeholder'))
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

function refresh(settingHandlerResponse: AbstractStepModal, action: Action, contentEl: HTMLElement): void {
    contentEl.empty();
    backlinkDetails(settingHandlerResponse, action, contentEl);
}