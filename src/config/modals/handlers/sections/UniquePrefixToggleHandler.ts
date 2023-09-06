import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/model/SettingsTabModel";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { UniquePrefixPatternHandler } from "./UniquePrefixPatternHandler";

export class UniquePrefixToggleHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('unique_prefix_toggle_title');
    description = t('unique_prefix_toggle_description');

    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const prefix_toggle_promise = async (value: boolean): Promise<void> => {
            // Enable/Disable prefix
            info.plugin.settings.uniquePrefixEnabled = value;
            // refresh section
            info.section?.refresh(info);
        }

        new Setting(info.containerEl)
            .setName(this.name)
            .setDesc(this.description)
            .addToggle(toggle =>
                toggle
                    .setValue(info.plugin.settings.uniquePrefixEnabled)
                    .onChange(prefix_toggle_promise)
            );

        return this.goNext(info);
    }

    public manageNextHandler(): void {
        this.nextHandler = new UniquePrefixPatternHandler();
    }
}