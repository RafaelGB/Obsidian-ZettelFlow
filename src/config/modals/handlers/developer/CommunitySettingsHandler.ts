import { t } from "architecture/lang";
import { AbstractHandlerClass } from "architecture/patterns";
import { DEFAULT_SETTINGS, SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";

export class CommunitySettingsHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('community_url_title');
    description = t('community_url_description');
    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { containerEl } = info;
        new Setting(containerEl)
            .setName(this.name)
            .setDesc(this.description)
            .addText(text => text
                .setPlaceholder("https://...")
                .setValue(info.plugin.settings.communitySettings.url)
                .onChange(async (value) => {
                    info.plugin.settings.communitySettings.url = value;
                    await info.plugin.saveSettings();
                }))
            // Reset to default button
            .addButton(button => button
                .setClass('mod-cta')
                .setButtonText(t('reset_to_default'))
                .setIcon('reset')
                .onClick(async () => {
                    const defaultUrl = DEFAULT_SETTINGS.communitySettings?.url;
                    if (defaultUrl) {
                        info.plugin.settings.communitySettings.url = defaultUrl
                        await info.plugin.saveSettings();
                        await info.section?.refresh(info);
                    }
                }));

        return this.goNext(info);
    }
}