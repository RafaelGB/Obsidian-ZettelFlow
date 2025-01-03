import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";
import { t } from "architecture/lang";

export class TableOfContentToggleHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('table_of_content_toggle_title');
    description = t('table_of_content_toggle_description');

    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { tableOfContentEnabled } = info.plugin.settings;
        const prefix_toggle_promise = async (value: boolean): Promise<void> => {
            // Enable/Disable prefix
            info.plugin.settings.tableOfContentEnabled = value;
            // update settings
            await info.plugin.saveSettings();
        }

        new Setting(info.containerEl)
            .setName(this.name)
            .setDesc(this.description)
            .addToggle(toggle =>
                toggle
                    .setValue(tableOfContentEnabled)
                    .onChange(prefix_toggle_promise)
            );

        return this.goNext(info);
    }
}