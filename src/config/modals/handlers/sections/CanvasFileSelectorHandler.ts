import { t } from "architecture/lang";
import { AbstractHandlerClass } from "architecture/patterns";
import { FILE_EXTENSIONS } from "architecture/plugin/services/FileService";
import { FileSuggest } from "architecture/settings";
import { SettingsHandlerInfo } from "config/model/SettingsTabModel";
import { Setting } from "obsidian";

export class CanvasFileSelectorHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('canvas_file_selector_title');
    description = t('canvas_file_selector_description');
    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { containerEl, plugin } = info;
        const source_form_promise = async (value: string): Promise<void> => {
            // set search value
            info.plugin.settings.canvasFilePath = value;
            // update settings
            await info.plugin.saveSettings();
        };

        new Setting(containerEl)
            .setName(this.name)
            .setDesc(this.description)
            .addSearch((cb) => {
                new FileSuggest(
                    cb.inputEl,
                    "/",
                ).setExtensions(FILE_EXTENSIONS.ONLY_CANVAS);

                cb.setPlaceholder(t("canvas_file_selector_placeholder"))
                    .setValue(plugin.settings.canvasFilePath)
                    .onChange(source_form_promise);
            });
        return this.goNext(info);
    }
}