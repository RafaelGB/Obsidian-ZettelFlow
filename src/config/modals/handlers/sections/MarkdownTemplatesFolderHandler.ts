import { t } from "architecture/lang";
import { AbstractHandlerClass } from "architecture/patterns";
import { FolderSuggest } from "architecture/settings";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";

export class MarkdownTemplatesFolderHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('markdown_templates_folder_title');
    description = t('markdown_templates_folder_description');

    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { containerEl, plugin } = info;
        const markdown_templates_promise = async (value: string): Promise<void> => {
            // set search value
            info.plugin.settings.communitySettings.markdownTemplateFolder = value;
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

                cb.setPlaceholder(t("markdown_templates_folder_placeholder"))
                    .setValue(plugin.settings.communitySettings.markdownTemplateFolder)
                    .onChange(markdown_templates_promise);
            });

        return this.goNext(info);
    }
}