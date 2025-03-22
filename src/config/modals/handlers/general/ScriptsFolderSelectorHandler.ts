import { t } from "architecture/lang";
import { AbstractHandlerClass } from "architecture/patterns";
import { FolderSuggest } from "architecture/settings";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";
import { MarkdownTemplatesFolderHandler } from "./MarkdownTemplatesFolderHandler";

export class ScriptsFolderSelectorHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('scripts_folder_selector_title');
    description = t('scripts_folder_selector_description');
    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { containerEl, plugin } = info;
        const source_form_promise = async (value: string): Promise<void> => {
            // set search value
            info.plugin.settings.jsLibraryFolderPath = value;
            // update settings
            await info.plugin.saveSettings();
        };

        new Setting(containerEl)
            .setName(this.name)
            .setDesc(this.description)
            .addSearch((cb) => {
                new FolderSuggest(
                    cb.inputEl
                );

                cb.setPlaceholder(t("scripts_folder_selector_placeholder"))
                    .setValue(plugin.settings.jsLibraryFolderPath)
                    .onChange(source_form_promise);
            });
        return this.goNext(info);
    }

    manageNextHandler() {
        this.nextHandler = new MarkdownTemplatesFolderHandler();
    }
}