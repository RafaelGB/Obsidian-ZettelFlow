import { log } from "architecture";
import { t } from "architecture/lang";
import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";

export class LoggerLevelHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('logger_level_title');
    description = t('logger_level_description');
    public static LOG_OPTIONS_RECORD: Record<string, string> = {
        trace: 'trace',
        debug: 'debug',
        info: 'info',
        warn: 'warn',
        error: 'error'
    }
    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        // Check if logger is enabled. If not, go to next handler
        if (!info.plugin.settings.loggerEnabled) {
            return this.goNext(info);
        }

        const logger_level_info_dropdown = async (value: string): Promise<void> => {
            // set dropdown value
            info.plugin.settings.logLevel = value;
            // update settings
            await info.plugin.saveSettings();
            log.setLevelInfo(value);
        };

        new Setting(info.containerEl)
            .setName(this.name)
            .setDesc(this.description)
            .addDropdown((dropdown) => {
                dropdown.addOptions(LoggerLevelHandler.LOG_OPTIONS_RECORD);
                dropdown.setValue(info.plugin.settings.logLevel);
                dropdown.onChange(logger_level_info_dropdown);
            });
        return this.goNext(info);
    }
}