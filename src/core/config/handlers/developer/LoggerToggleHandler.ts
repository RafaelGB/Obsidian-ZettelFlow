import { AbstractHandler, AbstractHandlerClass } from "architecture/patterns";
import { log } from "core";
import { SettingsHandlerInfo } from "core/config/model/SettingsTabModel";
import { Setting } from "obsidian";

export class LoggerToggleHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = 'logger-toggle';
    description = 'Toggle logger';
    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const logger_togle_promise = async (value: boolean): Promise<void> => {
            // update service value
            log.setDebugMode(value);
            // update setting value
            info.plugin.settings.loggerEnabled = value;
            // save setting
            await info.plugin.saveSettings();
        }

        new Setting(info.containerEl)
        .setName(this.name)
        .setDesc(this.description)
        .addToggle(toggle =>
            toggle
                .setValue(info.plugin.settings.loggerEnabled)
                .onChange(logger_togle_promise)
        );
        
        
        return info;
    }
}