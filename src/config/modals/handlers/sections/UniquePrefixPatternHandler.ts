import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";
import { t } from "architecture/lang";
import { DEFAULT_SETTINGS } from "config";
import moment from "moment";
import { ScriptsFolderSelectorHandler } from "./ScriptsFolderSelectorHandler";

export class UniquePrefixPatternHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('unique_prefix_pattern_title');
    description = t('unique_prefix_pattern_description');

    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { uniquePrefixEnabled } = info.plugin.settings;
        if (uniquePrefixEnabled) {
            const prefix_toggle_promise = (pattern: Setting) => async (value: string): Promise<void> => {
                // Enable/Disable prefix
                info.plugin.settings.uniquePrefix = value;
                pattern.setDesc(this.buildDescription(value));
            }


            const pattern = new Setting(info.containerEl)
                .setName(this.name)
                .setDesc(this.buildDescription(info.plugin.settings.uniquePrefix || DEFAULT_SETTINGS.uniquePrefix || ''))
            pattern.addText(text =>
                text
                    .setValue(info.plugin.settings.uniquePrefix)
                    .onChange(prefix_toggle_promise(pattern))
                    .setPlaceholder(DEFAULT_SETTINGS.uniquePrefix || '')
            );
        }
        return this.goNext(info);
    }
    private buildDescription(patten: string): string {
        return t('unique_prefix_pattern_description')
            .concat(`\n${t('unique_prefix_pattern_helper')}: ${moment().format(patten)}`);
    }

    manageNextHandler() {
        this.nextHandler = new ScriptsFolderSelectorHandler();
    }
}