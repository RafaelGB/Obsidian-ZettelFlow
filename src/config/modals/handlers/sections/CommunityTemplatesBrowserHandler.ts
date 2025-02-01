import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { RibbonCanvasFileSelectorHandler } from "./RibbonCanvasFileSelectorHandler";
import { CommunityTemplatesModal, ManageInstalledTemplatesModal } from "application/community";

export class CommunityTemplatesBrowserHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('community_templates_browser_title');
    description = t('community_templates_browser_description');

    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { containerEl } = info;

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
        return this.goNext(info);
    }
    manageNextHandler() {
        this.nextHandler = new RibbonCanvasFileSelectorHandler();
    }
}