import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { RibbonCanvasFileSelectorHandler } from "./RibbonCanvasFileSelectorHandler";
import { CommunityTemplatesModal, ManageInstalledTemplatesModal } from "application/community";
import { FolderSuggest } from "architecture/settings";

export class CommunityTemplatesBrowserHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('community_templates_browser_title');
    description = t('community_templates_browser_description');

    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { containerEl, plugin } = info;

        new Setting(containerEl)
            .setName(`${this.name} (Beta)`)
            .setDesc(this.description)
            .addButton(button =>
                button
                    .setClass('mod-cta')
                    .setButtonText(t('community_templates_browser_button_text'))
                    .onClick(() => {
                        new CommunityTemplatesModal(info.plugin).open();
                    })
            );


        new Setting(containerEl)
            .setName(`${t('manage_installed_templates_title')} (Beta)`)
            .setDesc(t('manage_installed_templates_description'))
            .addButton(button =>
                button
                    .setClass('mod-cta')
                    .setButtonText(t('manage_installed_templates_button_text'))
                    .onClick(() => {
                        new ManageInstalledTemplatesModal(info.plugin).open();
                    })
            );

        const markdown_templates_promise = async (value: string): Promise<void> => {
            // set search value
            info.plugin.settings.communitySettings.markdownTemplateFolder = value;
            // update settings
            await info.plugin.saveSettings();
        };
        new Setting(containerEl)
            .setName(t('markdown_templates_folder_title'))
            .setDesc(t('markdown_templates_folder_description'))
            .addSearch((cb) => {
                new FolderSuggest(
                    cb.inputEl
                );

                cb.setPlaceholder(t("markdown_templates_folder_placeholder"))
                    .setValue(plugin.settings.communitySettings.markdownTemplateFolder)
                    .onChange(markdown_templates_promise);
            });
        // Future token implementation for community templates access

        return this.goNext(info);
    }
    manageNextHandler() {
        this.nextHandler = new RibbonCanvasFileSelectorHandler();
    }
}