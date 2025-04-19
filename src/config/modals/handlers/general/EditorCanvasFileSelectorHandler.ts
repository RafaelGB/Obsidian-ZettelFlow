import { t } from "architecture/lang";
import { AbstractHandlerClass } from "architecture/patterns";
import { FILE_EXTENSIONS, FileService } from "architecture/plugin/services/FileService";
import { FileSuggest } from "architecture/settings";
import { SettingsHandlerInfo } from "config/typing";
import { Setting } from "obsidian";
import { UniquePrefixToggleHandler } from "./UniquePrefixToggleHandler";
import { c } from "architecture";

export class EditorCanvasFileSelectorHandler extends AbstractHandlerClass<SettingsHandlerInfo> {
    name = t('editor_canvas_file_selector_title');
    description = t('editor_canvas_file_selector_description');
    handle(info: SettingsHandlerInfo): SettingsHandlerInfo {
        const { containerEl, plugin } = info;

        new Setting(containerEl)
            .setName(this.name)
            .setDesc(this.description)
            .setClass(c('readable-setting-item'))
            .addSearch((cb) => {
                new FileSuggest(
                    cb.inputEl,
                    FileService.PATH_SEPARATOR,
                ).setExtensions(FILE_EXTENSIONS.ONLY_CANVAS);

                cb.setPlaceholder(t("canvas_file_selector_placeholder"))
                    .setValue(plugin.settings.editorCanvas)
                    .onChange(async (value) => {
                        // set search value
                        info.plugin.settings.editorCanvas = value;
                        // update settings
                        await info.plugin.saveSettings();
                    });

            });
        return this.goNext(info);
    }

    manageNextHandler() {
        this.nextHandler = new UniquePrefixToggleHandler();
    }
}