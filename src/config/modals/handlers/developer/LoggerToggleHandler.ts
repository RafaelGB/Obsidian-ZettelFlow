import { AbstractHandlerClass } from "architecture/patterns";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";
import { LoggerLevelHandler } from "./LoggerLevelHandler";
import { log } from "architecture";
import { t } from "architecture/lang";

export class LoggerToggleHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('logger_toggle_title');
    description = t('logger_toggle_description');

    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const logger_togle_promise = async (value: boolean): Promise<void> => {
            // update service value
            log.setDebugMode(value);
            // update setting value
            info.plugin.settings.loggerEnabled = value;
            // save setting
            await info.plugin.saveSettings();
            // refresh section
            info.section?.refresh(info);
        }

        new Setting(info.containerEl)
            .setName(this.name)
            .setDesc(this.description)
            .addToggle(toggle =>
                toggle
                    .setValue(info.plugin.settings.loggerEnabled)
                    .onChange(logger_togle_promise)
            );

        return this.goNext(info);
    }

    manageNextHandler() {
        this.nextHandler = new LoggerLevelHandler();
    }
}